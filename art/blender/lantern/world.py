"""The floating forest clearing: island, trees, bushes, rocks, flowers, pond and dressing.
The island is authored for the desktop board (14 x 9.8 cloth) and scaled by the game for
other aspect ratios; everything else is placed at runtime."""
import math
import random

from mathutils import Matrix, Vector, noise

from .core import (TAU, Asset, Geo, card, cone, cyl, grad, grad3, ico, lathe, leaf, lin, mix, mottle, rbox, smoothstep,
                   solid, sphere, torus, tube)

RX, RY = 10.8, 8.3  # island top radii (Blender X, Y)


def _n(x, y, z=0.0, f=1.0, seed=0.0):
    return noise.noise(Vector((x * f + seed * 3.1, y * f + seed * 1.7, z * f + seed * 5.3)))


def island():
    a = Asset('island', ao=1.2, ao_strength=0.75, ground=False)
    A = 160
    # profile: (radial scale of the rim, z)
    top_rings = [0.0, 0.25, 0.45, 0.6, 0.7, 0.78, 0.84, 0.89, 0.93, 0.96, 0.985, 1.0]
    lip = [(1.012, -0.05), (1.022, -0.14), (1.018, -0.26)]
    cliff = [(1.0, -0.42), (0.99, -0.7), (0.995, -0.95), (0.982, -1.2), (0.985, -1.45), (0.97, -1.75), (0.965, -2.05), (0.95, -2.35), (0.93, -2.65)]
    bottom = [(0.87, -3.0), (0.77, -3.5), (0.64, -4.1), (0.5, -4.8), (0.36, -5.5), (0.23, -6.3), (0.12, -7.1), (0.04, -7.8), (0.0, -8.2)]
    profile = [(r, None) for r in top_rings] + lip + cliff + bottom

    def cloth_mask(x, y):
        return max(0.0, 1 - max(0.0, max(abs(x) - 7.4, abs(y) - 5.3)) / 1.2)

    def top_z(x, y):
        flat = cloth_mask(x, y)
        bump = 0.18 * _n(x, y, 0, 0.18, 1) + 0.06 * _n(x, y, 0, 0.6, 2)
        rim = math.hypot(x / RX, y / RY)
        return (1 - flat) * (bump + 0.05) * smoothstep(1.02, 0.9, rim) - 0.02 * flat

    verts, faces, kinds = [], [], []
    for i, (r, z) in enumerate(profile):
        for k in range(A):
            ang = k * TAU / A
            wob = 1 + 0.035 * _n(math.cos(ang), math.sin(ang), i * 0.15, 2.5, 3) if i >= len(top_rings) else 1.0
            if i >= len(top_rings) + len(lip) + len(cliff) - 1:
                wob += 0.12 * _n(math.cos(ang) * 2, math.sin(ang) * 2, z * 0.5, 1.5, 4)
            x, y = RX * r * wob * math.cos(ang), RY * r * wob * math.sin(ang)
            zz = top_z(x, y) if z is None else z + (0.08 * _n(x, y, z, 0.7, 5) if z < -0.2 else 0)
            verts.append((x, y, zz))
    rings = len(profile)
    for i in range(rings - 1):
        for k in range(A):
            a0, a1 = i * A + k, i * A + (k + 1) % A
            b0, b1 = (i + 1) * A + k, (i + 1) * A + (k + 1) % A
            faces.append((a0, b0, b1, a1))
    # pole at the very bottom and the centre are degenerate rings of identical points: fine for shading
    g = Geo(verts, faces)
    ntop = len(top_rings)

    def paint(lp, wp):
        z = lp.z
        if z > -0.06:
            grass = mix('#4c8a35', '#8cbf55', 0.5 + 0.6 * _n(lp.x, lp.y, 0, 0.35, 7))
            grass = mix(grass, '#a6c763', max(0.0, _n(lp.x, lp.y, 0, 1.3, 8)) * 0.35)
            return mix(grass, '#3f7430', smoothstep(0.9, 1.0, math.hypot(lp.x / RX, lp.y / RY)))
        wob = 0.14 * _n(lp.x, lp.y, 0, 0.5, 9) + 0.05 * _n(lp.x, lp.y, 0, 2.0, 11)
        zz = z + wob
        if zz > -0.3:
            return mix('#3d6a2c', '#35251a', smoothstep(-0.08, -0.28, zz))
        # layered cross-section: topsoil, loam, clay, a pale sand seam, red earth, slate
        bands = [(-0.3, '#35251a'), (-0.62, '#553621'), (-0.95, '#6b4428'), (-1.02, '#b77a42'), (-1.3, '#c98b4c'), (-1.36, '#e3c08a'),
                 (-1.44, '#e3c08a'), (-1.5, '#8a4e30'), (-1.95, '#743f27'), (-2.05, '#77706a'), (-2.65, '#8b847b')]
        col = bands[-1][1]
        for (z0, c0), (z1, c1) in zip(bands, bands[1:]):
            if z1 <= zz <= z0:
                col = mix(c0, c1, smoothstep(z0, z1, zz))
                break
        if zz < -2.65:
            col = mix('#6d665e', '#3a3531', smoothstep(-2.8, -8.0, zz))
        return mix(col, '#2b221c', max(0.0, _n(lp.x, lp.y, z, 2.2, 10)) * 0.3)
    turf = Geo()
    soil = Geo()
    rock = Geo()
    # split faces by band so each gets its own surface material
    for f in g.f:
        zc = sum(g.v[i].z for i in f) / len(f)
        target = turf if zc > -0.1 else soil if zc > -2.0 else rock
        base = len(target.v)
        target.v += [g.v[i].copy() for i in f]
        target.local += [g.v[i].copy() for i in f]
        target.f.append(tuple(range(base, base + len(f))))
        target.smooth.append(True)
    for geo, mat in ((turf, 'turf'), (soil, 'soil'), (rock, 'stone')):
        _weld(geo)
        a.add(geo, mat, paint)
    rnd = random.Random(11)
    # irregular grassy clumps and overhangs breaking the rim silhouette
    ang = 0.0
    while ang < TAU:
        size = rnd.choice((0.18, 0.22, 0.28, 0.35, 0.45, 0.6))
        ang += size / 9.0 * rnd.uniform(0.8, 1.6)
        if rnd.random() < 0.18:
            ang += rnd.uniform(0.02, 0.08)  # occasional gaps
            continue
        r = 1.0 + rnd.uniform(-0.012, 0.012)
        blob = ico((size * rnd.uniform(0.9, 1.4), size * rnd.uniform(0.9, 1.3), size * rnd.uniform(0.35, 0.6)), 2)
        blob.displace(size * 0.18, 2.5 / size, ang * 7)
        blob.xf(loc=(RX * r * math.cos(ang), RY * r * math.sin(ang), -0.06 + rnd.uniform(-0.05, 0.03)), rot=(rnd.uniform(-0.2, 0.2), 0, ang))
        a.add(blob, 'canopy', mottle(grad('#35692b', '#86b953', -0.3, 0.25), 0.1, 2, ang))
    # stones embedded in the cliff
    for k in range(70):
        ang = rnd.uniform(0, TAU)
        z = rnd.uniform(-2.6, -0.4)
        r = 0.99 - (0.0 if z > -1.5 else 0.03)
        st = ico((rnd.uniform(0.14, 0.34), rnd.uniform(0.12, 0.28), rnd.uniform(0.1, 0.22)), 2)
        st.displace(0.04, 4, k)
        st.xf(loc=(RX * r * math.cos(ang), RY * r * math.sin(ang), z), rot=(0, 0, ang))
        a.add(st, 'stone', mottle(mix('#7c756c', '#a59d91', rnd.random()), 0.1, 4, k))
    # rocky chunks jutting from the underside
    under = cliff[-1:] + bottom
    for k in range(26):
        ang = rnd.uniform(0, TAU)
        j = rnd.randrange(0, len(under) - 3)
        r, z = under[j]
        s = rnd.uniform(0.35, 0.8) * (1.2 - j * 0.12)
        chunk = ico((s * 1.3, s, s * 0.8), 2)
        chunk.displace(s * 0.25, 1.5 / s, k * 1.7)
        chunk.xf(loc=(RX * r * 0.98 * math.cos(ang), RY * r * 0.98 * math.sin(ang), z), rot=(rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), ang))
        a.add(chunk.flat(), 'stone', mottle(mix('#5f5953', '#8c857c', rnd.random()), 0.12, 2, k))
    # hanging roots under the lip
    for k in range(34):
        ang = rnd.uniform(0, TAU)
        r = 1.01
        x0, y0 = RX * r * math.cos(ang), RY * r * math.sin(ang)
        out = Vector((math.cos(ang), math.sin(ang), 0))
        length = rnd.uniform(0.6, 1.9)
        pts = [Vector((x0, y0, -0.12)) - out * 0.05]
        for j in range(1, 5):
            t = j / 4
            pts.append(pts[0] + out * (0.05 + 0.12 * math.sin(t * 2.5)) + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), -length * t)))
        a.add(tube(pts, lambda t: 0.045 * (1 - 0.85 * t), 6, 14), 'bark', grad('#4a2f1f', '#6d4a33', 0, 1))
    return a


