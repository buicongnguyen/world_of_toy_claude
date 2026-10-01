"""Render the HUD and menu icon kit as small toy objects, in the same look as the fruit and friends.

    npm run assets:ui       (blender --background --factory-startup --python this file)

Outputs assets/lantern-picnic/ui/<name>.png: 128 px, transparent RGBA, no metadata, shown at 24-44 CSS px.

    settings    cog                        sound-on   brass bell, ringing
    sound-off   the bell, tipped and hushed with a felt stopper
    undo        curved arrow               restart    circular arrow
    journey     storybook with a ribbon    help       rolled parchment scroll
    shop        little trunk, brass corners
    close       two crossed rounded sticks chevron    rounded down-chevron
    coin        golden joy with an embossed lantern
    music       note                       effects    sparkle
    forest      leaf sprig                 voices     speech bubble
    motion      feather                    hints      glowing paper lantern
    language    globe on a stand

Every icon is modelled here from the shared toolkit (lantern.core) and the shared surface library
(lantern.textures), so gloss, felt, wood and brass match the in-game assets. Colour is vertex paint
multiplied by ray-traced AO, as everywhere else. Environment overrides:
    UI_SIZE (128)  UI_SAMPLES (256)  UI_OUT (assets/lantern-picnic/ui)  UI_ONLY (comma-separated names)
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from lantern import preview, textures  # noqa: E402
from lantern.core import Asset, Geo, cyl, grad, lathe, leaf, lin, mix, rbox, smoothstep, sphere, torus, tube  # noqa: E402

SIZE = int(os.environ.get('UI_SIZE', 128))
SAMPLES = int(os.environ.get('UI_SAMPLES', 256))
OUT = os.environ.get('UI_OUT') or os.path.join(ROOT, 'assets', 'lantern-picnic', 'ui')
ONLY = [n for n in os.environ.get('UI_ONLY', '').split(',') if n]
FILL = 0.8  # silhouette share of the frame
os.makedirs(OUT, exist_ok=True)

# Vivid, warm toy palette: each settings row gets its own hue so the list scans at a glance.
C = dict(
    tangerine='#f47b16', cherry='#d8323b', cocoa='#8a4726', teal='#0f9c98', violet='#8a4fd8',
    raspberry='#d62f68', sunflower='#ffae0a', leaf='#46ab34', leaf_tip='#9ad83f', sky='#2595ea',
    rose='#ff5d86', cream='#fff1d6', parchment='#f4dca8', wood='#b8672f', dark_wood='#8e4a22',
    ocean='#237fd6', land='#5dbd3f', felt_red='#e2415e', ink='#3a2216',
)

# ----------------------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TEX = textures.generate(os.path.join(HERE, '.cache', 'ui-textures'), size=256, keys=['skin', 'felt', 'wood', 'paper', 'leaf'])
textures.SURFACES.update({
    'lacquer': dict(rough=0.26, coat=0.7, coat_rough=0.08, detail='skin', tile=4, nstr=0.12),
    'gold': dict(base='#f3c552', rough=0.24, metal=1.0),
    'lampglow': dict(rough=0.6, coat=0.25, coat_rough=0.3, detail='paper', tile=2.5, nstr=0.5, albedo=True, emission='#ff7a2a', emission_strength=0.45),
    'shine': dict(rough=0.22, coat=0.8, coat_rough=0.05, emission='#ffc02e', emission_strength=0.22),
})
LIB = textures.Library(TEX)

# a warm studio: the gradient sky gives brass and lacquer something to reflect
world = bpy.data.worlds.new('ui_studio')
world.use_nodes = True
nt = world.node_tree
bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
coord, sep, ramp = nt.nodes.new('ShaderNodeTexCoord'), nt.nodes.new('ShaderNodeSeparateXYZ'), nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(coord.outputs['Generated'], sep.inputs[0])
remap = nt.nodes.new('ShaderNodeMapRange')
remap.inputs['From Min'].default_value, remap.inputs['From Max'].default_value = -1.0, 1.0
nt.links.new(sep.outputs['Z'], remap.inputs['Value'])
nt.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color = (*lin('#4a3226'), 1)
ramp.color_ramp.elements[1].color = (*lin('#fffaf2'), 1)
mid = ramp.color_ramp.elements.new(0.52)
mid.color = (*lin('#f0dcc2'), 1)
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.85
scene.world = world

rig = bpy.data.collections.new('ui_lights')
scene.collection.children.link(rig)
for name, offset, energy, size, color in (('key', (-2.2, -3.0, 3.4), 300, 2.4, '#fff0da'), ('fill', (3.0, -2.2, 1.0), 110, 3.0, '#e4ecff'),
                                          ('rim', (1.2, 3.0, 2.6), 240, 2.0, '#ffffff')):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.size, light.color = energy, size, lin(color)
    o = bpy.data.objects.new(name, light)
    rig.objects.link(o)
    o['offset'], o['e0'] = offset, energy

cam_data = bpy.data.cameras.new('ui_cam')
cam_data.type = 'ORTHO'
cam_data.clip_start, cam_data.clip_end = 0.01, 100.0
cam = bpy.data.objects.new('ui_cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = 'CYCLES'
preview.use_gpu(scene)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.pixel_filter_type = 'BLACKMAN_HARRIS'
scene.cycles.filter_width = 1.6
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.compression = 100
views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'Khronos PBR Neutral' if 'Khronos PBR Neutral' in views else 'Standard'
scene.view_settings.look = 'None'
# no metadata: Blender otherwise writes the local .blend path and host into every PNG
for prop in scene.render.bl_rna.properties:
    if prop.identifier.startswith('use_stamp'):
        setattr(scene.render, prop.identifier, False)
scene.render.use_stamp = False


# ----------------------------------------------------------------------------- shape helpers
FRONT = Matrix.Rotation(math.pi / 2, 4, 'X')  # modelled in XY (thickness along Z) -> faces the camera (-Y)


def face_front(g):
    return g.matrix(FRONT).bake_local()


def slab(outline, depth=0.2, bevel=0.035, seg=3):
    """A soft-edged plate from a counter-clockwise outline in XY, standing to face the camera."""
    import bmesh
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, -depth / 2)) for x, y in outline]
    hi = [bm.verts.new((x, y, depth / 2)) for x, y in outline]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    rims = [e for e in bm.edges if all(abs(abs(v.co.z) - depth / 2) < 1e-6 for v in e.verts)]
    bmesh.ops.bevel(bm, geom=rims + list({v for e in rims for v in e.verts}), offset=bevel, offset_type='OFFSET', segments=seg,
                    profile=0.5, affect='EDGES', clamp_overlap=True)
    bm.normal_update()
    bm.faces.index_update()
    flat = [abs(f.normal.z) > 0.999 for f in bm.faces]
    g = Geo.from_bmesh(bm)
    g.smooth = [not x for x in flat]
    return face_front(g)


def puffy_star(points=4, outer=0.5, inner=0.14, thick=0.16, sharp=4.0, pinch=None):
    """A pillowy star: a sphere pushed out to a star outline, thickest in the middle.
    pinch (4 points only): a superellipse |x|^p + |y|^p = r^p with p < 1, the classic sparkle with
    needle tips and curved-in sides; smaller p is thinner."""
    g = sphere(1.0, 128, 48)

    def shape(p):
        a = math.atan2(p.y, p.x)
        if pinch:
            s = outer / (abs(math.cos(a)) ** pinch + abs(math.sin(a)) ** pinch) ** (1 / pinch)
        else:
            s = inner + (outer - inner) * abs(math.cos(points * a / 2)) ** sharp
        z = math.copysign(abs(p.z) ** 0.65, p.z) * thick * (1.0 - 0.55 * s / outer)
        return Vector((p.x * s, p.y * s, z))
    g.deform(shape, local_too=True)
    return face_front(g)


def arc(cx, cz, r, a0, a1, n=28):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))), 0.0, cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1))))
            for i in range(n)]


def head(r, h):
    """A rounded arrowhead along +Z (base at 0)."""
    return lathe([(0.0, 0.0), (r * 0.82, 0.0), (r, 0.05), (r * 0.55, h * 0.5), (r * 0.14, h * 0.93), (0.0, h)], seg=36, rings=24)


def aim(g, at, direction):
    q = Vector(direction).normalized().to_track_quat('Z', 'Y')
    return g.matrix(Matrix.Translation(at) @ q.to_matrix().to_4x4())


def arrow(points, r=0.085, head_r=0.21, head_len=0.28):
    end, before = Vector(points[-1]), Vector(points[-2])
    direction = (end - before).normalized()
    return tube(points, r, seg=18, samples=len(points) * 3), aim(head(head_r, head_len), end - direction * 0.02, direction)


def stick(a, b, r):
    return tube([a, b], r, seg=20, samples=4)


def xf_all(parts, **kw):
    for g, *_ in parts:
        g.xf(**kw)
    return parts


# ----------------------------------------------------------------------------- the icons
def cog():
    teeth, R, root = 8, 0.5, 0.36
    pts = []
    for i in range(teeth * 20):
        a = i / (teeth * 20) * math.tau
        u = (a / math.tau * teeth) % 1.0
        # trapezoid tooth: rise, plateau, fall, valley
        t = 1.0 if 0.12 <= u <= 0.44 else smoothstep(0.0, 0.12, u) if u < 0.12 else 1 - smoothstep(0.44, 0.56, u) if u < 0.56 else 0.0
        rr = root + (R - root) * t
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    body = slab(pts, depth=0.22, bevel=0.04)
    hub = face_front(torus(0.16, 0.055, 40, 14).xf(loc=(0, 0, 0.11)))
    hole = face_front(cyl(0.12, h=0.05, seg=40).xf(loc=(0, 0, 0.1)))
    back = face_front(torus(0.16, 0.055, 40, 14).xf(loc=(0, 0, -0.11)))
    return [(body, 'lacquer', C['tangerine']), (hub, 'gold', '#ffffff'), (back, 'gold', '#ffffff'), (hole, 'lacquer', C['ink'])]


def bell(ringing):
    shell = lathe([(0.46, 0.0), (0.45, 0.05), (0.39, 0.12), (0.32, 0.24), (0.29, 0.40), (0.27, 0.54), (0.22, 0.64), (0.12, 0.69), (0.0, 0.71)], seg=48, rings=30)
    # a turned handbell grip, chunky enough to read at 24 px
    grip = lathe([(0.0, 0.64), (0.1, 0.66), (0.08, 0.72), (0.1, 0.8), (0.15, 0.9), (0.14, 0.99), (0.08, 1.04), (0.0, 1.05)], seg=32, rings=24)
    parts = [
        (shell, 'gold', '#ffffff'),
        (torus(0.445, 0.05, 48, 12).xf(loc=(0, 0, 0.02)), 'gold', '#fff4dc'),
        (grip, 'lacquer', C['cherry']),
    ]
    if ringing:
        parts.append((sphere(0.1, 24, 16).xf(loc=(0.05, 0, -0.07)), 'gold', '#d9a860'))
        xf_all(parts, rot=(math.radians(-10), math.radians(14), 0))
        for r in (0.66, 0.84):
            parts.append((tube(arc(0.0, 0.35, r, -32, 32), 0.042, seg=14), 'shine', C['sunflower']))
    else:
        # hushed: a felt stopper fills the mouth, and the bell tips it toward you so you can see it
        parts.append((sphere((0.36, 0.36, 0.13), 36, 18).xf(loc=(0, 0, 0.0)), 'felt', C['felt_red']))
        xf_all(parts, rot=(math.radians(-42), 0, 0))
        xf_all(parts, rot=(0, math.radians(-22), 0))
    return parts


def undo():
    shaft, tip = arrow(arc(0.0, -0.05, 0.36, -38, 186))
    return [(shaft, 'lacquer', C['teal']), (tip, 'lacquer', C['teal'])]


def restart():
    shaft, tip = arrow(arc(0.0, 0.0, 0.36, 118, -196, n=40))
    return [(shaft, 'lacquer', C['violet']), (tip, 'lacquer', C['violet'])]


def journey():
    front = rbox(0.8, 0.06, 1.02, bevel=0.025).xf(loc=(0.0, -0.1, 0))
    back = rbox(0.8, 0.06, 1.02, bevel=0.025).xf(loc=(0.0, 0.1, 0))
    pages = rbox(0.74, 0.16, 0.94, bevel=0.02).xf(loc=(0.04, 0, 0))
    spine = cyl(0.13, h=1.02, seg=32).xf(loc=(-0.39, 0, 0))
    ribbon = tube([(0.16, -0.02, -0.4), (0.19, -0.05, -0.58), (0.15, -0.07, -0.7)], 0.038, seg=12)
    badge = face_front(cyl(0.17, h=0.04, seg=40).xf(loc=(0, 0.0, 0.0))).xf(loc=(0.02, -0.135, 0.08))
    star = puffy_star(5, 0.12, 0.05, 0.05, sharp=2.0).xf(loc=(0.02, -0.16, 0.08))
    parts = [(front, 'lacquer', C['cherry']), (back, 'lacquer', C['cherry']), (spine, 'lacquer', '#b8262f'), (pages, 'paper', C['cream']),
             (ribbon, 'lacquer', C['sunflower']), (badge, 'gold', '#ffffff'), (star, 'lacquer', C['cherry'])]
    return xf_all(parts, rot=(0, 0, math.radians(-18)))


def scroll():
    paper = cyl(0.2, h=0.9, seg=40).xf(rot=(0, math.pi / 2, 0))
    rod = cyl(0.075, h=1.16, seg=24).xf(rot=(0, math.pi / 2, 0))
    flap = rbox(0.84, 0.03, 0.4, bevel=0.012).xf(loc=(0, -0.17, -0.2))
    curl = cyl(0.06, h=0.84, seg=24).xf(rot=(0, math.pi / 2, 0), loc=(0, -0.21, -0.4))
    parts = [(paper, 'paper', C['parchment']), (flap, 'paper', C['parchment']), (curl, 'paper', '#ead0a0'),
             (rod, 'wood', C['dark_wood']),
             (sphere(0.11, 24, 16).xf(loc=(0.6, 0, 0)), 'wood', C['dark_wood']), (sphere(0.11, 24, 16).xf(loc=(-0.6, 0, 0)), 'wood', C['dark_wood']),
             (torus(0.205, 0.038, 40, 12).xf(rot=(0, math.pi / 2, 0), loc=(0.12, 0, 0)), 'lacquer', C['cherry'])]
    return xf_all(parts, rot=(0, math.radians(-12), math.radians(-14)))


def trunk():
    body = rbox(1.0, 0.62, 0.5, bevel=0.05).xf(loc=(0, 0, 0.25))
    lid = cyl(0.31, h=1.0, seg=40).xf(rot=(0, math.pi / 2, 0)).xf(scl=(1, 1, 0.62)).xf(loc=(0, 0, 0.5))
    parts = [(body, 'wood', C['wood']), (lid, 'wood', C['dark_wood'])]
    for x in (-0.3, 0.3):
        parts.append((rbox(0.08, 0.645, 0.52, bevel=0.02).xf(loc=(x, 0, 0.25)), 'gold', '#ffffff'))
        parts.append((cyl(0.325, h=0.08, seg=40).xf(rot=(0, math.pi / 2, 0)).xf(scl=(1, 1, 0.64)).xf(loc=(x, 0, 0.5)), 'gold', '#ffffff'))
    for x in (-0.47, 0.47):
        for z in (0.04, 0.46):
            parts.append((rbox(0.1, 0.1, 0.1, bevel=0.025).xf(loc=(x, -0.29, z)), 'gold', '#ffffff'))
    parts.append((rbox(0.18, 0.06, 0.22, bevel=0.02).xf(loc=(0, -0.325, 0.47)), 'gold', '#ffffff'))
    parts.append((face_front(cyl(0.03, h=0.03, seg=16)).xf(loc=(0, -0.36, 0.46)), 'lacquer', C['ink']))
    return xf_all(parts, rot=(0, 0, math.radians(-16)))


def close():
    r = 0.105
    return [(stick((-0.36, 0, -0.36), (0.36, 0, 0.36), r), 'lacquer', C['cocoa']),
            (stick((-0.36, -0.02, 0.36), (0.36, -0.02, -0.36), r), 'lacquer', C['cocoa'])]


def chevron():
    r = 0.1
    a, b, c = (-0.4, 0, 0.18), (0.0, 0, -0.2), (0.4, 0, 0.18)
    return [(stick(a, b, r), 'lacquer', C['cocoa']), (stick(b, c, r), 'lacquer', C['cocoa']),
            (sphere(r, 24, 16).xf(loc=b), 'lacquer', C['cocoa'])]


def coin():
    disc = face_front(lathe([(0.0, -0.07), (0.44, -0.07), (0.5, -0.045), (0.5, 0.045), (0.44, 0.07), (0.39, 0.07), (0.37, 0.05), (0.0, 0.05)],
                            seg=64, rings=None))
    body = face_front(sphere((0.13, 0.17, 0.05), 28, 18).xf(loc=(0, -0.01, 0.07)))
    caps = [face_front(rbox(0.14, 0.05, 0.05, bevel=0.015).xf(loc=(0, z, 0.07))) for z in (-0.19, 0.19)]
    loop = face_front(torus(0.05, 0.018, 24, 8).xf(loc=(0, 0.245, 0.07)))
    parts = [(disc, 'gold', '#ffffff'), (body, 'gold', '#ffe7a8')] + [(c, 'gold', '#ffe7a8') for c in caps] + [(loop, 'gold', '#ffe7a8')]
    return xf_all(parts, rot=(0, 0, math.radians(-12)))


def note():
    headg = sphere((0.2, 0.15, 0.14), 32, 20).xf(rot=(0, math.radians(-24), 0), loc=(-0.12, 0, -0.32))
    stem = tube([(0.055, 0, -0.3), (0.055, 0, 0.44)], 0.048, seg=16, samples=4)
    flag = tube([(0.055, 0, 0.42), (0.18, 0, 0.32), (0.27, 0, 0.14), (0.2, 0, -0.03)], lambda t: 0.06 - 0.03 * t, seg=16)
    return [(headg, 'lacquer', C['raspberry']), (stem, 'lacquer', C['raspberry']), (flag, 'lacquer', C['raspberry'])]


def sparkle():
    big = puffy_star(4, 0.52, thick=0.24, pinch=0.52).xf(loc=(-0.1, 0, -0.08))
    small = puffy_star(4, 0.21, thick=0.11, pinch=0.52).xf(loc=(0.36, -0.02, 0.34))
    dot = sphere(0.06, 20, 12).xf(loc=(0.4, -0.02, -0.28))
    return [(big, 'shine', C['sunflower']), (small, 'shine', C['sunflower']), (dot, 'shine', C['sunflower'])]


def sprig():
    stem_pts = [(-0.02, 0, -0.52), (0.02, 0, -0.2), (0.0, 0, 0.12), (0.06, 0, 0.44)]
    parts = [(tube(stem_pts, lambda t: 0.035 - 0.015 * t, seg=12), 'waxy', '#6f8a2a')]
    for z, side, size in ((-0.34, -1, 0.44), (-0.14, 1, 0.46), (0.08, -1, 0.42), (0.28, 1, 0.36)):
        lf = leaf(size, size * 0.46, 0.035, 0.05, curl=0.3)
        lf.xf(rot=(math.pi / 2, 0, 0))  # lie in the picture plane
        lf.xf(rot=(0, -math.radians(38) if side > 0 else math.radians(180 + 38), 0), loc=(0.0, -0.01 * side, z))
        parts.append((lf, 'waxy', grad(C['leaf'], C['leaf_tip'], 0.0, size, axis=0)))
    tip = leaf(0.3, 0.14, 0.03, 0.03).xf(rot=(math.pi / 2, 0, 0)).xf(rot=(0, -math.radians(80), 0), loc=(0.06, 0, 0.42))
    parts.append((tip, 'waxy', grad(C['leaf'], C['leaf_tip'], 0.0, 0.3, axis=0)))
    return xf_all(parts, rot=(0, math.radians(8), 0))


def bubble():
    body = sphere((0.52, 0.24, 0.38), 48, 28).xf(loc=(0.02, 0, 0.1))
    tail = lathe([(0.16, 0.0), (0.12, 0.12), (0.05, 0.26), (0.0, 0.3)], seg=28, rings=12)
    aim(tail, Vector((-0.2, 0, -0.14)), Vector((-0.55, 0, -1)))
    dots = [(sphere(0.078, 24, 14).xf(loc=(x, -0.22, 0.1)), 'lacquer', C['cream']) for x in (-0.19, 0.02, 0.23)]
    return [(body, 'lacquer', C['sky']), (tail, 'lacquer', C['sky'])] + dots


def feather():
    vane = leaf(1.06, 0.4, 0.05, 0.08, curl=0.25)
    quill = tube([(-0.12, 0, 0.0), (0.4, 0, 0.03), (1.0, 0, 0.08)], lambda t: 0.028 - 0.018 * t, seg=12)
    parts = [(vane, 'fuzzy', grad('#ffd2c4', C['rose'], 0.0, 0.42, axis=0)), (quill, 'lacquer', C['cream'])]
    for g, *_ in parts:
        g.xf(loc=(-0.53, 0, 0)).xf(rot=(math.pi / 2, 0, 0)).xf(rot=(0, -math.radians(42), 0))
    return parts


def lantern():
    body = lathe([(0.12, -0.36), (0.28, -0.3), (0.37, -0.12), (0.38, 0.06), (0.31, 0.26), (0.13, 0.36)], seg=48, rings=26,
                 wobble=lambda a, t: 1 + 0.035 * math.cos(12 * a) * math.sin(math.pi * t))
    def ribs(lp, wp):  # darker bamboo ribs between the glowing panels
        return mix('#ff5a22', '#a8241a', 0.85 * smoothstep(0.8, 1.0, math.cos(12 * math.atan2(lp[1], lp[0]))))
    parts = [(body, 'lampglow', ribs),
             (cyl(0.15, h=0.08, seg=32).xf(loc=(0, 0, 0.39)), 'gold', '#ffffff'),
             (cyl(0.15, h=0.08, seg=32).xf(loc=(0, 0, -0.39)), 'gold', '#ffffff'),
             (tube(arc(0.0, 0.43, 0.14, 0, 180), 0.025, seg=10), 'gold', '#ffffff'),
             (lathe([(0.0, -0.66), (0.05, -0.6), (0.035, -0.5), (0.02, -0.43)], seg=16, rings=10), 'felt', C['cherry'])]
    return parts


def globe():
    ball = sphere(0.4, 64, 40)

    def paint(lp, wp):
        n = noise.noise(Vector(lp) * 2.6 + Vector((3.1, 1.7, 5.2))) + 0.5 * noise.noise(Vector(lp) * 6.0 + Vector((1.0, 2.0, 3.0)))
        return mix(C['ocean'], C['land'], smoothstep(0.06, 0.12, n))
    ball.xf(rot=(0, math.radians(23), math.radians(30)), loc=(0, 0, 0.12))
    ring = tube(arc(0.0, 0.0, 0.5, -70, 250, n=48), 0.03, seg=12).xf(rot=(0, 0, 0))
    ring.xf(rot=(0, math.radians(23), 0), loc=(0, 0, 0.12))
    post = cyl(0.045, h=0.2, seg=20, base=True).xf(loc=(0, 0, -0.5))
    base = lathe([(0.0, -0.58), (0.26, -0.58), (0.28, -0.54), (0.24, -0.5), (0.0, -0.5)], seg=48, rings=None)
    return [(ball, 'lacquer', paint), (ring, 'gold', '#ffffff'), (post, 'gold', '#ffffff'), (base, 'wood', C['dark_wood'])]


ICONS = {
    'settings': (cog, (0.28, -1.0, 0.3)), 'sound-on': (lambda: bell(True), (0.3, -1.0, 0.34)), 'sound-off': (lambda: bell(False), (0.3, -1.0, 0.34)),
    'undo': (undo, (0.16, -1.0, 0.18)), 'restart': (restart, (0.16, -1.0, 0.18)), 'journey': (journey, (0.34, -1.0, 0.26)),
    'help': (scroll, (0.3, -1.0, 0.34)), 'shop': (trunk, (0.34, -1.0, 0.42)), 'close': (close, (0.18, -1.0, 0.2)),
    'chevron': (chevron, (0.12, -1.0, 0.3)), 'coin': (coin, (0.26, -1.0, 0.24)), 'music': (note, (0.2, -1.0, 0.18)),
    'effects': (sparkle, (0.2, -1.0, 0.22)), 'forest': (sprig, (0.22, -1.0, 0.2)), 'voices': (bubble, (0.22, -1.0, 0.26)),
    'motion': (feather, (0.2, -1.0, 0.24)), 'hints': (lantern, (0.28, -1.0, 0.26)), 'language': (globe, (0.26, -1.0, 0.24)),
}


# ----------------------------------------------------------------------------- build, frame, render
def clear():
    for o in [o for o in scene.objects if o.type == 'MESH']:
        bpy.data.objects.remove(o)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)


def frame(obj, view):
    bpy.context.view_layer.update()
    d = Vector(view).normalized()
    q = (-d).to_track_quat('-Z', 'Y')
    right, up = q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    us, vs, ds = [p.dot(right) for p in pts], [p.dot(up) for p in pts], [p.dot(d) for p in pts]
    w, h = max(us) - min(us), max(vs) - min(vs)
    uc, vc = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    cam.rotation_euler = q.to_euler()
    cam.location = right * uc + up * vc + d * (max(ds) + 3.0)
    cam_data.ortho_scale = max(w, h) / FILL
    centre = right * uc + up * vc + d * ((max(ds) + min(ds)) / 2)
    size = max(w, h)
    for o in rig.objects:
        o.location = centre + Vector(o['offset']) * size
        o.rotation_euler = (centre - o.location).to_track_quat('-Z', 'Y').to_euler()
        o.data.energy = o['e0'] * size * size


def alpha_box(path):
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4)
    ys, xs = np.nonzero(px[..., 3] > 0.5)
    bpy.data.images.remove(img)
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None


def strip_text(path):
    """Drop PNG text/time chunks: Cycles always records render timings, which would make every
    re-render a new binary even when the pixels match."""
    with open(path, 'rb') as f:
        data = f.read()
    out, o = [data[:8]], 8
    while o < len(data):
        n = int.from_bytes(data[o:o + 4], 'big')
        if data[o + 4:o + 8] not in (b'tEXt', b'zTXt', b'iTXt', b'tIME'):
            out.append(data[o:o + 12 + n])
        o += 12 + n
    with open(path, 'wb') as f:
        f.write(b''.join(out))


done = []
for name, (make, view) in ICONS.items():
    if ONLY and name not in ONLY:
        continue
    clear()
    asset = Asset('ui_' + name, ao=0.22, ao_strength=0.55, ground=False)
    for geo, mat, paint in make():
        asset.add(geo, mat, paint)
    obj = asset.build(LIB, samples=24)
    frame(obj, view)
    path = os.path.join(OUT, name + '.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    strip_text(path)
    box = alpha_box(path)
    print('UI_ICON', name, 'alpha box', box, 'fill %.2f' % (max(box[2] - box[0], box[3] - box[1]) / SIZE if box else 0))
    done.append(name)
print('UI_ICONS_COMPLETE', len(done))
