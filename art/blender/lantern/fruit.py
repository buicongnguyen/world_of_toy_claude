"""Twelve toy fruit. Each is authored at roughly unit width with its base at z=0; the game
scales them by their gameplay radius. Faces are placed by ray-casting onto each fruit's actual
surface so features sit perfectly on curved bodies."""
import math

from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

from .core import (TAU, Asset, Geo, as_paint, grad, grad3, lathe, leaf, lin, mix, mottle, smoothstep, solid,
                   sphere, torus, tube)

EYE = '#23191f'
GLINT = '#ffffff'
CHEEK = '#ff8fa3'


# ----------------------------------------------------------------------------- surface helpers
class Surface:
    def __init__(self, *geos):
        verts, faces = [], []
        for g in geos:
            base = len(verts)
            verts += g.v
            faces += [tuple(i + base for i in f) for f in g.f]
        self.tree = BVHTree.FromPolygons(verts, faces, epsilon=0.0)

    def front(self, x, z, y0=-5.0):
        """Point and outward normal on the front (-Y) side at (x, z)."""
        loc, n, _, _ = self.tree.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)), 20)
        if loc is None:
            return None, None
        if n.y > 0:
            n = -n
        return loc, n.normalized()

    def along(self, origin, direction):
        loc, n, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction).normalized(), 20)
        return loc, n


def stick_on(geo, point, normal, embed=0.0):
    """Orient a feature authored facing -Y onto a surface point."""
    q = Vector((0, -1, 0)).rotation_difference(normal)
    m = q.to_matrix().to_4x4()
    m.translation = point - normal * embed
    return geo.matrix(m)


def face(a, surf, cx=0.0, cz=0.5, size=1.0, spread=0.13, smile=True, cheeks=True, look=0.0):
    """Glossy toy eyes, glints, cheeks and a tiny smile, projected onto the surface."""
    for side in (-1, 1):
        x = cx + side * spread * size
        p, n = surf.front(x, cz)
        if p is None:
            continue
        eye = sphere((0.036 * size, 0.022 * size, 0.05 * size), 16, 10)
        a.add(stick_on(eye, p, n, 0.008 * size), 'eye', EYE)
        gp, gn = surf.front(x - 0.012 * size + look, cz + 0.022 * size)
        glint = sphere((0.011 * size, 0.008 * size, 0.013 * size), 10, 6)
        a.add(stick_on(glint, gp + gn * 0.017 * size, gn, 0), 'eye', GLINT)
        if cheeks:
            cp, cn = surf.front(cx + side * spread * 1.75 * size, cz - 0.075 * size)
            if cp is not None:
                cheek = sphere((0.055 * size, 0.012 * size, 0.032 * size), 14, 8)
                a.add(stick_on(cheek, cp, cn, 0.004), 'fuzzy', CHEEK)
    if smile:
        pts = []
        for t in (-1, -0.5, 0, 0.5, 1):
            x = cx + t * 0.045 * size
            z = cz - 0.07 * size - (1 - t * t) * 0.022 * size
            p, n = surf.front(x, z)
            if p is not None:
                pts.append(p + n * 0.006)
        if len(pts) >= 3:
            a.add(tube(pts, 0.0095 * size, 8, 14), 'eye', EYE)


def stem_leaf(a, top, lean=0.12, length=0.2, leaf_len=0.34, leaf_angle=0.5, stem_color='#6d5634', leaf_colors=('#2e8a47', '#86cf5e')):
    tip = top + Vector((lean * 0.5, 0.02, length))
    a.add(tube([top - Vector((0, 0, 0.04)), top + Vector((lean * 0.15, 0.0, length * 0.6)), tip], lambda t: 0.026 * (1 - 0.35 * t), 8), 'rawwood',
          grad(stem_color, '#8f7248', 0, length, 2))
    lf = leaf(leaf_len, leaf_len * 0.45, 0.02, 0.07, 18, 8, curl=0.3)
    lf.xf(loc=tip - Vector((0.02, 0, 0.03)), rot=(0.25, -0.35, leaf_angle))
    a.add(lf, 'foliage', grad(leaf_colors[0], leaf_colors[1], 0, leaf_len, 0))
    return tip


def seam(a, surf, points_xz, color, radius=0.012, material='fuzzy'):
    pts = []
    for x, z in points_xz:
        p, n = surf.front(x, z)
        if p is not None:
            pts.append(p - n * 0.004)
    if len(pts) > 2:
        a.add(tube(pts, radius, 8, 24), material, color)