def _weld(g, eps=1e-6):
    """Merge coincident vertices so smooth shading is continuous."""
    index, verts, remap = {}, [], []
    for p in g.v:
        key = (round(p.x / eps) * eps, round(p.y / eps) * eps, round(p.z / eps) * eps)
        key = (round(p.x, 5), round(p.y, 5), round(p.z, 5))
        if key not in index:
            index[key] = len(verts)
            verts.append(p)
        remap.append(index[key])
    g.v = verts
    g.local = [p.copy() for p in verts]
    faces, smooth = [], []
    for f, s in zip(g.f, g.smooth):
        nf = tuple(remap[i] for i in f)
        if len(set(nf)) >= 3:
            # drop duplicated corners of degenerate pole faces
            dedup = []
            for i in nf:
                if not dedup or dedup[-1] != i:
                    dedup.append(i)
            if dedup[0] == dedup[-1]:
                dedup.pop()
            if len(dedup) >= 3:
                faces.append(tuple(dedup))
                smooth.append(s)
    g.f, g.smooth = faces, smooth
    return g


def canopy(a, centre, radius, n, rnd, colors, material='canopy', squash=0.85, cards=1.0, warm='#e9f28a', bend=0.72):
    """A stylised foliage mass: a few soft lobes whose shading normals are bent away from the
    canopy centre (so light falls across one volume, not every lump), fringed with alpha-cut leaf
    sprigs that give a leafy silhouette. Paint runs dark and cool underneath to sunlit and warm on
    top, with gentle per-lobe hue drift."""
    lo, hi = colors
    centre = Vector(centre)
    top = centre.z + radius * 0.95
    bottom = centre.z - radius * 0.8
    sun = Vector((-0.45, -0.55, 0.7)).normalized()  # authored key direction for the painted light

    def paint_at(wp, drift=0.0):
        t = smoothstep(bottom, top, wp.z)
        c = mix(lo, hi, t ** 0.85)
        lit = max(0.0, (wp - centre).normalized().dot(sun)) if (wp - centre).length > 1e-6 else 0.0
        c = mix(c, warm, 0.22 * lit * t)
        return tuple(max(0.0, x * (1 + drift)) for x in c)

    blobs = []
    for k in range(n):
        ang = k * 2.39996 + rnd.uniform(-0.3, 0.3)
        rr = radius * (0.5 if k else 0.0) * rnd.uniform(0.75, 1.0)
        c = centre + Vector((rr * math.cos(ang), rr * math.sin(ang), rnd.uniform(-0.2, 0.35) * radius))
        s = radius * rnd.uniform(0.58, 0.8)
        blob = ico((s, s, s * squash), 3)
        blob.displace(s * 0.07, 1.1 / radius, rnd.random() * 10)
        blob.xf(loc=c)
        drift = rnd.uniform(-0.06, 0.06)
        a.add(blob, material, lambda lp, wp, d=drift: paint_at(wp, d), normals=(centre, bend))
        blobs.append((c, s, blob))
    if cards <= 0:
        return
    # leaf sprigs planted on the outer surface, growing outward
    sprigs = []
    for c, s, blob in blobs:
        step = max(1, int(4 / cards))
        for i in range(rnd.randrange(step), len(blob.v), step):
            p = blob.v[i]
            if any((p - c2).length < s2 * 0.93 for c2, s2, b2 in blobs if b2 is not blob):
                continue
            n_out = (p - c).normalized()
            if n_out.z < -0.55:
                continue  # skip the shaded underside; it costs cards and is rarely seen
            t1 = n_out.cross(Vector((0.0, 0.0, 1.0)) if abs(n_out.z) < 0.95 else Vector((1.0, 0.0, 0.0))).normalized()
            t1 = (Matrix.Rotation(rnd.uniform(0, math.tau), 3, n_out) @ t1).normalized()
            up = (n_out * 0.75 + t1 * rnd.uniform(-0.55, 0.55) + Vector((0, 0, 0.35))).normalized()
            right = up.cross(n_out).normalized()
            right = (Matrix.Rotation(rnd.uniform(-1.0, 1.0), 3, up) @ right).normalized()
            size = radius * rnd.uniform(0.5, 0.68)
            q = card(p + n_out * size * 0.08, up, right, size * 0.95, size, pivot=0.22)
            sprigs.append((q, rnd.uniform(-0.08, 0.08)))
    for q, drift in sprigs:
        a.add(q, 'leaves', lambda lp, wp, d=drift: paint_at(wp, d + 0.1), normals=(centre, 0.9))


