#!/usr/bin/env python3
"""Render the geometric PiP icon with supersampling; no dependencies required."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)


def rounded(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def pixel(x, y):
    if not rounded(x, y, 2, 2, 126, 126, 26):
        return (0, 0, 0, 0)
    color = (24, 27, 33, 255)
    if rounded(x, y, 18, 30, 110, 98, 10) and not rounded(x, y, 26, 38, 102, 90, 3):
        color = (255, 138, 48, 255)
    if rounded(x, y, 64, 62, 96, 84, 4):
        color = (255, 138, 48, 255)
    return color


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


for size in (16, 32, 48, 128):
    rows = bytearray()
    samples = 8
    for y in range(size):
        rows.append(0)
        for x in range(size):
            colors = [pixel((x + (sx + .5) / samples) * 128 / size,
                            (y + (sy + .5) / samples) * 128 / size)
                      for sy in range(samples) for sx in range(samples)]
            alpha = sum(c[3] for c in colors)
            rows.extend([round(sum(c[i] * c[3] for c in colors) / alpha) if alpha else 0
                         for i in range(3)] + [round(alpha / len(colors))])
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')
    (OUT / f'icon-{size}.png').write_bytes(png)
    print(f'Created icon-{size}.png')