# ----------------------------------------------------------------------------- the fruit
def cherries():
    a = Asset('fruit_0', ao=0.3)
    for s in (-1, 1):
        g = lathe([(0, 0.02), (0.16, 0.035), (0.26, 0.14), (0.3, 0.3), (0.28, 0.45), (0.2, 0.54), (0.08, 0.56), (0.03, 0.53), (0, 0.51)], 32,
                  wobble=lambda ang, t: 1 + 0.03 * math.cos(ang * 2), rings=30)
        g.xf(loc=(0.215 * s, 0.01 * s, 0), rot=(0, 0.1 * s, 0.25 * s))
        a.add(g, 'glossy', grad3('#5e0319', '#c20d36', '#ff4d6d', 0.0, 0.28, 0.58))
    knot = Vector((0.03, 0.05, 0.9))
    for s in (-1, 1):
        a.add(tube([(0.215 * s + 0.1 * s, 0.0, 0.5), (0.12 * s + 0.03, 0.03, 0.72), knot], lambda t: 0.026 * (1 - 0.25 * t), 8, 20), 'waxy',
              grad('#4f7a2a', '#7a5a2e', 0.5, 0.9, 2))
    lf = leaf(0.38, 0.18, 0.022, 0.06, 18, 8, curl=0.25)
    lf.xf(loc=knot + Vector((0.0, 0.0, -0.02)), rot=(0.2, -0.3, 0.45))
    a.add(lf, 'foliage', grad('#23753d', '#7cc957', 0, 0.38, 0))
    return a


def strawberry():
    a = Asset('fruit_1', ao=0.3)
    body = lathe([(0.0, 0.0), (0.06, 0.02), (0.2, 0.12), (0.33, 0.3), (0.41, 0.5), (0.4, 0.66), (0.31, 0.77), (0.16, 0.81), (0.0, 0.8)], 36,
                 wobble=lambda ang, t: 1 + 0.03 * math.cos(ang * 3) * t)
    a.add(body, 'glossy', mottle(grad3('#b40a2a', '#ec2744', '#ff6a57', 0.0, 0.45, 0.8), 0.06, 7))
    surf = Surface(body)
    # seeds sit in little dimples, spiralling around the berry
    for i in range(46):
        t = (i + 0.5) / 46
        z = 0.1 + t * 0.62
        ang = i * 2.39996
        loc, n = surf.along((math.cos(ang) * 2, math.sin(ang) * 2, z), (-math.cos(ang), -math.sin(ang), 0))
        if loc is None or (abs(math.cos(ang)) < 0.35 and math.sin(ang) < 0 and 0.28 < z < 0.6):
            continue  # keep the face area clear
        seed = sphere((0.013, 0.022, 0.013), 8, 6)
        q = Vector((0, 1, 0)).rotation_difference(n)
        m = q.to_matrix().to_4x4()
        m.translation = loc - n * 0.006
        a.add(seed.matrix(m), 'glossy', '#f6d56b')
    for k in range(7):
        ang = k * TAU / 7
        lf = leaf(0.24, 0.1, 0.018, -0.05, 14, 6, curl=0.2)
        lf.xf(loc=(0.03 * math.cos(ang), 0.03 * math.sin(ang), 0.8), rot=(0, -0.25, ang))
        a.add(lf, 'foliage', grad('#2b7a3f', '#77c75a', 0, 0.24, 0))
    a.add(tube([(0, 0, 0.78), (0.02, 0, 0.9), (0.06, 0.01, 0.97)], 0.022, 8, 10), 'waxy', '#5d8a36')
    face(a, surf, 0.0, 0.43, 0.95, spread=0.12)
    return a