def trunk(a, height, base_r, top_r, rnd, color=('#4d3222', '#7b5236'), branches=2, material='bark'):
    bend = Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))
    pts = [Vector((0, 0, 0)), Vector((0, 0, height * 0.4)) + bend * 0.5, Vector((0, 0, height)) + bend]
    a.add(tube(pts, lambda t: base_r + (top_r - base_r) * t ** 0.7, 14, 12), material, grad(color[0], color[1], 0, height))
    # root flare
    for k in range(5):
        ang = k * TAU / 5 + rnd.uniform(-0.3, 0.3)
        a.add(tube([(0, 0, 0.35), (math.cos(ang) * base_r * 1.3, math.sin(ang) * base_r * 1.3, 0.08), (math.cos(ang) * base_r * 2.1, math.sin(ang) * base_r * 2.1, -0.02)],
                   lambda t: base_r * 0.45 * (1 - 0.7 * t), 8, 8), material, color[0])
    tops = []
    for k in range(branches):
        ang = rnd.uniform(0, TAU)
        z0 = height * rnd.uniform(0.55, 0.8)
        start = Vector((0, 0, z0)) + bend * (z0 / height)
        end = start + Vector((math.cos(ang) * 0.7, math.sin(ang) * 0.7, 0.8))
        a.add(tube([start, (start + end) / 2 + Vector((0, 0, 0.1)), end], lambda t: top_r * 0.8 * (1 - 0.5 * t), 8, 8), material, color[1])
        tops.append(end)
    return Vector((0, 0, height)) + bend, tops


