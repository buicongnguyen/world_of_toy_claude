"""Picnic props and keepsakes: basket, plate, skewer board, paper lanterns, tea set, storybook
and star jar, sky lantern, campfire, lantern posts, seats, bunting flag and the picnic cloth."""
import math

from mathutils import Vector, noise

from .core import (TAU, Asset, Geo, cone, cyl, grad, grad3, grid, lathe, leaf, lin, merge, mix, mottle, rbox, smoothstep,
                   solid, sphere, torus, tube)


def basket():
    a = Asset('basket', ao=0.5)
    # oval wicker body
    body = lathe([(0.0, 0.0), (0.62, 0.0), (0.7, 0.08), (0.74, 0.35), (0.78, 0.62), (0.76, 0.66), (0.7, 0.66), (0.66, 0.4), (0.6, 0.12), (0.0, 0.12)], 48, rings=None)
    body.deform(lambda p: Vector((p.x * 1.05, p.y * 0.66, p.z)))
    a.add(body, 'wicker', mottle(grad('#9a6232', '#d49a5a', 0.0, 0.66), 0.06, 3))
    a.add(torus(0.76, 0.045, 64, 10).xf(loc=(0, 0, 0.66), scl=(1.05, 0.66, 1)), 'wicker', '#b77a3f')
    a.add(torus(0.7, 0.03, 64, 8).xf(loc=(0, 0, 0.05), scl=(1.05, 0.66, 1)), 'wicker', '#8f5a2c')
    handle = tube([(-0.72, 0, 0.62), (-0.6, 0, 1.18), (0, 0, 1.42), (0.6, 0, 1.18), (0.72, 0, 0.62)], 0.05, 12, 40)
    a.add(handle, 'wicker', grad('#a86c36', '#d9a262', 0.6, 1.4))
    # red cord bindings where the handle meets the rim
    for side in (-1, 1):
        a.add(torus(0.07, 0.022, 16, 8).xf(loc=(side * 0.7, 0, 0.7), rot=(0, math.pi / 2 + side * 0.25, 0)), 'knit', '#c84d4d')
    # gingham napkin draped over the rim: crisp checks from un-welded cells
    cells_x, cells_y, sub = 8, 6, 3
    w, d = 1.3, 0.95
    verts, faces, colors = [], [], []
    for j in range(cells_y):
        for i in range(cells_x):
            check = (i + j) % 2
            col = '#d8484f' if check else '#fbf3ea'
            if (i % 2) and (j % 2):
                col = '#b23a40'
            for sj in range(sub):
                for si in range(sub):
                    base = len(verts)
                    for dj, di in ((0, 0), (0, 1), (1, 1), (1, 0)):
                        u = (i + (si + di) / sub) / cells_x
                        v = (j + (sj + dj) / sub) / cells_y
                        verts.append(Vector(((u - 0.5) * w, (v - 0.5) * d, 0)))
                    faces.append((base, base + 1, base + 2, base + 3))
                    colors += [col] * 4

    def drape(p):
        # sits in the opening, sags in the middle and spills over the front rim
        x, y = p.x, p.y
        z = 0.64 - 0.1 * math.cos(x * 2.2) * math.cos(y * 3)
        if y < -0.28:
            over = (-0.28 - y)
            z = 0.66 - over * 1.6
            y = -0.34 - over * 0.12
        z += 0.015 * math.sin(x * 9) * math.sin(y * 7)
        return Vector((x, y, z))
    nap = Geo([drape(p) for p in verts], faces)
    nap.local = [p.copy() for p in verts]
    # paints are evaluated once per vertex in order, so the checks can be streamed
    stream = iter(colors)
    a.add(nap, 'linen', lambda lp, wp: lin(next(stream)))
    thick = Geo([p - Vector((0, 0, 0.012)) for p in nap.v], [tuple(reversed(f)) for f in faces])
    a.add(thick, 'linen', '#e6d8c8')
    return a