def grapes():
    a = Asset('fruit_2', ao=0.35)
    rnd = __import__('random').Random(7)
    spots = [(-0.2, 0.05, 0.69, 0.2), (0.19, 0.05, 0.7, 0.21), (0.0, 0.14, 0.86, 0.19), (-0.02, -0.14, 0.73, 0.2), (-0.27, -0.08, 0.47, 0.19),
             (0.14, -0.16, 0.47, 0.21), (0.3, 0.13, 0.48, 0.18), (-0.1, 0.2, 0.52, 0.18), (0.0, -0.03, 0.27, 0.17), (-0.15, -0.1, 0.24, 0.15),
             (0.14, 0.06, 0.25, 0.16), (0.02, -0.12, 0.09, 0.1)]
    for x, y, z, r in spots:
        g = sphere((r, r, r * 1.08), 20, 12)
        g.xf(loc=(x, y, z))
        c0 = mix('#3a1f78', '#6a3fc0', rnd.random())
        a.add(g, 'bloom', grad(c0, mix(c0, '#b28cf2', 0.55), z - r, z + r))
    a.add(tube([(0, 0.02, 0.8), (0.01, 0.03, 1.02), (0.08, 0.05, 1.12)], lambda t: 0.028 * (1 - 0.4 * t), 8, 12), 'rawwood', '#7a6340')
    a.add(tube([(0.08, 0.05, 1.08), (0.18, 0.02, 1.13), (0.2, 0.0, 1.05), (0.15, -0.01, 1.02)], 0.008, 6, 20), 'waxy', '#7ea34a')
    lf = leaf(0.38, 0.22, 0.02, 0.08, 18, 8, curl=0.3)
    lf.xf(loc=(0.05, 0.05, 1.04), rot=(0.1, -0.3, 2.6))
    a.add(lf, 'foliage', grad('#2f7f45', '#89cf66', 0, 0.38, 0))
    return a


def apple():
    a = Asset('fruit_9', ao=0.3)
    body = lathe([(0.0, 0.05), (0.14, 0.03), (0.3, 0.1), (0.42, 0.26), (0.46, 0.46), (0.43, 0.64), (0.33, 0.77), (0.17, 0.8), (0.06, 0.74), (0.0, 0.7)], 36,
                 wobble=lambda ang, t: 1 + 0.035 * math.cos(ang * 5) * t)

    def paint(lp, wp):
        ang = math.atan2(lp.y, lp.x)
        streak = 0.5 + 0.5 * noise.noise(Vector((math.cos(ang) * 3, math.sin(ang) * 3, lp.z * 1.5)))
        base = mix('#b3122c', '#e43246', streak * 0.8 + 0.2)
        return mix(base, '#f0c95a', smoothstep(0.66, 0.8, lp.z) * 0.55 + smoothstep(0.25, 0.0, lp.z) * 0.25)
    a.add(body, 'glossy', paint)
    surf = Surface(body)
    stem_leaf(a, Vector((0, 0, 0.73)), 0.1, 0.2, 0.34, 0.5)
    face(a, surf, 0.0, 0.42, 1.0)
    return a


def orange():
    a = Asset('fruit_3', ao=0.3)
    body = sphere((0.46, 0.46, 0.43), 40, 24).xf(loc=(0, 0, 0.43))
    body.bake_local()
    a.add(body, 'rind', mottle(grad('#e8650a', '#ffab3d', 0.1, 0.8), 0.05, 6))
    surf = Surface(body)
    stem_leaf(a, Vector((0, 0, 0.85)), 0.06, 0.1, 0.36, 0.7)
    a.add(sphere((0.05, 0.05, 0.02), 10, 6).xf(loc=(0, 0, 0.855)), 'waxy', '#6e8a36')
    face(a, surf, 0.0, 0.43, 1.05)
    return a


def lemon():
    a = Asset('fruit_4', ao=0.3)
    body = lathe([(0.0, -0.56), (0.05, -0.5), (0.14, -0.44), (0.27, -0.3), (0.36, -0.1), (0.37, 0.08), (0.3, 0.28), (0.16, 0.44), (0.06, 0.52), (0.0, 0.57)], 36)
    body.bake_local()
    body.deform(lambda p: Vector((p.z, p.y * 1.0, p.x * 0.95 + 0.36)))
    a.add(body, 'rind', lambda lp, wp: mix(mix('#f0bc12', '#ffe25a', smoothstep(0.05, 0.62, wp.z)), '#b8c43a', smoothstep(0.42, 0.56, abs(lp.z)) * 0.7))
    surf = Surface(body)
    lf = leaf(0.32, 0.15, 0.02, 0.07, 16, 8, curl=0.3)
    lf.xf(loc=(-0.12, 0.02, 0.68), rot=(0.3, -0.25, 2.9))
    a.add(lf, 'foliage', grad('#2e8a47', '#86cf5e', 0, 0.32, 0))
    a.add(tube([(-0.05, 0.02, 0.66), (-0.1, 0.02, 0.73)], 0.018, 8, 6), 'rawwood', '#6d5634')
    face(a, surf, 0.0, 0.36, 1.0)
    return a