def tree_oak(seed=1):
    a = Asset('tree_oak', ao=1.2, ao_strength=0.8)
    rnd = random.Random(seed)
    top, tips = trunk(a, 2.5, 0.24, 0.13, rnd, branches=3)
    canopy(a, top + Vector((0, 0, 0.9)), 1.35, 9, rnd, ('#2c5f33', '#8ec35a'))
    for t in tips:
        canopy(a, t + Vector((0, 0, 0.3)), 0.75, 3, rnd, ('#2f6536', '#96c963'))
    return a


def tree_pine(seed=2):
    a = Asset('tree_pine', ao=1.0, ao_strength=0.8)
    rnd = random.Random(seed)
    a.add(tube([(0, 0, 0), (0, 0, 3.8)], lambda t: 0.17 * (1 - 0.8 * t), 10, 6), 'bark', grad('#4a2f20', '#6b4631', 0, 3))
    tiers = [(0.9, 1.5, 1.6), (1.8, 1.2, 1.4), (2.6, 0.95, 1.2), (3.3, 0.65, 1.0)]
    for i, (z, r, h) in enumerate(tiers):
        tier = lathe([(0.0, -0.05), (r, 0.0), (r * 0.9, 0.12), (r * 0.45, h * 0.6), (0.0, h)], 36,
                     wobble=lambda ang, t, i=i: 1 + 0.1 * math.cos(ang * 9 + i) * (1 - t) + 0.04 * math.sin(ang * 4), rings=12)
        tier.xf(loc=(0, 0, z))
        a.add(tier, 'canopy', mottle(lambda lp, wp: mix('#173f2e', '#4f915c', smoothstep(0.9, 4.2, wp.z) * 0.6 + smoothstep(-0.05, 0.8, lp.z) * 0.4), 0.1, 1.5, i))
    return a