def plate():
    a = Asset('plate', ao=0.35)
    # dense rings on the painted areas so the rim band stays crisp instead of fanning to the centre
    well = [(r, 0.09) for r in (0.8, 0.76, 0.725, 0.705, 0.69, 0.6, 0.45, 0.3, 0.15)]
    rim = [(0.86, 0.12), (0.9, 0.132), (0.94, 0.15), (0.97, 0.175), (1.0, 0.2)]
    prof = [(0.0, 0.0), (0.7, 0.0), (0.78, 0.02), (0.84, 0.06), (0.98, 0.14), (1.03, 0.16), (1.04, 0.19)] + rim[::-1] + well + [(0.0, 0.09)]
    p = lathe(prof, 96, rings=None)

    def paint(lp, wp):
        r = math.hypot(lp.x, lp.y)
        ang = math.atan2(lp.y, lp.x)
        base = mix('#fffaf1', '#f3eadb', smoothstep(0.0, 0.8, r))
        # a scalloped cornflower rim band that echoes the blanket, and a fine inner ring
        scallop = 0.035 * (0.5 + 0.5 * math.cos(ang * 18))
        band = smoothstep(0.8 - scallop, 0.82 - scallop, r) * (1 - smoothstep(0.985, 1.0, r))
        ring = smoothstep(0.69, 0.7, r) * (1 - smoothstep(0.715, 0.725, r))
        c = mix(base, '#6f95c9', band * 0.85)
        c = mix(c, '#6f95c9', ring * 0.7)
        return mix(c, '#d9a646', smoothstep(1.015, 1.03, r))
    a.add(p, 'ceramic', paint)
    # little painted forget-me-nots around the rim
    for k in range(12):
        ang = k * TAU / 12 + 0.13
        for j in range(5):
            b = ang + (j - 2) * 0.016
            a.add(sphere((0.022, 0.022, 0.006), 8, 4).xf(loc=(0.93 * math.cos(ang) + 0.03 * math.cos(j * TAU / 5), 0.93 * math.sin(ang) + 0.03 * math.sin(j * TAU / 5), 0.15)),
                  'ceramic', '#fdfaf2')
        a.add(sphere((0.012, 0.012, 0.005), 6, 4).xf(loc=(0.93 * math.cos(ang), 0.93 * math.sin(ang), 0.155)), 'ceramic', '#f2d35a')
    return a


SKEWER_Z = 0.36  # height of the bamboo stick above the board's base (runtime threads fruit here)


def skewer_board():
    """A serving board with a bamboo skewer resting in two forked stands, so threaded fruit reads
    as pierced from any angle. Three painted slot wreaths show where the fruit will go."""
    a = Asset('skewer', ao=0.45)
    board = rbox(2.7, 0.9, 0.12, 0.06, 3).xf(loc=(0, 0, 0.06))
    a.add(board, 'wood', mottle(grad('#bf8651', '#e0ae74', -1.3, 1.3, 0), 0.05, 2))
    handle = rbox(0.52, 0.38, 0.12, 0.06, 3).xf(loc=(1.55, 0, 0.06))
    a.add(handle, 'wood', '#c99359')
    a.add(torus(0.075, 0.022, 20, 8).xf(loc=(1.62, 0, 0.125)), 'wood', '#6f4a2a')
    # juice groove around the board
    a.add(torus(1.0, 0.012, 64, 6).xf(loc=(0, 0, 0.123), scl=(1.2, 0.34, 1)), 'wood', '#9b6737')
    # painted slot wreaths: a ring of tiny leaves around each slot
    for x in (-0.7, 0.0, 0.7):
        a.add(cyl(0.22, 0.22, 0.004, 40).xf(loc=(x, 0, 0.123)), 'wood', '#f3dcb3')
        for k in range(10):
            ang = k * TAU / 10
            lf = leaf(0.09, 0.04, 0.006, 0.0, 8, 4)
            lf.xf(loc=(x + 0.2 * math.cos(ang), 0.2 * math.sin(ang), 0.126), rot=(0, 0, ang + math.pi / 2))
            a.add(lf, 'glossy', '#6f9a4a')
    # forked stands
    for x in (-1.2, 1.2):
        a.add(cyl(0.05, 0.06, SKEWER_Z - 0.08, 12).xf(loc=(x, 0, 0.12 + (SKEWER_Z - 0.2) / 2)), 'wood', '#8b5a34')
        for side in (-1, 1):
            a.add(tube([(x, 0, SKEWER_Z - 0.08), (x, side * 0.05, SKEWER_Z - 0.02), (x, side * 0.075, SKEWER_Z + 0.05)], 0.018, 8, 8), 'wood', '#8b5a34')
    # bamboo skewer with nodes and a sharpened tip
    stick = tube([(-1.42, 0, SKEWER_Z), (1.3, 0, SKEWER_Z)], 0.034, 12, 12)
    a.add(stick, 'rawwood', grad('#d8b56d', '#f0d898', -1.4, 1.3, 0))
    for x in (-0.35, 0.35, 1.05):
        a.add(torus(0.034, 0.008, 16, 6).xf(loc=(x, 0, SKEWER_Z), rot=(0, math.pi / 2, 0)), 'rawwood', '#b58d4a')
    a.add(cone(0.034, 0.16, 12).xf(loc=(-1.42, 0, SKEWER_Z), rot=(0, -math.pi / 2, 0)), 'rawwood', '#c9a45e')
    # a little knotted ribbon at the handle end
    a.add(torus(0.05, 0.016, 16, 6).xf(loc=(1.3, 0, SKEWER_Z), rot=(0, math.pi / 2, 0)), 'knit', '#d8574a')
    for side in (-1, 1):
        a.add(tube([(1.32, 0, SKEWER_Z), (1.4, side * 0.06, SKEWER_Z - 0.1), (1.44, side * 0.1, SKEWER_Z - 0.2)], lambda t: 0.02 * (1 - 0.4 * t), 6, 8), 'knit', '#d8574a')
    return a


