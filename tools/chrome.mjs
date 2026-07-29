// Yume Forge — locate a headless-capable Chrome.
//
// Four test suites drive a real browser, and each used to hardcode
// "/Applications/Google Chrome.app/…". That is fine on the machine this was
// built on and nowhere else: anyone on Linux or Windows, or on a Mac with
// Chrome somewhere other than /Applications, gets an ENOENT from execFile with
// no hint about what to install or where to point it.
//
// Set CHROME=/path/to/binary to override.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

export function findChrome() {
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  // Thrown, not returned: every caller needs a browser, and a null would just
  // surface later as a confusing ENOENT from execFile.
  throw new Error(
    "No Chrome-family browser found. These suites drive a real browser.\n" +
    "Set CHROME=/path/to/chrome, or install Google Chrome.\n" +
    "Looked in:\n  " + CANDIDATES.join("\n  ")
  );
}