def tree_birch(seed=3):
    a = Asset('tree_birch', ao=1.0, ao_strength=0.8)
    rnd = random.Random(seed)

    def bark(lp, wp):
        n = _n(lp.x, lp.y, lp.z * 4, 2.2, 12)
        dash = smoothstep(0.35, 0.45, n) * smoothstep(0.3, 0.5, abs(_n(lp.x * 3, lp.y * 3, lp.z, 1.5, 13)))
        return mix(mix('#ece6da', '#cfc6b6', smoothstep(0.0, 3.0, lp.z) * 0.3), '#3a332d', dash)
    top, tips = trunk(a, 3.0, 0.14, 0.08, rnd, color=('#e7e0d3', '#e7e0d3'), branches=2, material='rawwood')
    # repaint the trunk parts with birch bark
    a.parts = [(g, m, bark if m == 'rawwood' else p, b) for g, m, p, b in a.parts]
    canopy(a, top + Vector((0, 0, 0.6)), 1.0, 7, rnd, ('#5f9a3a', '#c9e27a'))
    for t in tips:
        canopy(a, t + Vector((0, 0, 0.2)), 0.55, 2, rnd, ('#6aa43f', '#cfe683'))
    return a


def tree_blossom(seed=4):
    a = Asset('tree_blossom', ao=1.1, ao_strength=0.8)
    rnd = random.Random(seed)
    top, tips = trunk(a, 2.1, 0.2, 0.11, rnd, color=('#43291e', '#6e4632'), branches=3)
    canopy(a, top + Vector((0, 0, 0.75)), 1.15, 8, rnd, ('#b04f78', '#ffb0cc'), warm='#ffe6ee')
    for t in tips:
        canopy(a, t + Vector((0, 0, 0.25)), 0.62, 3, rnd, ('#bd5d85', '#ffbdd4'), warm='#ffe6ee')
    return a


def bush(name='bush', seed=5, berries=None, flowers=None):
    a = Asset(name, ao=0.6, ao_strength=0.8)
    rnd = random.Random(seed)
    canopy(a, (0, 0, 0.35), 0.55, 6, rnd, ('#2f6536', '#86bf57'))
    if berries:
        for k in range(22):
            ang, el = rnd.uniform(0, TAU), rnd.uniform(0.1, 1.2)
            p = Vector((math.cos(ang) * math.cos(el) * 0.62, math.sin(ang) * math.cos(el) * 0.62, 0.35 + math.sin(el) * 0.5))
            a.add(sphere(0.05, 10, 6).xf(loc=p), 'glossy', berries)
    if flowers:
        for k in range(18):
            ang, el = rnd.uniform(0, TAU), rnd.uniform(0.2, 1.3)
            p = Vector((math.cos(ang) * math.cos(el) * 0.62, math.sin(ang) * math.cos(el) * 0.62, 0.35 + math.sin(el) * 0.5))
            for j in range(5):
                b = j * TAU / 5
                a.add(sphere((0.05, 0.05, 0.015), 8, 4).xf(loc=p + Vector((math.cos(b) * 0.045, math.sin(b) * 0.045, 0.01))), 'foliage', flowers)
            a.add(sphere(0.025, 8, 4).xf(loc=p + Vector((0, 0, 0.02))), 'foliage', '#ffd66b')
    return a


def rock(i):
    a = Asset(f'rock_{i}', ao=0.6, ao_strength=0.8)
    rnd = random.Random(20 + i)
    sizes = [(0.7, 0.55, 0.5), (0.45, 0.4, 0.55), (1.0, 0.72, 0.45)]
    sx, sy, sz = sizes[i]
    g = faceted_stone((sx, sy, sz), rnd, cuts=9 + i * 2)
    top = max(p.z for p in g.v)

    def paint(lp, wp):
        stone = mix('#7a756d', '#b3ab9f', 0.5 + 0.5 * _n(lp.x, lp.y, lp.z, 1.6, i))
        stone = mix(stone, '#d6cfc2', smoothstep(top * 0.55, top, lp.z) * 0.35)  # sun-bleached crown
        moss = smoothstep(top * 0.62, top * 0.9, lp.z + 0.1 * _n(lp.x, lp.y, lp.z, 2.2, i + 4))
        return mix(stone, mix('#4f8a32', '#9cc75a', 0.5 + 0.5 * _n(lp.x, lp.y, lp.z, 4, i)), moss * 0.9)
    a.add(g, 'stone', paint)
    return a


