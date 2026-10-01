"""Lay out the whole asset library in a soft studio, save it as an editable .blend, and render a
labelled contact sheet with Cycles.

    npm run assets:gallery   ->  art/blender/asset-gallery.blend, docs/asset-gallery.jpg
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

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'lantern-picnic.blend'))
scene = bpy.context.scene
FRUIT = [0, 1, 2, 9, 3, 4, 5, 10, 6, 7, 11, 8]
NAMES = ['Cherries', 'Strawberry', 'Grapes', 'Orange', 'Lemon', 'Pear', 'Peach', 'Pineapple', 'Watermelon', 'Ruby apple', 'Twilight plum', 'Dragon fruit']
rows = [
    [(f'fruit_{i}', NAMES[i], 1.0) for i in FRUIT],
    [('pip', 'Pip', 0.95), ('momo', 'Momo', 0.95), ('nori', 'Nori', 0.95), ('juniper', 'Juniper', 0.95), ('bramble', 'Bramble', 0.95),
     ('basket', 'Happy basket', 0.85), ('plate', 'Wish plate', 0.8), ('skewer', 'Skewer board', 0.55), ('lantern', 'Paper lantern', 1.1),
     ('teapot', 'Moonflower tea', 0.9), ('storybook', 'Storybook', 0.85), ('sky_lantern', 'Sky lantern', 1.3)],
    [('tree_oak', 'Oak', 0.36), ('tree_pine', 'Pine', 0.36), ('tree_birch', 'Birch', 0.36), ('tree_blossom', 'Blossom', 0.4), ('bush_berry', 'Berry bush', 0.9),
     ('bush_flower', 'Flower bush', 0.9), ('rock_0', 'Mossy rock', 0.9), ('mushrooms', 'Mushrooms', 1.1), ('fern', 'Fern', 1.0), ('campfire', 'Campfire', 0.95),
     ('log_seat', 'Log seat', 0.7), ('stump', 'Stump', 1.0)],
]
gallery = bpy.data.collections.new('gallery')
scene.collection.children.link(gallery)
for coll in list(scene.collection.children):
    if coll.name != 'gallery':
        coll.hide_render = True
ink = bpy.data.materials.new('gallery ink')
ink.diffuse_color = (*lin('#4a3b2e'), 1)
ink.use_nodes = True
next(_n for _n in ink.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*lin('#4a3b2e'), 1)
SPACE, ROW = 2.1, 3.3
for r, row in enumerate(rows):
    for c, (name, label, s) in enumerate(row):
        src = bpy.data.objects[name]
        x, y = (c - (len(row) - 1) / 2) * SPACE, (1 - r) * ROW
        copy = src.copy()
        copy.data = src.data
        copy.location, copy.scale = (x, y, 0), (s, s, s)
        gallery.objects.link(copy)
        if src.type == 'ARMATURE':
            copy.animation_data_create()
            copy.animation_data.action = bpy.data.actions.get(f'{name}_idle')
            for child in src.children:
                m = child.copy(); m.data = child.data; m.parent = copy; m.modifiers['rig'].object = copy
                gallery.objects.link(m)
        text = bpy.data.curves.new('label ' + label, 'FONT')
        text.body, text.size, text.align_x = label, 0.2, 'CENTER'
        text.materials.append(ink)
        t = bpy.data.objects.new('label ' + label, text)
        t.location = (x, y - 0.95, 0.01)
        gallery.objects.link(t)
floor_mesh = bpy.data.meshes.new('floor')
floor_mesh.from_pydata([(-40, -40, -0.001), (40, -40, -0.001), (40, 40, -0.001), (-40, 40, -0.001)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new('studio floor', floor_mesh)
fm = bpy.data.materials.new('studio ivory')
fm.use_nodes = True
next(_n for _n in fm.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*lin('#efe6d6'), 1)
next(_n for _n in fm.node_tree.nodes if _n.type == 'BSDF_PRINCIPLED').inputs['Roughness'].default_value = 0.9
floor.data.materials.append(fm)
gallery.objects.link(floor)
world = bpy.data.worlds.new('gallery studio')
world.use_nodes = True
next(_n for _n in world.node_tree.nodes if _n.type == 'BACKGROUND').inputs[0].default_value = (*lin('#e8eef0'), 1)
next(_n for _n in world.node_tree.nodes if _n.type == 'BACKGROUND').inputs[1].default_value = 0.8
scene.world = world
for name, loc, energy, size in (('key', (-8, -10, 16), 5200, 12), ('fill', (10, -4, 10), 2200, 12), ('rim', (0, 12, 10), 2600, 10)):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.size = energy, size
    o = bpy.data.objects.new(name, light)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    gallery.objects.link(o)
cam_data = bpy.data.cameras.new('gallery cam')
cam_data.type, cam_data.ortho_scale = 'ORTHO', 25.5
cam = bpy.data.objects.new('gallery cam', cam_data)
cam.location = (0, -14, 16)
cam.rotation_euler = (Vector((0, 0.35, 0.3)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
gallery.objects.link(cam)
scene.camera = cam
scene.frame_set(8)
scene.render.engine = 'CYCLES'
preview.use_gpu(scene)
scene.cycles.samples = int(os.environ.get('GALLERY_SAMPLES', 128))
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 2400, 1150
scene.render.film_transparent = False
views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'Khronos PBR Neutral' if 'Khronos PBR Neutral' in views else 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'asset-gallery.blend'), compress=True)
bpy.ops.render.render()
settings = scene.render.image_settings
settings.file_format, settings.quality, settings.color_mode = 'JPEG', 88, 'RGB'
bpy.data.images['Render Result'].save_render(os.path.join(ROOT, 'docs', 'asset-gallery.jpg'), scene=scene)
print('GALLERY_COMPLETE')