def paper_lantern(name='lantern', color='#fff1d6', band='#d8574a', ribs=12, size=1.0):
    a = Asset(name, ao=0.25)
    s = size
    shade = lathe([(0.08 * s, 0.14 * s), (0.2 * s, 0.18 * s), (0.28 * s, 0.3 * s), (0.31 * s, 0.46 * s), (0.28 * s, 0.62 * s), (0.2 * s, 0.73 * s), (0.08 * s, 0.77 * s)], 48,
                  wobble=lambda ang, t: 1 + 0.035 * abs(math.cos(ang * ribs / 2)) ** 0.5 - 0.02, rings=24)

    def paint(lp, wp):
        r = lp.z / s
        stripe = smoothstep(0.34, 0.36, r) * (1 - smoothstep(0.39, 0.41, r)) + smoothstep(0.54, 0.56, r) * (1 - smoothstep(0.59, 0.61, r))
        return mix(color, band, stripe * 0.9)
    a.add(shade, 'paper', paint)
    a.add(cyl(0.11 * s, 0.13 * s, 0.07 * s, 24).xf(loc=(0, 0, 0.8 * s)), 'wood', '#6e4a2e')
    a.add(cyl(0.12 * s, 0.1 * s, 0.07 * s, 24).xf(loc=(0, 0, 0.115 * s)), 'wood', '#6e4a2e')
    a.add(tube([(-0.06 * s, 0, 0.83 * s), (-0.06 * s, 0, 0.98 * s), (0.06 * s, 0, 0.98 * s), (0.06 * s, 0, 0.83 * s)], 0.009 * s, 6, 16), 'iron', '#ffffff')
    a.add(tube([(0, 0, 0.08 * s), (0, 0, -0.08 * s)], 0.018 * s, 8, 6), 'knit', band)
    a.add(cone(0.04 * s, 0.1 * s, 12).xf(loc=(0, 0, -0.16 * s)), 'knit', band)
    return a