def faceted_stone(size, rnd, cuts=10, sub=4, floor=-0.05):
    """A chunky toy boulder: a squashed sphere trimmed by random planes into broad flat facets,
    with rounded edges left by the dense tessellation (reads as bevelled at game distance)."""
    sx, sy, sz = size
    g = ico((sx, sy, sz), sub)
    planes = []
    for _ in range(cuts):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))).normalized()
        support = math.sqrt((n.x * sx) ** 2 + (n.y * sy) ** 2 + (n.z * sz) ** 2)
        planes.append((n, support * rnd.uniform(0.72, 0.9)))

    def trim(p):
        for n, d in planes:
            over = p.dot(n) - d
            if over > 0:
                p = p - n * over
        return Vector((p.x, p.y, max(p.z, floor)))
    g.deform(trim)
    g.displace(0.018 * sx, 3.0, rnd.random() * 10)
    return g.bake_local()


def mushrooms():
    a = Asset('mushrooms', ao=0.4)
    spec = [((0, 0), 0.34, 0.42, '#d8333b', True), ((0.32, 0.12), 0.2, 0.26, '#e25248', True), ((-0.28, 0.16), 0.22, 0.3, '#b7875c', False),
            ((0.12, -0.26), 0.14, 0.18, '#c89b6a', False)]
    for (x, y), r, h, col, dots in spec:
        a.add(lathe([(0.0, 0.0), (r * 0.32, 0.0), (r * 0.26, h * 0.5), (r * 0.3, h), (0.0, h)], 20).xf(loc=(x, y, 0)), 'mushroom', '#f6ecd8')
        cap = lathe([(0.0, h * 0.92), (r, h * 0.88), (r * 1.02, h * 0.95), (r * 0.8, h * 1.28), (r * 0.4, h * 1.42), (0.0, h * 1.46)], 32)
        cap.xf(loc=(x, y, 0))
        a.add(cap, 'mushroom', grad(col, mix(col, '#ffffff', 0.25), h, h * 1.45))
        a.add(lathe([(0.0, h * 0.93), (r * 0.97, h * 0.9), (0.0, h * 0.9)], 32, rings=None).xf(loc=(x, y, 0)), 'mushroom', '#f1dcbc')
        if dots:
            for k in range(7):
                ang = k * 2.39996
                rr = r * (0.35 + 0.35 * (k % 3) / 2)
                z = h * (1.42 - 0.5 * (rr / r) ** 2)
                a.add(sphere((0.035 * r / 0.3, 0.035 * r / 0.3, 0.014), 10, 6).xf(loc=(x + rr * math.cos(ang), y + rr * math.sin(ang), z)), 'mushroom', '#fff8ec')
    return a


def fern(seed=6):
    a = Asset('fern', ao=0.4)
    rnd = random.Random(seed)
    for k in range(9):
        ang = k * TAU / 9 + rnd.uniform(-0.2, 0.2)
        length = rnd.uniform(0.55, 0.8)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        pts = [Vector((0, 0, 0.02)), d * length * 0.35 + Vector((0, 0, length * 0.55)), d * length + Vector((0, 0, length * 0.45))]
        a.add(tube(pts, lambda t: 0.014 * (1 - 0.7 * t), 6, 10), 'foliage', '#3f7a33')
        for j in range(7):
            t = 0.25 + j * 0.11
            p = (pts[0].lerp(pts[1], min(1, t * 2)) if t < 0.5 else pts[1].lerp(pts[2], (t - 0.5) * 2))
            size = 0.22 * (1 - t * 0.7)
            for side in (-1, 1):
                lf = leaf(size, size * 0.4, 0.012, 0.03, 8, 4)
                lf.xf(loc=p, rot=(0, -0.3, ang + side * 1.1))
                a.add(lf, 'foliage', grad('#2f6d33', '#8bc85f', 0, size, 0))
    return a


