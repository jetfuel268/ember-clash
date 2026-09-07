#!/usr/bin/env python3
"""Generates the hand-crafted pixel-style SVG sprites in assets/sprites/.

Each sprite is a small grid (rows of characters); runs of the same color are
merged into single SVG rects, so files stay small and the art scales perfectly.

Usage: python3 tools/make_sprites.py
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')

DARK = '#23263a'

def sprite(name, palette, rows):
    w = len(rows[0])
    h = len(rows)
    assert all(len(r) == w for r in rows), f'{name}: ragged rows'
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < w:
            ch = row[x]
            if ch == '.':
                x += 1
                continue
            x2 = x
            while x2 < w and row[x2] == ch:
                x2 += 1
            rects.append(f'    <rect x="{x}" y="{y}" width="{x2 - x}" height="1" fill="{palette[ch]}"/>')
            x = x2
    body = '\n'.join(rects)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">
{body}
</svg>
'''
    path = os.path.join(OUT, f'{name}.svg')
    with open(path, 'w') as f:
        f.write(svg)
    print(f'wrote {path}')


# ---------------- HERO: armored knight, orange sword ----------------
hero_rows = [
    ".......HHHH.....",
    "......HSSSSH....",
    ".....HSSSSSSH...",
    ".....HSSSSSSH...",
    ".HHH..HDDDDDH...",
    ".HYYH.HSSSSSH...",
    ".HYYHHSSSSSSSH..",
    ".HYYHSSSSSSSSH..",
    ".HYYHHSSRRSSSH..",
    ".HYYHSSRRSSSSH..",
    ".HHHH.HSSSSSH...",
    "......HSSSSH....",
    ".....HSMMSMH....",
    ".....HSSSSSH....",
    ".....HSSSSSH....",
    ".....HSSSSSH....",
    ".....HMMMMMH....",
    "....HMMMMMMH....",
    "....HHHHHHHH....",
]
sprite('hero', {
    'H': DARK, 'S': '#c9cede', 'M': '#9aa0b8', 'D': '#1a1c2a',
    'Y': '#ffd24a', 'R': '#c2452e',
}, hero_rows)

# ---------------- GRUNT: goblin bandit, dagger ----------------
grunt_rows = [
    "....HHHHHH......",
    "...HGGGGGGH.....",
    "..HGGGGGGGGH....",
    "..HGWGGGGWGH....",
    "..HGGGGGGGGH....",
    "...HGGGGGGH.HH..",
    "...HGBBBBBHYH...",
    "..HHBBBBBBHHH...",
    "..HGBBBBBBGHH...",
    "...HGBBBBBH.....",
    "...HGGGGGGH.....",
    "...HGG..GGH.....",
    "...HGG..GGH.....",
    "..HHHH..HHHH....",
]
sprite('grunt', {
    'H': DARK, 'G': '#58a838', 'W': '#e8e8d0', 'B': '#7a5230', 'Y': '#ffd24a',
}, grunt_rows)

# ---------------- BRUTE: red demon, cyan claws ----------------
brute_rows = [
    "..HHH..HHH......",
    "..HCH..HCHH.....",
    "..HRRHRRRRH.....",
    ".HRRRRRRRRRH....",
    ".HRYRRRRYRRH....",
    ".HRRRRRRRRRH....",
    ".HRRrrrrrrRH....",
    ".HRRRRRRRRRH....",
    "HHRRRRRRRRRRHH..",
    "HCRRRRRRRRRRCH..",
    "HRRRRrrrrRRRRH..",
    ".HRRRRRRRRRRH...",
    ".HRRrRRRRrRRH...",
    ".HRRRRRRRRRRH...",
    ".HRRR....RRRH...",
    ".HRRR....RRRH...",
    ".HRRR....RRRH...",
    ".HHHH....HHHH...",
]
sprite('brute', {
    'H': DARK, 'R': '#c83028', 'r': '#8a1e1a', 'C': '#40e0d0', 'Y': '#ffd24a',
}, brute_rows)

# ---------------- WARDEN: mossy stone golem, amber eyes ----------------
warden_rows = [
    "...HHHHHHHHH....",
    "..HSSSSSSSSSH...",
    "..HSLLSSSSSSH...",
    "..HSSSSSSSSSH...",
    "..HSASSSSASSH...",
    "..HSSSSSSSSSH...",
    "..HSSMMSSMMSH...",
    ".HSSSSSSSSSSSH..",
    ".HSLLSSSSSSLSSH.",
    ".HSSSSSSSSSSSSH.",
    ".HSMSSSSSSSSMSH.",
    ".HSSSSSSSSSSSSH.",
    "..HSSSSSSSSSSH..",
    "..HSSMSSSSMSSH..",
    "..HSSSS..SSSSH..",
    "..HSSS....SSSH..",
    "..HSSS....SSSH..",
    "..HHHH....HHHH..",
]
sprite('warden', {
    'H': DARK, 'S': '#8a9078', 'M': '#a8ae92', 'L': '#4a8a30', 'A': '#e8a020',
}, warden_rows)

# ---------------- STINGER: purple spider ----------------
stinger_rows = [
    "H..........H....",
    ".H.HH..HH..H.H..",
    "..H.HPPPPPH.H...",
    "...HPPPPPPPH....",
    "..HPPPPPPPPPH...",
    ".HPWPPPPPPWPH...",
    ".HPPPPPPPPPPH...",
    ".HPPpPPPPpPPH...",
    ".HPPPPPPPPPPH...",
    ".HHPpPPPPpPHH...",
    "..HHPPPPPPHH....",
    "...HHHHHHHH.....",
    ".H........H.....",
    ".HH.......HH....",
]
sprite('stinger', {
    'H': DARK, 'P': '#9040c8', 'p': '#6828a0', 'W': '#e8e8f8',
}, stinger_rows)