def teapot():
    a = Asset('teapot', ao=0.45)
    tea = '#b9a2d6'
    body = lathe([(0.0, 0.0), (0.26, 0.0), (0.4, 0.1), (0.45, 0.28), (0.4, 0.46), (0.26, 0.56), (0.0, 0.57)], 48)

    def paint(lp, wp):
        ang = math.atan2(lp.y, lp.x)
        petal = max(0.0, math.cos(ang * 5 - 0.5)) ** 6 * smoothstep(0.2, 0.3, lp.z) * (1 - smoothstep(0.34, 0.42, lp.z))
        return mix(mix('#9d85c4', '#cbb8e6', smoothstep(0.0, 0.5, lp.z)), '#fff4d8', petal)
    a.add(body, 'ceramic', paint)
    a.add(lathe([(0.0, 0.54), (0.22, 0.54), (0.24, 0.58), (0.16, 0.63), (0.0, 0.64)], 32), 'ceramic', '#b19bd4')
    a.add(sphere((0.06, 0.06, 0.05), 16, 8).xf(loc=(0, 0, 0.68)), 'brass', '#ffffff')
    a.add(tube([(0.36, 0, 0.18), (0.56, 0, 0.3), (0.64, 0, 0.5), (0.72, 0, 0.56)], lambda t: 0.08 - 0.045 * t, 16, 20), 'ceramic', tea)
    a.add(tube([(-0.36, 0, 0.44), (-0.62, 0, 0.44), (-0.64, 0, 0.18), (-0.4, 0, 0.14)], 0.045, 12, 24), 'ceramic', tea)
    for side in (-1, 1):
        cup = lathe([(0.0, 0.0), (0.1, 0.0), (0.15, 0.04), (0.17, 0.16), (0.155, 0.16), (0.13, 0.05), (0.0, 0.05)], 32, rings=None)
        cup.xf(loc=(side * 0.85, -0.25 + side * 0.08, 0.0))
        a.add(cup, 'ceramic', '#f7efe2')
        a.add(cyl(0.135, 0.135, 0.01, 24).xf(loc=(side * 0.85, -0.25 + side * 0.08, 0.13)), 'glossy', '#c9a24a')
        a.add(torus(0.05, 0.014, 16, 6).xf(loc=(side * 0.85 + 0.18, -0.25 + side * 0.08, 0.1), rot=(math.pi / 2, 0, 0)), 'ceramic', '#f7efe2')
    return a


def storybook():
    a = Asset('storybook', ao=0.45)
    # open book, pages fanned, with a ribbon and a jar of starlight beside it
    for side in (-1, 1):
        cover = rbox(0.62, 0.86, 0.03, 0.01, 2).xf(loc=(side * 0.32, 0, 0.02), rot=(0, side * -0.08, 0))
        a.add(cover, 'felt', '#3f5d8f')
        pages = rbox(0.58, 0.8, 0.06, 0.02, 2)
        pages.deform(lambda p, side=side: Vector((p.x, p.y, p.z + 0.08 * math.sin(max(0.0, min(1.0, (p.x * side + 0.29) / 0.58)) * math.pi) * 0.6)))
        pages.xf(loc=(side * 0.3, 0, 0.07), rot=(0, side * -0.08, 0))
        a.add(pages, 'paper', lambda lp, wp: mix('#fff6e3', '#e9dcc0', smoothstep(0.02, -0.03, lp.z)))
        for line in range(6):
            y = 0.28 - line * 0.1
            a.add(rbox(0.4, 0.012, 0.004, 0.0, 1).xf(loc=(side * 0.3, y, 0.155 - abs(side * 0.3) * 0.0), rot=(0, side * -0.08, 0)), 'felt', '#9c8f7e')
    a.add(tube([(0.0, 0.3, 0.12), (0.02, 0.45, 0.05), (0.05, 0.55, 0.0)], 0.018, 6, 12), 'knit', '#c9493f')
    # star jar
    jar = lathe([(0.0, 0.0), (0.16, 0.0), (0.2, 0.08), (0.2, 0.36), (0.15, 0.44), (0.12, 0.46), (0.12, 0.5), (0.0, 0.5)], 32)
    jar.xf(loc=(0.95, 0.1, 0.0))
    a.add(jar, 'glow', lambda lp, wp: mix('#7fb8ff', '#fff4c4', smoothstep(0.0, 0.45, lp.z)))
    a.add(cyl(0.13, 0.11, 0.1, 20).xf(loc=(0.95, 0.1, 0.53)), 'rawwood', '#b58c5a')
    return a


