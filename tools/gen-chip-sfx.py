#!/usr/bin/env python3
"""Yume Forge — synthesize the chocobo's chip-style effects.

    python3 tools/gen-chip-sfx.py

No suitable 8/16-bit footstep or jump could be found, so this makes both:

  step.wav — a 45 ms tap: triangle wave dropping 190→115 Hz (the thump), a
             whisper of noise in the first 6 ms (the contact), fast decay so
             taps at run cadence never smear.
  jump.wav — a 110 ms boing: triangle sweeping UP 150→430 Hz with a gentler
             decay — the classic platformer leap, kept small.

Output: 16-bit mono 44.1 kHz, peak-normalized to −6 dB to match the rest of
the set. Runtime subtlety comes from the per-sound volume map in content.js,
not from the files.
"""

import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SR = 44100
TARGET_PEAK = 10 ** (-6 / 20)  # −6 dBFS, matching the converted set

random.seed(64)                # deterministic output — these files are committed


def render(name, dur, f0, f1, decay, noise_ms):
    n = int(SR * dur)
    samples = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        k = i / n
        freq = f0 + (f1 - f0) * k
        phase += freq / SR
        # Triangle wave: the NES's softer voice, less buzzy than a square.
        tri = 4.0 * abs((phase % 1.0) - 0.5) - 1.0
        env = math.exp(-decay * t)
        s = tri * env
        if t < noise_ms / 1000.0:
            s += random.uniform(-1, 1) * 0.35 * (1.0 - t / (noise_ms / 1000.0))
        samples.append(s)

    peak = max(abs(s) for s in samples)
    samples = [s / peak * TARGET_PEAK for s in samples]
    out = ROOT / f"sounds/{name}.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(
            struct.pack("<h", max(-32768, min(32767, round(s * 32767)))) for s in samples))
    print(f"wrote sounds/{name}.wav ({n} samples, {dur * 1000:.0f}ms, peak -6dB)")


render("step", 0.045, 190.0, 115.0, decay=90.0, noise_ms=6.0)   # pitch falls: thump
render("jump", 0.110, 150.0, 430.0, decay=28.0, noise_ms=0.0)   # pitch rises: boing
