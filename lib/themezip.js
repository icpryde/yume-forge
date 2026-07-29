// Yume Forge — minimal ZIP reader, so a zipped theme imports directly.
//
// Handing someone a .zip is the natural way to share a theme, and asking them
// to unzip it first before the extension will look at it is a papercut on the
// one step that should be frictionless. This reads the archive in the popup
// instead.
//
// No library: the browser already ships an inflater as
// DecompressionStream("deflate-raw"), which is exactly the raw DEFLATE stream a
// zip entry stores. All that's left is walking the central directory.
//
// Deliberately not a general-purpose unzipper — it reads what `zip` and macOS
// Archive Utility produce, and says so plainly when it meets anything else
// (zip64, encryption, an unknown compression method) rather than returning
// half a file.
(() => {
  "use strict";

  const SIG_EOCD = 0x06054b50;
  const SIG_CDIR = 0x02014b50;
  const SIG_LOCAL = 0x04034b50;

  const dec = new TextDecoder("utf-8");

  /** Is this byte array a zip? Checked by magic, not by filename. */
  function looksLikeZip(bytes) {
    // "PK\x03\x04" (normal) or "PK\x05\x06" (an empty archive).
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
  }

  /**
   * Find the End Of Central Directory record.
   *
   * It sits at the very end unless the archive carries a trailing comment, so
   * scan backwards over the largest comment a zip can have (0xFFFF) plus the
   * record itself. Scanning forwards for the signature would be wrong: the
   * four bytes can legitimately occur inside compressed data.
   */
  function findEocd(view, len) {
    const min = Math.max(0, len - 0xffff - 22);
    for (let i = len - 22; i >= min; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) return i;
    }
    return -1;
  }

  /**
   * List the entries in a zip.
   * @param {Uint8Array} bytes
   * @returns {Array<{name: string, method: number, offset: number, size: number, csize: number}>}
   */
  function entries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(view, bytes.length);
    if (eocd < 0) throw new Error("That zip looks damaged — no directory in it.");

    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    if (p === 0xffffffff || count === 0xffff) {
      throw new Error("That zip uses zip64, which this importer can't read.");
    }

    const out = [];
    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== SIG_CDIR) break;
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const csize = view.getUint32(p + 20, true);
      const size = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const cmtLen = view.getUint16(p + 32, true);
      const offset = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      // Bit 0 is the encryption flag. An encrypted entry inflates to garbage
      // rather than failing, so drop it here instead of downstream — but keep
      // a count, because "we skipped everything" and "the archive was empty"
      // need different things said to the user.
      if (flags & 1) out.encrypted = (out.encrypted || 0) + 1;
      else out.push({ name, method, offset, size, csize });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }

  /** Read one entry's bytes, inflating if it's deflated. */
  async function read(bytes, entry) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(entry.offset, true) !== SIG_LOCAL) {
      throw new Error("That zip looks damaged — a file header is missing.");
    }
    // The local header's own name/extra lengths are authoritative; the central
    // directory's extra field is frequently a different length.
    const nameLen = view.getUint16(entry.offset + 26, true);
    const extraLen = view.getUint16(entry.offset + 28, true);
    const start = entry.offset + 30 + nameLen + extraLen;
    const raw = bytes.subarray(start, start + entry.csize);

    if (entry.method === 0) return raw;            // stored
    if (entry.method !== 8) {
      throw new Error(`That zip uses compression method ${entry.method}, which this importer can't read.`);
    }
    try {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // A corrupt deflate stream rejects with a bare "TypeError: Failed to
      // fetch" — which reaches the user as a toast that reads like a network
      // problem and sends them looking in entirely the wrong place.
      throw new Error(`Couldn't unpack "${entry.name}" — the zip looks corrupted. Try downloading it again.`);
    }
  }

  /**
   * Pull the theme out of a zipped bundle.
   *
   * Prefers a .yume.json, then any .json, then a .txt holding a YUME1 code —
   * which is the order of "most certainly the theme" and means the bundle can
   * carry a README without confusing anything. Directory entries and the
   * __MACOSX/ resource forks macOS adds are skipped; a ._foo.json resource fork
   * would otherwise be picked up as the theme and fail to parse.
   */
  /** Does this text plausibly hold a theme? Cheap, and never throws. */
  function isTheme(text) {
    const t = text.trim();
    if (t.startsWith("YUME1:")) return true;
    if (!t.startsWith("{")) return false;
    try {
      const o = JSON.parse(t);
      return !!o && typeof o === "object" && (o.tokens || o.rawCss);
    } catch { return false; }
  }

  async function extractTheme(bytes) {
    const listed = entries(bytes);
    const all = listed.filter((e) =>
      !e.name.endsWith("/") &&
      !e.name.startsWith("__MACOSX/") &&
      !e.name.split("/").pop().startsWith("._"));

    if (!all.length && listed.encrypted) {
      throw new Error("That zip is password-protected, so its contents can't be read.");
    }

    // Priority order, then VALIDATE. Taking the first plain .json on trust
    // meant that picking the extension archive by mistake fed manifest.json
    // straight to the theme parser, and the user got "Theme code is missing
    // its palette." — technically true, and no help at all. Trying each
    // candidate in turn also means a bundle whose theme sits in a nested
    // folder, or which ships only a .yume.txt code, still resolves.
    const base = (e) => e.name.split("/").pop().toLowerCase();
    const rank = (e) =>
      /\.yume\.json$/.test(base(e)) ? 0 :
      /\.yume\.txt$/.test(base(e)) ? 1 :
      /\.json$/.test(base(e)) ? 2 :
      /\.txt$/.test(base(e)) ? 3 : 4;

    const candidates = all.filter((e) => rank(e) < 4).sort((a, b) => rank(a) - rank(b));

    let readError = null;
    for (const e of candidates) {
      let text;
      // One unreadable entry shouldn't sink the whole import when a later
      // candidate would have worked — a bundle carrying both a .yume.json and
      // a .yume.txt of the same theme survives one of them being damaged.
      try {
        text = dec.decode(await read(bytes, e));
      } catch (err) {
        readError = err;
        continue;
      }
      if (isTheme(text)) return text;
    }

    if (listed.encrypted) {
      throw new Error("That zip is password-protected, so its contents can't be read.");
    }
    // If nothing was readable, say THAT rather than "no theme inside" — the
    // archive may well contain the theme, just damaged, and those two need
    // completely different things from the user.
    if (readError && candidates.length) throw readError;
    throw new Error(
      candidates.length
        ? "That zip doesn't contain a theme — no .yume.json or YUME1 code inside it."
        : "That zip has no theme in it — expected a .yume.json."
    );
  }

  globalThis.YumeZip = { looksLikeZip, entries, read, extractTheme };
})();