def sky_lantern():
    a = Asset('sky_lantern', ao=0.0)
    prof = [(0.2, 0.0), (0.26, 0.2), (0.31, 0.55), (0.3, 0.7), (0.0, 0.72)]
    shell = lathe(prof, 4, rings=None).xf(rot=(0, 0, math.pi / 4))
    a.add(shell, 'paper', grad('#ffe0a6', '#ffcf8a', 0.0, 0.7))
    # the open-bottomed paper needs an inner face so it glows from below too
    inner = lathe([(r * 0.97, z) for r, z in prof], 4, rings=None).xf(rot=(0, 0, math.pi / 4))
    inner.f = [tuple(reversed(f)) for f in inner.f]
    a.add(inner, 'paper', '#fff0c8')
    a.add(torus(0.2, 0.012, 4, 6).xf(rot=(0, 0, math.pi / 4)), 'rawwood', '#8a6a44')
    a.add(sphere(0.06, 12, 8).xf(loc=(0, 0, 0.05)), 'candle', '#ffffff')
    return a


def campfire():
    """A proper storybook campfire: a ring of chunky stones, a tipi of split logs with charred tips,
    a pale ash bed and glowing embers (the runtime adds flames and light)."""
    from .world import faceted_stone
    import random
    rnd = random.Random(8)
    a = Asset('campfire', ao=0.45)
    for k in range(10):
        ang = k * TAU / 10 + rnd.uniform(-0.08, 0.08)
        st = faceted_stone((rnd.uniform(0.15, 0.2), rnd.uniform(0.12, 0.16), rnd.uniform(0.12, 0.17)), rnd, cuts=7, sub=3, floor=0.0)
        st.xf(loc=(0.52 * math.cos(ang), 0.52 * math.sin(ang), 0.0), rot=(0, 0, ang + rnd.uniform(-0.3, 0.3)))
        a.add(st, 'stone', mottle(grad('#6f6a66', '#b5aea3', 0.0, 0.17), 0.08, 5, k))
    a.add(cyl(0.42, 0.44, 0.03, 32).xf(loc=(0, 0, 0.015)), 'soil', lambda lp, wp: mix('#8d857b', '#5a4f47', smoothstep(0.1, 0.42, math.hypot(lp.x, lp.y))))
    for k in range(5):
        ang = k * TAU / 5 + 0.3
        foot = Vector((0.36 * math.cos(ang), 0.36 * math.sin(ang), 0.05))
        tip = Vector((0.03 * math.cos(ang), 0.03 * math.sin(ang), 0.46))
        log = tube([foot, foot.lerp(tip, 0.5) + Vector((0, 0, 0.02)), tip], lambda t: 0.06 * (1 - 0.25 * t), 12, 8)
        a.add(log, 'bark', lambda lp, wp: mix(mix('#6b4630', '#8a5d3d', smoothstep(0.0, 0.2, wp.z)), '#1d120d', smoothstep(0.22, 0.4, wp.z)))
        a.add(cyl(0.058, 0.058, 0.01, 12).xf(loc=foot - (tip - foot).normalized() * 0.005, rot=(0, math.acos(max(-1, min(1, (tip - foot).normalized().z))), ang + math.pi)), 'rawwood', '#d9b07c')
    for k in range(12):
        ang = k * 2.39996
        r = 0.05 + 0.2 * ((k * 37) % 10) / 10
        a.add(sphere((0.05, 0.04, 0.03), 8, 6).xf(loc=(r * math.cos(ang), r * math.sin(ang), 0.04)), 'candle', '#ff7a2a' if k % 3 else '#ffc15a')
    return a


def post():
    a = Asset('post', ao=0.4)
    a.add(tube([(0, 0, 0.0), (0, 0, 3.1)], lambda t: 0.075 - 0.02 * t, 12, 8), 'wood', grad('#7b5234', '#a7774d', 0, 3))
    a.add(rbox(0.5, 0.09, 0.09, 0.02, 2).xf(loc=(0, 0, 2.95)), 'wood', '#8b5f3c')
    a.add(tube([(0.2, 0, 2.95), (0.2, 0, 2.82), (0.26, 0, 2.8)], 0.012, 6, 8), 'iron', '#ffffff')
    for k in range(5):
        a.add(sphere((0.12, 0.12, 0.05), 12, 6).xf(loc=(0.08 * math.cos(k), 0.08 * math.sin(k), 0.02)), 'stone', '#8b857c')
    return a