def pear():
    a = Asset('fruit_5', ao=0.3)
    body = lathe([(0.0, 0.03), (0.2, 0.04), (0.38, 0.16), (0.44, 0.34), (0.4, 0.52), (0.29, 0.68), (0.2, 0.84), (0.16, 0.97), (0.09, 1.04), (0.0, 1.05)], 36,
                 wobble=lambda ang, t: 1 + 0.02 * math.cos(ang * 3))

    def paint(lp, wp):
        base = mix('#7fb238', '#d8e05e', smoothstep(0.05, 0.95, lp.z))
        blush = max(0.0, (lp.x * 0.7 + lp.y * -0.2 + lp.z * 0.3) - 0.35) * 1.6
        return mix(base, '#f0955e', min(0.5, blush))
    a.add(body, 'waxy', mottle(paint, 0.05, 8))
    surf = Surface(body)
    stem_leaf(a, Vector((0, 0, 1.02)), 0.14, 0.18, 0.3, 0.6)
    face(a, surf, 0.0, 0.38, 1.0)
    return a


def peach():
    a = Asset('fruit_6', ao=0.35)
    body = lathe([(0.0, 0.03), (0.18, 0.04), (0.36, 0.14), (0.45, 0.32), (0.45, 0.52), (0.38, 0.7), (0.24, 0.82), (0.08, 0.86), (0.0, 0.83)], 40,
                 wobble=lambda ang, t: 1 - 0.06 * math.exp(-((math.atan2(math.sin(ang - 1.5708), math.cos(ang - 1.5708))) ** 2) / 0.04) * math.sin(t * math.pi))

    def paint(lp, wp):
        base = mix('#ffcf94', '#ffb07a', smoothstep(0.0, 0.8, lp.z))
        blush = smoothstep(0.1, 0.8, lp.x * 0.8 + lp.z * 0.55 - 0.1)
        return mix(base, '#f2506c', blush * 0.75)
    a.add(body, 'fuzzy', paint)
    surf = Surface(body)
    stem_leaf(a, Vector((0, 0, 0.84)), 0.06, 0.1, 0.36, 0.5)
    face(a, surf, 0.0, 0.42, 1.05)
    return a


def pineapple():
    a = Asset('fruit_7', ao=0.4)
    prof = [(0.0, 0.02), (0.22, 0.03), (0.34, 0.12), (0.4, 0.3), (0.41, 0.5), (0.38, 0.7), (0.3, 0.86), (0.18, 0.95), (0.0, 0.97)]
    DIA_U, DIA_V = 8, 7.5

    def cell(p):
        ang = math.atan2(p.y, p.x)
        u, v = ang / TAU * DIA_U, p.z * DIA_V
        return abs(((u + v) % 1) - 0.5) + abs(((u - v) % 1) - 0.5)

    def lattice(p):
        r = math.hypot(p.x, p.y)
        if r < 1e-5:
            return p
        bump = (0.5 - min(0.5, cell(p))) * 0.09 * min(1, r * 5)
        k = (r + bump) / r
        return Vector((p.x * k, p.y * k, p.z))
    body = lathe(prof, 96, rings=64)
    body.bake_local()
    body.deform(lattice)

    def paint(lp, wp):
        c = cell(lp)
        groove = smoothstep(0.12, 0.42, 0.5 - c + 0.25)
        base = mix('#d98a1c', '#ffc93d', smoothstep(0.05, 0.85, lp.z))
        tip = mix(base, '#7d9a2c', smoothstep(0.38, 0.2, 0.5 - c) * 0.35)  # little green points in each eye
        return mix(tip, '#7a3d0e', (1 - groove) * 0.8)
    a.add(body, 'waxy', paint)
    for k in range(16):
        ang = k * 2.39996
        inner = k < 6
        length = (0.52 if inner else 0.4) + (k % 3) * 0.05
        lf = leaf(length, 0.11, 0.024, 0.1, 14, 6, curl=0.1)
        lf.xf(loc=(0.04 * math.cos(ang), 0.04 * math.sin(ang), 0.9), rot=(0, -1.35 + (0.15 if inner else 0.55), ang))
        a.add(lf, 'foliage', grad('#1f6b45', '#8fd06a', 0, length, 0))
    return a


