#!/bin/sh
# Yume Forge — convert the raw audio sources into the shipped wavs.
#
#     sh tools/convert-sounds.sh
#
# Inputs come from sources/sounds/ (the user's originals: 32-bit float stereo
# wavs, mp3s, and a chirp that arrived as an mp3 stream inside a .mov).
# Outputs are 16-bit mono 44.1 kHz, every file peak-normalized to −6 dB so
# relative loudness lives ONLY in content.js's SOUND_VOLUMES map.
#
# The gains below were measured with `ffmpeg -af volumedetect` against these
# exact sources (hover peaked at −1.9, select at −12.3 — an 11 dB mismatch
# that made hovering drown clicking). If a source file is ever replaced,
# re-measure rather than trusting these numbers.
#
# step.wav and jump.wav are not conversions — they are synthesized by
# tools/gen-chip-sfx.py.

set -e
cd "$(dirname "$0")/.."

SRC="sources/sounds"
OUT="sounds"

# UI blips: peaks matched at −6 dB.
ffmpeg -y -v error -i "$SRC/mouse over.wav" -af "volume=-4.1dB" \
  -ac 1 -sample_fmt s16 -ar 44100 "$OUT/hover.wav"
ffmpeg -y -v error -i "$SRC/selected.wav" -af "volume=6.3dB" \
  -ac 1 -sample_fmt s16 -ar 44100 "$OUT/select.wav"

# Party falls (A4/A5/A6 -> fall-1/2/3): leading silence trimmed, −6 dB peak.
for pair in "A4:fall-1" "A5:fall-2" "A6:fall-3"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  ffmpeg -y -v error -i "$SRC/$src.mp3" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,volume=-0.4dB" \
    -ac 1 -sample_fmt s16 -ar 44100 "$OUT/$dst.wav"
done

# Chocobo chirp: mp3-in-a-mov, silence trimmed from BOTH ends (reverse trick).
ffmpeg -y -v error -i "$SRC/choco-chirp.mov" \
  -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,volume=0.4dB" \
  -ac 1 -sample_fmt s16 -ar 44100 "$OUT/chirp.wav"

echo "converted: hover select fall-1 fall-2 fall-3 chirp  (step/jump come from gen-chip-sfx.py)"
