"""Key art: the whole clearing at golden dusk, rendered in Cycles from the game's own assets.

    npm run assets:keyart     (blender --background --python this file)
Outputs assets/lantern-picnic/keyart.webp (loading screen) and docs/keyart.png (README).
Layout mirrors the game's desktop board (14 x 9.8 cloth); Blender Y = -game Z.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from lantern import preview  # noqa: E402
from lantern.core import lin  # noqa: E402

W, D = 14.0, 9.8
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'lantern-picnic.blend'))
scene = bpy.context.scene
rnd = random.Random(5)
stage = bpy.data.collections.new('keyart')
scene.collection.children.link(stage)
# the library stays at the origin, hidden; the key art uses linked duplicates
for coll in list(scene.collection.children):
    if coll.name != 'keyart':
        coll.hide_render = True
        coll.hide_viewport = True


def board(nx, ny):
    """Normalised board point -> Blender XY."""
    return Vector(((nx - 0.5) * W, -(ny - 0.5) * D, 0))


def put(name, loc, rot=0.0, scale=1.0):
    src = bpy.data.objects[name]
    o = src.copy()
    o.data = src.data
    o.location = Vector(loc)
    o.rotation_euler = (0, 0, rot)
    o.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
    stage.objects.link(o)
    return o


def friend(name, loc, face, clip='idle', frame=10, scale=0.98):
    rig = bpy.data.objects[name]
    copy = rig.copy()
    copy.data = rig.data
    copy.animation_data_create()
    copy.animation_data.action = bpy.data.actions.get(f'{name}_{clip}')
    copy.location = Vector(loc)
    copy.rotation_euler = (0, 0, face)
    copy.scale = (scale,) * 3
    stage.objects.link(copy)
    for child in rig.children:
        m = child.copy()
        m.data = child.data
        m.parent = copy
        m.modifiers['rig'].object = copy
        stage.objects.link(m)
    return copy


put('island', (0, 0, 0), scale=(1.02, 1, 1))
put('cloth', (0, 0, 0))
put('basket', board(0.14, 0.87) + Vector((0, 0, 0.02)), 0.12, 1.05)
put('plate', board(0.73, 0.87) + Vector((0, 0, 0.06)), 0, 0.88)
put('skewer', board(0.43, 0.86) + Vector((0, 0, 0.05)), 0, 0.96)
for i, (level, nx, ny) in enumerate([(0, .3, .3), (0, .36, .36), (1, .52, .28), (2, .64, .44), (3, .44, .52), (9, .24, .55), (10, .72, .22),
                                     (6, .82, .5), (8, .56, .64), (4, .3, .7), (7, .68, .7), (5, .86, .72)]):
    radius = [.40, .42, .43, .46, .47, .49, .52, .54, .68, .45, .50, .59][level]
    put(f'fruit_{level}', board(nx, ny) + Vector((0, 0, 0.1)), rnd.uniform(-0.4, 0.4), radius * 2)
# plate servings and a finished skewer
put('fruit_1', board(0.73, 0.87) + Vector((-0.2, 0.05, 0.18)), 0.3, 0.42)
put('fruit_1', board(0.73, 0.87) + Vector((0.22, -0.05, 0.18)), -0.3, 0.42)
for k in range(3):
    put('fruit_0', board(0.43, 0.86) + Vector((-0.67 + k * 0.67, 0, 0.08)), 0, 0.48)

# friends around the cloth
guest = board(0.91, 0.89)
friend('bramble', guest + Vector((0, 0, 0.07)), math.radians(20), 'wave', 22)
friend('pip', (W / 2 + 1.05, -0.7, 0), math.radians(60), 'idle', 5)
friend('momo', (W / 2 + 1.35, 2.5, 0), math.radians(80), 'cheer', 18)
friend('nori', (-W / 2 - 1.15, 2.2, 0), math.radians(-70), 'idle', 30)
friend('juniper', (-W / 2 - 1.2, -1.3, 0), math.radians(-55), 'talk', 12)

# lantern posts, rope and lanterns
post_y, post_x = D / 2 + 0.75, W / 2 - 0.4
for side in (-1, 1):
    put('post', (side * post_x, post_y, 0), math.pi if side < 0 else 0)
a, b = Vector((-(post_x - 0.2), post_y, 2.8)), Vector((post_x - 0.2, post_y, 2.8))
rope_pts = [a.lerp(b, t / 8) - Vector((0, 0, math.sin(t / 8 * math.pi) * 0.8)) for t in range(9)]
curve = bpy.data.curves.new('rope', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 0.014
spline = curve.splines.new('POLY')
spline.points.add(len(rope_pts) - 1)
for p, v in zip(spline.points, rope_pts):
    p.co = (*v, 1)
rope = bpy.data.objects.new('rope', curve)
rope.data.materials.append(bpy.data.materials['rawwood'])
stage.objects.link(rope)
glow_mat = bpy.data.materials['paper'].copy()
glow_mat.name = 'paper_lit'
bsdf = next(_n for _n in glow_mat.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Emission Color'].default_value = (*lin('#ffb85c'), 1)
bsdf.inputs['Emission Strength'].default_value = 7.0
for i in range(5):
    t = 0.12 + i * 0.19
    idx = t * 8
    p = rope_pts[int(idx)].lerp(rope_pts[min(8, int(idx) + 1)], idx - int(idx))
    lamp = put('lantern', p - Vector((0, 0, 0.87)), 0, 0.85)
    lamp.data = lamp.data.copy()
    for slot, m in enumerate(lamp.data.materials):
        if m and m.name.startswith('paper'):
            lamp.data.materials[slot] = glow_mat
    light = bpy.data.lights.new(f'lantern_light_{i}', 'POINT')
    light.energy, light.color, light.shadow_soft_size = 60, lin('#ffb060'), 0.25
    lo = bpy.data.objects.new(light.name, light)
    lo.location = p - Vector((0, 0, 0.45))
    stage.objects.link(lo)

# keepsakes, pond, campfire
put('teapot', (-W / 2 + 1.6, D / 2 + 1.0, 0), 0.5, 0.62)
put('storybook', (W / 2 + 1.3, -1.9, 0), -0.4, 0.85)
put('pond', (-W / 2 - 1.75, -(D / 2 - 2.3), 0.03), 0, 1.1)
water = put('pond_water', (-W / 2 - 1.75, -(D / 2 - 2.3), 0.035), 0, 1.1)
put('campfire', (-W / 2 - 2.1, 1.2, 0))
fire = bpy.data.lights.new('campfire_light', 'POINT')
fire.energy, fire.color, fire.shadow_soft_size = 180, lin('#ff7a2a'), 0.4
fo = bpy.data.objects.new('campfire_light', fire)
fo.location = (-W / 2 - 2.1, 1.2, 0.6)
stage.objects.link(fo)
flame_mat = bpy.data.materials.new('flame')
flame_mat.use_nodes = True
fb = next(_n for _n in flame_mat.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED')
fb.inputs['Base Color'].default_value = (1, 0.5, 0.1, 1)
fb.inputs['Emission Color'].default_value = (*lin('#ff9a3a'), 1)
fb.inputs['Emission Strength'].default_value = 18
for k in range(3):
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.12 - k * 0.02, depth=0.5 - k * 0.1, location=(-W / 2 - 2.1 + (k - 1) * 0.08, 1.2, 0.35))
    flame = bpy.context.object
    flame.data.materials.append(flame_mat)
    for c in list(flame.users_collection):
        c.objects.unlink(flame)
    stage.objects.link(flame)

# trees, bushes, rocks and flowers
RX, RY = 10.8 * 1.02, 8.3
for i in range(13):
    ang = math.pi * (0.08 + 0.84 * i / 12) + rnd.uniform(-0.05, 0.05)
    r = rnd.uniform(0.76, 0.92)
    pos = (math.cos(ang) * RX * r, math.sin(ang) * RY * r, -0.05)
    if abs(pos[0]) < W / 2 + 1.2 and pos[1] < D / 2 + 1.0:
        continue
    put(rnd.choice(['tree_oak', 'tree_oak', 'tree_birch', 'tree_pine', 'tree_blossom']), pos, rnd.uniform(0, 6.28), rnd.uniform(0.9, 1.3))


def on_lawn(x, y, pad=0.5):
    inside = (x / (RX * 0.95)) ** 2 + (y / (RY * 0.95)) ** 2 < 1
    off_cloth = abs(x) > W / 2 + pad or abs(y) > D / 2 + pad
    return inside and off_cloth


placed = 0
for k in range(900):
    x, y = rnd.uniform(-RX, RX), rnd.uniform(-RY, RY)
    if not on_lawn(x, y):
        continue
    kind = rnd.choices(['flower_daisy', 'flower_bell', 'flower_tulip', 'flower_sun', 'tuft', 'fern', 'bush_flower', 'bush', 'rock_0', 'mushrooms'],
                       weights=[6, 5, 4, 4, 10, 2, 1.2, 1, 0.8, 1.2])[0]
    scale = {'tuft': 1.3, 'fern': 1.0, 'bush': 1.0, 'bush_flower': 0.9, 'rock_0': 0.8, 'mushrooms': 0.6}.get(kind, 1.1) * rnd.uniform(0.8, 1.2)
    put(kind, (x, y, 0), rnd.uniform(0, 6.28), scale)
    placed += 1

# fireflies
ff = bpy.data.materials.new('firefly')
ff.use_nodes = True
fn = next(_n for _n in ff.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED')
fn.inputs['Emission Color'].default_value = (*lin('#e9ff9a'), 1)
fn.inputs['Emission Strength'].default_value = 40
mesh = bpy.data.meshes.new('firefly')
import bmesh  # noqa: E402
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.025)
bm.to_mesh(mesh)
bm.free()
mesh.materials.append(ff)
for k in range(70):
    o = bpy.data.objects.new('firefly', mesh)
    o.location = (rnd.uniform(-RX, RX) * 0.9, rnd.uniform(-RY * 0.6, RY * 0.9), rnd.uniform(0.5, 3.2))
    stage.objects.link(o)

# sky: late golden hour, sun low behind the trees
world = bpy.data.worlds.new('dusk')
world.use_nodes = True
nt = world.node_tree
# a painted golden-hour gradient, matching the game's sky: lilac depths below, peach horizon, soft blue above
coord = nt.nodes.new('ShaderNodeTexCoord')
split = nt.nodes.new('ShaderNodeSeparateXYZ')
remap = nt.nodes.new('ShaderNodeMapRange')
remap.inputs['From Min'].default_value, remap.inputs['From Max'].default_value = -1.0, 1.0
ramp = nt.nodes.new('ShaderNodeValToRGB')
stops = [(0.0, '#6b6aa8'), (0.4, '#c49ac2'), (0.49, '#ffd2a0'), (0.53, '#ffdcae'), (0.62, '#f2c79c'), (0.78, '#a9b9dc'), (1.0, '#5f86c8')]
ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = stops[0][0], (*lin(stops[0][1]), 1)
ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
for pos, col in stops[1:-1]:
    e = ramp.color_ramp.elements.new(pos)
    e.color = (*lin(col), 1)
nt.links.new(coord.outputs['Generated'], split.inputs['Vector'])
nt.links.new(split.outputs['Z'], remap.inputs['Value'])
nt.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
bg = next(_n for _n in nt.nodes if _n.type == 'BACKGROUND')
bg.inputs[1].default_value = 0.75
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
scene.world = world
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy, sun.color, sun.angle = 3.0, lin('#ffbd85'), math.radians(4)
so = bpy.data.objects.new('sun', sun)
so.rotation_euler = (math.radians(78), 0, math.radians(-150))
stage.objects.link(so)
fill = bpy.data.lights.new('fill', 'SUN')
fill.energy, fill.color = 0.35, lin('#9fb3ff')
fo2 = bpy.data.objects.new('fill', fill)
fo2.rotation_euler = (math.radians(35), 0, math.radians(20))
stage.objects.link(fo2)

# camera: low establishing shot with a miniature depth of field
cam_data = bpy.data.cameras.new('keyart_cam')
cam_data.lens = 33
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = float(os.environ.get('KEYART_FSTOP', 3.2))
cam = bpy.data.objects.new('keyart_cam', cam_data)
stage.objects.link(cam)
target = Vector((0.6, 1.0, 1.1))
cam.location = target + Vector((1.2, -19.5, 7.6))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.dof.focus_distance = (target - cam.location).length - 3.0
scene.camera = cam

scene.frame_set(1)
scene.render.engine = 'CYCLES'
preview.use_gpu(scene)
scene.cycles.samples = int(os.environ.get('KEYART_SAMPLES', 256))
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = int(os.environ.get('KEYART_W', 1920)), int(os.environ.get('KEYART_H', 1080))
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'AgX' if 'AgX' in views else 'Filmic'
looks = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items]
scene.view_settings.look = 'AgX - Punchy' if 'AgX - Punchy' in looks else 'None'
scene.view_settings.exposure = float(os.environ.get('KEYART_EXPOSURE', 0.3))

os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
bpy.ops.render.render()
result = bpy.data.images['Render Result']
settings = scene.render.image_settings
settings.color_mode = 'RGB'
settings.file_format, settings.quality = 'WEBP', 82
result.save_render(os.path.join(ROOT, 'assets', 'lantern-picnic', 'keyart.webp'), scene=scene)
settings.file_format, settings.quality = 'JPEG', 88
result.save_render(os.path.join(ROOT, 'docs', 'keyart.jpg'), scene=scene)
print('KEYART_COMPLETE', placed)
