"""Render transparent UI portraits (fruit and friends) from the same models the game uses.

    npm run assets:icons      (blender --background --python this file)
Outputs assets/lantern-picnic/icons/{fruit_0..11,pip,momo,nori,juniper,bramble}.png at 256 px.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from lantern import preview  # noqa: E402
from lantern.core import lin  # noqa: E402

SIZE = int(os.environ.get('ICON_SIZE', 256))
OUT = os.path.join(ROOT, 'assets', 'lantern-picnic', 'icons')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'lantern-picnic.blend'))
scene = bpy.context.scene

# soft portrait studio
world = bpy.data.worlds.new('portrait')
world.use_nodes = True
next(_n for _n in world.node_tree.nodes if _n.type == 'BACKGROUND').inputs[0].default_value = (*lin('#dfe7ef'), 1)
next(_n for _n in world.node_tree.nodes if _n.type == 'BACKGROUND').inputs[1].default_value = 0.9
scene.world = world
rig = bpy.data.collections.new('portrait_lights')
scene.collection.children.link(rig)
for name, loc, energy, size, color in (('key', (-2.2, -3.2, 3.4), 260, 2.4, '#fff1dc'), ('fill', (3.0, -2.0, 1.6), 110, 3.0, '#dfe9ff'), ('rim', (0.6, 3.0, 2.8), 220, 2.0, '#ffffff')):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.size, light.color = energy, size, lin(color)
    o = bpy.data.objects.new(name, light)
    rig.objects.link(o)
    o['offset'] = loc

cam_data = bpy.data.cameras.new('portrait_cam')
cam_data.lens = 85
cam = bpy.data.objects.new('portrait_cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = 'CYCLES'
preview.use_gpu(scene)
scene.cycles.samples = int(os.environ.get('ICON_SAMPLES', 96))
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.compression = 90
views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'Khronos PBR Neutral' if 'Khronos PBR Neutral' in views else 'Standard'
scene.view_settings.look = 'None'

subjects = [o for o in bpy.data.objects if o.name.startswith('fruit_') and o.type == 'MESH']
subjects += [o for o in bpy.data.objects if o.type == 'ARMATURE']
everything = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE')]


def show_only(subject):
    keep = {subject, *subject.children_recursive}
    for o in everything:
        o.hide_render = o not in keep


def frame(subject, portrait):
    bpy.context.view_layer.update()
    meshes = [o for o in [subject, *subject.children_recursive] if o.type == 'MESH']
    pts = []
    for m in meshes:
        dg = m.evaluated_get(bpy.context.evaluated_depsgraph_get())
        for v in dg.data.vertices:
            pts.append(dg.matrix_world @ v.co)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    if portrait:
        # head and shoulders
        lo.z = lo.z + (hi.z - lo.z) * 0.38
    centre = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.z - lo.z, (hi.y - lo.y) * 0.8)
    direction = Vector((0.32, -1.0, 0.36 if not portrait else 0.18)).normalized()
    dist = size * 0.5 / math.tan(cam_data.angle / 2) * (1.18 if not portrait else 1.08)
    cam.location = centre + direction * dist
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for o in rig.objects:
        o.location = centre + Vector(o['offset']) * size
        o.rotation_euler = (centre - o.location).to_track_quat('-Z', 'Y').to_euler()
        o.data.energy = o.data.energy if 'e0' in o.keys() else o.data.energy
        if 'e0' not in o.keys():
            o['e0'] = o.data.energy
        o.data.energy = o['e0'] * size * size


only = [n for n in os.environ.get('ICONS', '').split(',') if n]
for subject in subjects:
    if only and subject.name not in only:
        continue
    portrait = subject.type == 'ARMATURE'
    if portrait:
        idle = bpy.data.actions.get(subject.name + '_idle')
        subject.animation_data.action = idle
        scene.frame_set(8)
    show_only(subject)
    frame(subject, portrait)
    scene.render.filepath = os.path.join(OUT, subject.name + '.png')
    bpy.ops.render.render(write_still=True)
    print('ICON', subject.name)
print('ICONS_COMPLETE', len(subjects))