def log_seat():
    a = Asset('log_seat', ao=0.5)
    log = tube([(-0.75, 0, 0.26), (0.75, 0, 0.26)], 0.24, 20, 8, caps=False)
    a.add(log, 'bark', mottle(grad('#5c3b27', '#8a5d3d', 0.0, 0.5), 0.1, 3))
    for side in (-1, 1):
        ring = cyl(0.24, 0.24, 0.01, 32).xf(loc=(side * 0.75, 0, 0.26), rot=(0, math.pi / 2, 0))

        def rings(lp, wp):
            r = math.hypot(lp.x, lp.y) / 0.24
            return mix('#e2b98a', '#b98556', 0.5 + 0.5 * math.sin(r * 24))
        a.add(ring, 'rawwood', rings)
    a.add(sphere((0.35, 0.18, 0.05), 16, 8).xf(loc=(-0.2, 0.05, 0.48)), 'canopy', '#6f9a45')
    return a


def stump():
    a = Asset('stump', ao=0.5)
    body = lathe([(0.0, 0.0), (0.46, 0.0), (0.4, 0.06), (0.33, 0.2), (0.31, 0.42), (0.3, 0.44), (0.0, 0.44)], 36,
                 wobble=lambda ang, t: 1 + 0.08 * math.cos(ang * 5) * (1 - t) ** 2, rings=None)
    a.add(body, 'bark', grad('#4f3322', '#7c5236', 0.0, 0.44))

    def top(lp, wp):
        r = math.hypot(lp.x, lp.y) / 0.3
        return mix(mix('#e8c192', '#b98556', 0.5 + 0.5 * math.sin(r * 22)), '#6d4a30', smoothstep(0.88, 0.98, r))
    a.add(cyl(0.3, 0.3, 0.012, 36).xf(loc=(0, 0, 0.445)), 'rawwood', top)
    for k in range(3):
        ang = k * 2.3
        a.add(sphere((0.08, 0.08, 0.03), 12, 6).xf(loc=(0.33 * math.cos(ang), 0.33 * math.sin(ang), 0.3)), 'mushroom', '#e7c79a')
    return a


def bunting_flag():
    a = Asset('bunting_flag', ao=0.0)
    verts = [(-0.14, 0, 0), (0.14, 0, 0), (0, 0, -0.3)]
    g = Geo([Vector(v) for v in verts], [(0, 1, 2)])
    back = Geo([Vector(v) + Vector((0, 0.004, 0)) for v in verts], [(2, 1, 0)])
    a.add(g, 'linen', '#ffffff')
    a.add(back, 'linen', '#ffffff')
    return a