def flower(kind):
    a = Asset(f'flower_{kind}', ao=0.2)
    stem_top = Vector((0.02, 0, 0.42))
    a.add(tube([(0, 0, 0), (0.03, 0, 0.22), stem_top], 0.014, 6, 10), 'foliage', '#4f8f3a')
    lf = leaf(0.2, 0.08, 0.012, 0.05, 12, 6)
    a.add(lf.xf(loc=(0.01, 0, 0.1), rot=(0, -0.5, 0.6)), 'foliage', grad('#3f7f35', '#86c35d', 0, 0.2, 0))
    if kind == 'daisy':
        for k in range(12):
            b = k * TAU / 12
            a.add(sphere((0.075, 0.022, 0.01), 10, 4).xf(loc=stem_top + Vector((math.cos(b) * 0.07, math.sin(b) * 0.07, 0)), rot=(0, 0, b)), 'foliage', '#fffaf0')
        a.add(sphere((0.04, 0.04, 0.022), 12, 6).xf(loc=stem_top + Vector((0, 0, 0.012))), 'foliage', '#f6c33b')
    elif kind == 'bell':
        for k in range(3):
            p = stem_top + Vector((0.04 + k * 0.05, 0, -0.04 - k * 0.07))
            bell = lathe([(0.0, 0.0), (0.035, 0.005), (0.05, -0.05), (0.06, -0.09), (0.045, -0.085), (0.0, -0.06)], 16)
            a.add(bell.xf(loc=p), 'foliage', grad('#5b6fd6', '#9aa8f4', -0.09, 0.0))
    elif kind == 'tulip':
        cup = lathe([(0.0, 0.0), (0.05, 0.01), (0.07, 0.07), (0.06, 0.13), (0.0, 0.1)], 20, wobble=lambda ang, t: 1 + 0.15 * max(0.0, math.cos(ang * 3)) * t)
        a.add(cup.xf(loc=stem_top), 'foliage', grad('#e0445e', '#ff8fa0', 0.0, 0.13))
    elif kind == 'sun':
        for k in range(5):
            b = k * TAU / 5
            a.add(sphere((0.055, 0.05, 0.015), 10, 4).xf(loc=stem_top + Vector((math.cos(b) * 0.05, math.sin(b) * 0.05, 0.01)), rot=(0.3 * math.cos(b), 0.3 * math.sin(b), b)), 'glossy', '#ffd23f')
        a.add(sphere(0.025, 8, 6).xf(loc=stem_top + Vector((0, 0, 0.02))), 'foliage', '#9a7a2a')
    return a


def log():
    a = Asset('log', ao=0.6)
    body = tube([(-1.1, 0, 0.28), (0.0, 0.05, 0.3), (1.1, 0, 0.26)], lambda t: 0.28 - 0.04 * t, 20, 12, caps=False)
    a.add(body, 'bark', mottle(grad('#4a3021', '#77503a', 0.0, 0.56), 0.1, 3))
    for x, r in ((-1.1, 0.28), (1.1, 0.24)):
        disc = cyl(r, r, 0.01, 28).xf(loc=(x, 0, 0.28), rot=(0, math.pi / 2, 0))
        a.add(disc, 'rawwood', lambda lp, wp, r=r: mix('#e0b68a', '#9c6a44', 0.5 + 0.5 * math.sin(math.hypot(lp.x, lp.y) / r * 20)))
    moss = ico((0.7, 0.26, 0.08), 2)
    moss.displace(0.03, 4, 2)
    a.add(moss.xf(loc=(-0.2, 0.0, 0.55)), 'canopy', grad('#3f7430', '#86b84f', 0.5, 0.62))
    for k in range(3):
        a.add(lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.02), (0.0, 0.04)], 16).xf(loc=(0.4 + k * 0.14, -0.26, 0.2 + k * 0.06), rot=(math.pi / 2, 0, 0)), 'mushroom', '#e9c28c')
    return a