def watermelon():
    a = Asset('fruit_8', ao=0.3)
    body = sphere((0.56, 0.52, 0.5), 64, 36).xf(loc=(0, 0, 0.5))
    body.bake_local()

    def paint(lp, wp):
        ang = math.atan2(lp.y, lp.x)
        wob = 0.18 * noise.noise(Vector((lp.x * 3, lp.y * 3, lp.z * 3)))
        stripe = 0.5 + 0.5 * math.cos((ang + wob) * 11)
        base = mix('#76c35e', '#1b5e35', smoothstep(0.35, 0.7, stripe))
        spot = smoothstep(0.12, 0.02, lp.z)  # the pale field spot underneath
        return mix(mix(base, '#b8e07a', smoothstep(0.85, 1.0, lp.z) * 0.2), '#e1dc8a', spot * 0.8)
    a.add(body, 'glossy', paint)
    surf = Surface(body)
    a.add(tube([(0, 0, 0.98), (0.03, 0, 1.08), (0.1, 0.02, 1.12), (0.14, 0.0, 1.06)], lambda t: 0.028 * (1 - 0.5 * t), 8, 14), 'waxy', '#5f7f35')
    a.add(tube([(0.12, 0.0, 1.07), (0.2, -0.02, 1.12), (0.24, -0.01, 1.05), (0.2, 0.0, 1.0)], 0.009, 6, 16), 'waxy', '#7ea34a')
    face(a, surf, 0.0, 0.5, 1.25)
    return a


def plum():
    a = Asset('fruit_10', ao=0.3)
    body = lathe([(0.0, 0.03), (0.2, 0.05), (0.36, 0.18), (0.41, 0.4), (0.4, 0.6), (0.32, 0.8), (0.18, 0.92), (0.0, 0.94)], 36,
                 wobble=lambda ang, t: 1 - 0.05 * math.exp(-((math.atan2(math.sin(ang + 1.9), math.cos(ang + 1.9))) ** 2) / 0.03) * math.sin(t * math.pi))
    a.add(body, 'bloom', grad3('#3a1d6e', '#6436a8', '#9a6ade', 0.0, 0.45, 0.95))
    surf = Surface(body)
    stem_leaf(a, Vector((0, 0, 0.92)), 0.1, 0.14, 0.3, 1.2, '#5c4630')
    face(a, surf, 0.02, 0.45, 1.0)
    return a


def dragon_fruit():
    a = Asset('fruit_11', ao=0.35)
    body = lathe([(0.0, 0.02), (0.18, 0.03), (0.33, 0.14), (0.4, 0.34), (0.4, 0.56), (0.33, 0.76), (0.18, 0.9), (0.0, 0.93)], 36)
    a.add(body, 'waxy', grad3('#d8126a', '#ff3f8f', '#ff86b8', 0.0, 0.45, 0.93))
    for row in range(4):
        z = 0.2 + row * 0.2
        n = 7 if row < 3 else 5
        r = [0.37, 0.41, 0.38, 0.27][row]
        for k in range(n):
            ang = k * TAU / n + row * 0.45
            length = 0.3 - row * 0.03
            lf = leaf(length, 0.16, 0.025, 0.14, 16, 8, curl=0.2)
            lf.xf(loc=(r * math.cos(ang), r * math.sin(ang), z), rot=(0, -1.0 + row * 0.1, ang))

            def paint(lp, wp, length=length):
                return mix(mix('#ff4f98', '#ff7aa8', smoothstep(0, 0.4, lp.x / length)), '#8fd65e', smoothstep(0.55, 0.95, lp.x / length))
            a.add(lf, 'waxy', paint)
    tips = leaf(0.2, 0.1, 0.02, 0.1, 12, 6)
    for k in range(4):
        t = tips.copy().xf(loc=(0, 0, 0.9), rot=(0, -1.2, k * TAU / 4 + 0.4))
        a.add(t, 'waxy', grad('#ff5fa0', '#7fcf55', 0, 0.2, 0))
    return a


ALL = [cherries, strawberry, grapes, orange, lemon, pear, peach, pineapple, watermelon, apple, plum, dragon_fruit]


def build(lib, collection):
    objs = []
    for fn in ALL:
        objs.append(fn().build(lib, collection))
    return objs