def cloth():
    """The play surface (desktop 14 x 9.8 units): a cornflower gingham picnic blanket, cool enough
    that every warm fruit pops against it, with a quilted terracotta border, a rolled hem, running
    stitches, soft settling wrinkles and a tassel at each corner."""
    a = Asset('cloth', ao=0.0, ground=False)
    W, D = 14.0, 9.8
    B = 0.42  # border band width
    nx, ny = 112, 80

    def height(x, y):
        edge = max(abs(x) / (W / 2), abs(y) / (D / 2))
        roll = max(0.0, edge - 0.965) * 1.4
        # long, low wrinkles where the blanket settled on the lawn; kept well under the fruit
        wrinkle = 0.012 * math.sin(x * 0.55 + y * 0.9) * math.sin(y * 0.4 - 0.6) + 0.008 * noise.noise(Vector((x * 0.45, y * 0.45, 0.3)))
        corner = smoothstep(0.8, 1.0, abs(x) / (W / 2)) * smoothstep(0.75, 1.0, abs(y) / (D / 2)) * 0.03
        return 0.06 - roll * 0.3 + wrinkle + corner

    # the gingham field (texture checks) stops under the border band
    field = grid(W - 2 * B + 0.1, D - 2 * B + 0.1, nx, ny, height)
    a.add(field, 'gingham', lambda lp, wp: mix('#ffffff', '#f3ecdf', 0.5 + 0.5 * noise.noise(Vector((lp.x * 0.2, lp.y * 0.2, 2.2)))))

    # quilted border band: four strips, each a fine grid so it follows the wrinkles and the roll
    def band(x0, x1, y0, y1, n0, n1):
        g = grid(x1 - x0, y1 - y0, n0, n1)
        g.deform(lambda p: Vector((p.x + (x0 + x1) / 2, p.y + (y0 + y1) / 2, 0.0)), local_too=True)
        g.deform(lambda p: Vector((p.x, p.y, height(p.x, p.y) + 0.006)))
        return g

    def band_paint(lp, wp):
        d = min(W / 2 - abs(lp.x), D / 2 - abs(lp.y))
        base = mix('#c9573f', '#d86a4c', 0.5 + 0.5 * noise.noise(Vector((lp.x * 0.7, lp.y * 0.7, 5.1))))
        # a thin cream piping line along the inner edge and quilting diamonds
        piping = smoothstep(B - 0.02, B - 0.045, d) * smoothstep(B - 0.1, B - 0.075, d)
        along = lp.x if (D / 2 - abs(lp.y)) < (W / 2 - abs(lp.x)) else lp.y
        quilt = abs(((along * 2.2 + d * 2.2) % 1) - 0.5) < 0.04 or abs(((along * 2.2 - d * 2.2) % 1) - 0.5) < 0.04
        c = mix(base, '#a8412f', 0.35 if quilt and 0.08 < d < B - 0.12 else 0.0)
        return mix(c, '#fff4e0', piping)
    strips = [band(-W / 2, W / 2, D / 2 - B, D / 2, 112, 5), band(-W / 2, W / 2, -D / 2, -D / 2 + B, 112, 5),
              band(-W / 2, -W / 2 + B, -D / 2 + B, D / 2 - B, 5, 72), band(W / 2 - B, W / 2, -D / 2 + B, D / 2 - B, 5, 72)]
    for g in strips:
        a.add(g, 'linen', band_paint)
    # rolled hem around the outside edge
    corners = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, D / 2), (-W / 2, D / 2)]
    for (x0, y0), (x1, y1) in zip(corners, corners[1:] + corners[:1]):
        pts = [Vector((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.0)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
        for p in pts:
            p.z = height(max(-W / 2 + 0.01, min(W / 2 - 0.01, p.x)), max(-D / 2 + 0.01, min(D / 2 - 0.01, p.y))) - 0.015
        a.add(tube(pts, 0.05, 10, 40), 'linen', '#b44a37')
    # underside so the edge has thickness from low camera angles
    under = grid(W, D, 8, 6, lambda x, y: -0.01)
    under.f = [tuple(reversed(f)) for f in under.f]
    a.add(under, 'linen', '#a5503f')
    # running stitches just inside the piping
    inset = B + 0.12
    for sy in (-1, 1):
        y = sy * (D / 2 - inset)
        for i in range(int((W - 2 * inset) / 0.24)):
            x = -W / 2 + inset + 0.1 + i * 0.24
            a.add(rbox(0.12, 0.022, 0.014, 0.005, 1).xf(loc=(x, y, height(x, y) + 0.006)), 'linen', '#fffaf0')
    for sx in (-1, 1):
        x = sx * (W / 2 - inset)
        for i in range(int((D - 2 * inset) / 0.24)):
            y = -D / 2 + inset + 0.1 + i * 0.24
            a.add(rbox(0.022, 0.12, 0.014, 0.005, 1).xf(loc=(x, y, height(x, y) + 0.006)), 'linen', '#fffaf0')
    # corner tassels
    for cx, cy in corners:
        base = Vector((cx, cy, 0.05))
        out = Vector((math.copysign(1, cx), math.copysign(1, cy), 0)).normalized()
        a.add(sphere(0.07, 12, 8).xf(loc=base + out * 0.04), 'knit', '#f2c14e')
        for k in range(7):
            ang = math.atan2(out.y, out.x) + (k - 3) * 0.18
            d = Vector((math.cos(ang), math.sin(ang), 0))
            a.add(tube([base + out * 0.06, base + out * 0.12 + d * 0.12 + Vector((0, 0, -0.03)), base + out * 0.14 + d * 0.26 + Vector((0, 0, -0.05))],
                       lambda t: 0.014 * (1 - 0.6 * t), 5, 8), 'knit', '#f2c14e')
    return a


ALL = [basket, plate, skewer_board, paper_lantern, teapot, storybook, sky_lantern, campfire, post, log_seat, stump, bunting_flag, cloth]


def build(lib, collection):
    return [fn().build(lib, collection) for fn in ALL]
