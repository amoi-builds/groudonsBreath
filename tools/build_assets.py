"""Cut the ripped PMD Red Rescue Team sheets into game atlases.

Reads  assets/source/*.png
Writes assets/sprites.png, assets/tiles.png, assets/data.js

Run from the project root:  python3 -I tools/build_assets.py
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets')


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def cut(sheet, box, bg=None, clear_all_bg=False):
    """Crop a box and make background pixels connected to the crop border transparent
    (or every background-coloured pixel, for sheets whose background colour never appears in sprites)."""
    im = sheet.crop(box)
    px = im.load()
    w, h = im.size
    bg = bg or sheet.getpixel((0, 0))[:3]
    if clear_all_bg:
        for x in range(w):
            for y in range(h):
                if px[x, y][:3] == bg:
                    px[x, y] = (0, 0, 0, 0)
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if px[x, y][:3] != bg:
            continue
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im


def pixels(im):
    px = im.load()
    return [px[x, y] for y in range(im.height) for x in range(im.width)]


def flip(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


# ---------------------------------------------------------------- sprites

pichu = load('pichu.png')  # only used for the shadow sprite now
gen1a = load('gen1_001_025.png')
chiko = load('chikorita.png')
torchic = load('torchic.png')
eevee = load('eevee.png')
gen1 = load('gen1_51_75.png')
groudon = load('groudon.png')
fire = load('fire_moves.png')

frames = {}  # name -> list of PIL images

# Up-facing (back view) run cycles. "F" frames are mirrored step frames.
a24, a25, a26 = (cut(gen1a, b) for b in [(291, 1750, 313, 1773), (316, 1748, 338, 1773), (340, 1748, 362, 1773)])
frames['pikachu.run'] = [a24, a25, a24, a26]
frames['pikachu.hurt'] = [cut(gen1a, (289, 1782, 312, 1810))]
frames['pikachu.icon'] = [cut(gen1a, (5, 1748, 23, 1773))]

c8, c9 = cut(chiko, (262, 21, 275, 41)), cut(chiko, (278, 19, 291, 41))
frames['chikorita.run'] = [c9, c8, c9, flip(c8)]
frames['chikorita.hurt'] = [cut(chiko, (209, 219, 228, 250))]
frames['chikorita.icon'] = [cut(chiko, (99, 20, 112, 41))]

t12, t13, t14 = (cut(torchic, b) for b in [(276, 22, 289, 41), (292, 20, 305, 41), (308, 25, 321, 41)])
frames['torchic.run'] = [t12, t14, t13, t14]
frames['torchic.hurt'] = [cut(torchic, (206, 157, 232, 184))]
frames['torchic.icon'] = [cut(torchic, (51, 19, 64, 41))]

e84, e85, e88 = (cut(eevee, b) for b in [(80, 135, 99, 155), (104, 131, 125, 155), (130, 138, 149, 155)])
frames['eevee.run'] = [e88, e85, e84]
frames['eevee.hurt'] = [cut(eevee, (369, 144, 393, 170))]
frames['eevee.icon'] = [cut(eevee, (1, 24, 20, 42))]

w11, w12, w13 = (cut(gen1, b) for b in [(301, 834, 326, 857), (328, 834, 353, 857), (355, 834, 380, 857)])
frames['poliwhirl.run'] = [w11, w12, w11, w13]
frames['poliwhirl.hurt'] = [cut(gen1, (36, 906, 63, 933))]
frames['poliwhirl.icon'] = [cut(gen1, (8, 836, 35, 857))]

frames['shadow'] = [cut(pichu, (190, 154, 204, 160))]

# Survival roster: frame boxes per Pokémon live in tools/survival_frames.json.
with open(os.path.join(ROOT, 'tools', 'survival_frames.json')) as f:
    for name, spec in json.load(f).items():
        sheet = load(spec['sheet'])
        bg = tuple(spec['bg']) if spec.get('bg') else None
        # Coloured sheet backgrounds can get trapped inside curls and loops; unlike white, those colours
        # never appear in the sprites themselves, so every background-coloured pixel can go.
        coloured = (bg or sheet.getpixel((0, 0))[:3]) != (255, 255, 255)

        def grab(box):
            im = cut(sheet, tuple(box[:4]), bg, clear_all_bg=coloured)
            return flip(im) if len(box) > 4 and box[4] else im

        frames[name + '.run'] = [grab(b) for b in spec['run']]
        frames[name + '.hurt'] = [grab(spec['hurt'])]
        frames[name + '.icon'] = [grab(spec['icon'])]

g16, g19, g20 = (cut(groudon, b) for b in [(30, 181, 70, 235), (217, 179, 254, 232), (263, 176, 300, 229)])
frames['groudon.walk'] = [g16, g19, g16, g20]
frames['groudon.attack'] = [cut(groudon, (93, 183, 147, 227)), cut(groudon, (159, 189, 209, 226))]

# Flamethrower spinning flame: re-center every frame on its white core so it spins in place.
fireball = []
fx = fire.load()
for box in [(8, 870, 37, 893), (39, 864, 65, 891), (67, 864, 94, 889), (98, 870, 127, 893), (131, 868, 158, 893),
            (161, 863, 190, 888), (192, 865, 218, 892), (220, 870, 249, 893), (253, 868, 280, 893),
            (282, 863, 311, 888), (313, 867, 339, 892)]:
    pts = [(x, y) for x in range(box[0], box[2]) for y in range(box[1], box[3]) if sum(fx[x, y][:3]) >= 720]
    cx = round(sum(p[0] for p in pts) / len(pts))
    cy = round(sum(p[1] for p in pts) / len(pts))
    im = cut(fire, (cx - 16, cy - 16, cx + 16, cy + 16))
    # drop pixels belonging to neighbouring frames or the guide line under the row
    ipx = im.load()
    for x in range(32):
        for y in range(32):
            sx, sy = cx - 16 + x, cy - 16 + y
            if not (box[0] <= sx < box[2] and box[1] <= sy < min(box[3], 894)):
                ipx[x, y] = (0, 0, 0, 0)
    fireball.append(im)
frames['fireball'] = fireball

ember_boxes = [(553, 192, 558, 200), (562, 192, 568, 200), (571, 193, 579, 199), (581, 193, 589, 199),
               (591, 184, 605, 200), (613, 184, 623, 200), (629, 184, 641, 200), (646, 184, 659, 200),
               (663, 184, 678, 200), (681, 184, 697, 200), (699, 184, 715, 200), (720, 181, 732, 200)]
frames['ember'] = [cut(fire, b) for b in ember_boxes]

# shelf-pack into one atlas
order = sorted(frames.items(), key=lambda kv: -max(i.height for i in kv[1]))
atlas_w, x, y, shelf_h = 512, 0, 0, 0
placed = {}
for name, ims in order:
    placed[name] = []
    for im in ims:
        if x + im.width > atlas_w:
            x, y, shelf_h = 0, y + shelf_h + 1, 0
        placed[name].append((x, y, im))
        x += im.width + 1
        shelf_h = max(shelf_h, im.height)
sprite_atlas = Image.new('RGBA', (atlas_w, y + shelf_h), (0, 0, 0, 0))
sprite_meta = {}
for name, items in placed.items():
    sprite_meta[name] = []
    for (ax, ay, im) in items:
        sprite_atlas.paste(im, (ax, ay))
        sprite_meta[name].append([ax, ay, im.width, im.height])
sprite_atlas.save(os.path.join(OUT, 'sprites.png'))

# ---------------------------------------------------------------- tiles

magma = load('magma.png')
mp = magma.load()
TILE = 24


def tile_xy(col, row):
    return 9 + 25 * col, 213 + 25 * row


# Legend: 3x3 cells of 8px, black = same-type neighbour, white = the tile itself.
BITS = {(1, 0): 1, (2, 0): 2, (2, 1): 4, (2, 2): 8, (1, 2): 16, (0, 2): 32, (0, 1): 64, (0, 0): 128}
patterns = []  # (legend row, legend col, mask)
for r in range(24):
    for c in range(3):
        x0, y0 = tile_xy(c, r)
        if mp[x0 + 12, y0 + 12][:3] != (254, 254, 254):
            continue
        mask = 0
        for (cx, cy), bit in BITS.items():
            if mp[x0 + cx * 8 + 4, y0 + cy * 8 + 4][:3] == (1, 1, 1):
                mask |= bit
        patterns.append((r, c, mask))
assert len(patterns) == 47, len(patterns)


def normalize(mask):
    n, e, s, w = mask & 1, mask & 4, mask & 16, mask & 64
    if not (n and e): mask &= ~2
    if not (s and e): mask &= ~8
    if not (s and w): mask &= ~32
    if not (n and w): mask &= ~128
    return mask


by_mask = {m: i for i, (_, _, m) in enumerate(patterns)}
mask_to_pattern = [by_mask[normalize(m)] for m in range(256)]

palettes = {}
for name, y0, n in [('lava', 30, 23), ('wallA', 307, 20)]:
    palettes[name] = [[mp[767 + 11 * c + 5, y0 + 11 * r + 5][:3] for c in range(16)] for r in range(n)]


def recolor(im, pal, frame):
    lookup = {}
    for i, col in enumerate(pal[0]):
        lookup.setdefault(col, pal[frame][i])
    out = im.copy()
    px = out.load()
    for x in range(out.width):
        for y in range(out.height):
            p = px[x, y]
            if p[3]:
                c = lookup.get(p[:3], p[:3])
                px[x, y] = c + (255,)
    return out


def section(col0):
    """The 47 tiles of a section, in pattern order."""
    out = []
    for (r, c, _) in patterns:
        x0, y0 = tile_xy(col0 + c, r)
        out.append(magma.crop((x0, y0, x0 + TILE, y0 + TILE)))
    return out


def uses_cycling(tiles, pal):
    cycling = {pal[0][i] for i in range(16) if len({row[i] for row in pal}) > 1}
    return any(p[:3] in cycling for t in tiles for p in pixels(t))


tile_rows = []  # each entry: list of 47 tiles
tile_meta = {}
for name, col0, pal in [('wall', 3, palettes['wallA']), ('lava', 27, palettes['lava']), ('ground', 18, palettes['lava'])]:
    base = section(col0)
    n = len(pal) if uses_cycling(base, pal) else 1
    tile_meta[name] = {'row': len(tile_rows), 'frames': n}
    for f in range(n):
        tile_rows.append([recolor(t, pal, f) for t in base])

# Ground Alt 1 / Alt 2: decorative variants that exist only for some patterns.
alt_slots = {}  # pattern -> list of atlas columns in the alt rows
alt_rows = [[None] * 47, [None] * 47]
for k, col0 in enumerate([21, 24]):
    for i, (r, c, _) in enumerate(patterns):
        x0, y0 = tile_xy(col0 + c, r)
        t = magma.crop((x0, y0, x0 + TILE, y0 + TILE))
        if any(p[:3] != (0, 128, 128) for p in pixels(t)):
            alt_rows[k][i] = t
            alt_slots.setdefault(i, []).append(len(tile_rows) + k)
for k in range(2):
    tile_rows.append([t or Image.new('RGBA', (TILE, TILE)) for t in alt_rows[k]])
tile_meta['groundAlt'] = {str(p): rows for p, rows in alt_slots.items()}

tile_atlas = Image.new('RGBA', (47 * TILE, len(tile_rows) * TILE))
for r, row in enumerate(tile_rows):
    for c, t in enumerate(row):
        tile_atlas.paste(t, (c * TILE, r * TILE))
tile_atlas.save(os.path.join(OUT, 'tiles.png'))

data = {
    'sprites': sprite_meta,
    'tiles': {'size': TILE, 'maskToPattern': mask_to_pattern, **tile_meta,
              'lavaFrameTicks': 3, 'wallFrameTicks': 10},
}
with open(os.path.join(OUT, 'data.js'), 'w') as f:
    f.write('// Generated by tools/build_assets.py. Do not edit.\n')
    f.write('window.ASSET_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')

print('sprites:', sprite_atlas.size, {k: len(v) for k, v in sprite_meta.items()})
print('tiles:', tile_atlas.size, tile_meta)