def pond():
    a = Asset('pond', ao=0.5)
    rnd = random.Random(31)
    rx, ry = 1.25, 0.85
    bowl = lathe([(0.0, -0.2), (0.55, -0.19), (0.85, -0.15), (1.0, -0.06), (1.06, 0.02)], 48, rings=None, caps=False)
    bowl.deform(lambda p: Vector((p.x * rx, p.y * ry, p.z)))
    # sandy shallows rising to mossy banks, seen through the water
    a.add(bowl, 'soil', grad3('#3f6b5a', '#8f8a62', '#6f7a44', -0.2, -0.08, 0.02))
    for k in range(26):
        ang = k * TAU / 26 + rnd.uniform(-0.05, 0.05)
        st = ico((rnd.uniform(0.12, 0.2), rnd.uniform(0.1, 0.16), rnd.uniform(0.06, 0.1)), 2)
        st.displace(0.03, 5, k)
        st.xf(loc=(math.cos(ang) * rx * 1.07, math.sin(ang) * ry * 1.1, 0.02), rot=(0, 0, ang))
        a.add(st, 'stone', mottle(mix('#79736b', '#b0a898', rnd.random()), 0.1, 4, k))
    for (x, y, r) in ((-0.4, 0.1, 0.2), (0.3, -0.2, 0.16), (0.55, 0.25, 0.13)):
        pad = cyl(r, r, 0.012, 24).xf(loc=(x, y, -0.02))
        pad.deform(lambda p, x=x, y=y, r=r: p if not (p.x - x > 0 and abs(p.y - y) < r * 0.12) else Vector((x + (p.x - x) * 0.1, p.y, p.z)))
        a.add(pad, 'waxy', grad('#3d7f3a', '#7cb65a', -r, r, 0))
    a.add(lathe([(0.0, 0.0), (0.05, 0.0), (0.07, 0.05), (0.0, 0.08)], 16, wobble=lambda ang, t: 1 + 0.2 * max(0.0, math.cos(ang * 4))).xf(loc=(-0.4, 0.12, -0.01)), 'foliage', '#ffc2d6')
    for k in range(7):
        x = -1.1 + rnd.uniform(-0.08, 0.08) + (k % 3) * 0.08
        y = 0.35 + k * 0.05
        h = rnd.uniform(0.7, 1.0)
        a.add(tube([(x, y, 0), (x + 0.03, y, h * 0.6), (x + 0.06, y, h)], 0.012, 6, 8), 'foliage', '#5f8f3a')
        if k % 2 == 0:
            a.add(tube([(x + 0.05, y, h * 0.8), (x + 0.06, y, h * 0.95)], 0.03, 10, 6), 'rawwood', '#6a4028')
    return a


def pond_water():
    a = Asset('pond_water', ao=0.0, ground=False)
    g = cyl(1.0, 1.0, 0.001, 48, caps=True).xf(loc=(0, 0, -0.03), scl=(1.25 * 1.02, 0.85 * 1.02, 1))
    a.add(g, 'water', '#ffffff')
    return a


def stone_step(i=0):
    a = Asset(f'stone_step', ao=0.3)
    g = cyl(0.3, 0.33, 0.08, 20).xf(loc=(0, 0, 0.02), scl=(1.0, 0.8, 1))
    g.displace(0.02, 5, 3)
    a.add(g, 'stone', mottle(grad('#8c867d', '#b9b1a3', -0.02, 0.06), 0.08, 5))
    return a


def tuft():
    a = Asset('tuft', ao=0.2)
    rnd = random.Random(40)
    for k in range(9):
        ang = rnd.uniform(0, TAU)
        h = rnd.uniform(0.2, 0.4)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        a.add(tube([d * 0.02, d * 0.06 + Vector((0, 0, h * 0.6)), d * 0.14 + Vector((0, 0, h))], lambda t: 0.018 * (1 - t), 4, 6), 'foliage', grad('#3f7a2f', '#9ccc5f', 0, 0.4))
    return a


ALL = [island, tree_oak, tree_pine, tree_birch, tree_blossom, lambda: bush('bush', 5), lambda: bush('bush_berry', 6, berries='#d6344a'),
       lambda: bush('bush_flower', 7, flowers='#ffc1d8'), lambda: rock(0), lambda: rock(1), lambda: rock(2), mushrooms, fern,
       lambda: flower('daisy'), lambda: flower('bell'), lambda: flower('tulip'), lambda: flower('sun'), log, pond, pond_water, stone_step, tuft]


def build(lib, collection):
    return [fn().build(lib, collection) for fn in ALL]
