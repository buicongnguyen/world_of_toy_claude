"""Hazel's Trunk: the shop's blanket textures and item previews, made from the game's own assets.

    npm run assets:shop      (blender --background --python this file)

Outputs, in assets/lantern-picnic/shop/:
  blanket-<style>.webp   512 px tileable albedo on the gingham's tile layout (the game swaps the
                         cloth's map to these; the woven normal map stays the same)
  <item id>.png          256 px transparent previews: a folded blanket swatch or a lit paper lantern
The lantern colours must match `look` in src/lantern-shop.js (a unit test compares them).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from lantern import preview, textures  # noqa: E402
from lantern.core import Geo, grid, lin, tube, sphere  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'lantern-picnic', 'shop')
os.makedirs(OUT, exist_ok=True)
SIZE = int(os.environ.get('SHOP_SIZE', 256))

BLANKETS = {'blanket-cornflower': 'cornflower', 'blanket-strawberry': 'strawberry', 'blanket-meadow': 'meadow', 'blanket-honey': 'honey'}
# paper tint, glow colour (keep in sync with src/lantern-shop.js)
LANTERNS = {
    'lantern-cream': ('#ffffff', '#ffb85c'),
    'lantern-peach': ('#ffad96', '#ff7f5c'),
    'lantern-mint': ('#9fe8bc', '#5fdc95'),
    'lantern-starlight': ('#aac0ff', '#7ea4ff'),
}

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'lantern-picnic.blend'))
scene = bpy.context.scene
for o in scene.objects:
    o.hide_render = True

# ---------------------------------------------------------------- blanket textures
def save_webp(name, rgb):
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((n, n, 1))], -1).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(OUT, name + '.webp')
    img.file_format = 'WEBP'
    scene.render.image_settings.quality = 88
    img.save()
    return img

albedo = {}
for item, style in BLANKETS.items():
    albedo[item] = save_webp(item, textures.blanket_albedo(512, style))
    print('BLANKET', item)

# ---------------------------------------------------------------- studio
world = bpy.data.worlds.new('shop')
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (*lin('#e6ebf2'), 1)
bg.inputs[1].default_value = 0.8
scene.world = world
lights = bpy.data.collections.new('shop_lights')
scene.collection.children.link(lights)
for name, loc, energy, size, color in (('key', (-2.2, -3.0, 3.6), 230, 2.4, '#fff1dc'), ('fill', (3.0, -2.2, 1.4), 90, 3.0, '#dfe9ff'), ('rim', (0.8, 3.0, 2.6), 200, 2.0, '#ffffff')):
    light = bpy.data.lights.new('shop_' + name, 'AREA')
    light.energy, light.size, light.color = energy, size, lin(color)
    o = bpy.data.objects.new('shop_' + name, light)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    lights.objects.link(o)
cam_data = bpy.data.cameras.new('shop_cam')
cam_data.lens = 70
cam = bpy.data.objects.new('shop_cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = 'CYCLES'
preview.use_gpu(scene)
scene.cycles.samples = int(os.environ.get('SHOP_SAMPLES', 96))
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'Khronos PBR Neutral' if 'Khronos PBR Neutral' in views else 'Standard'
scene.view_settings.look = 'None'


def aim(target, distance, direction=(0.35, -1.0, 0.85)):
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * distance
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()


def render(name):
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('SHOP', name)


# ---------------------------------------------------------------- blanket swatches
def swatch_mesh():
    """A blanket lying flat with gentle waves and one corner folded back: reads as fabric at 48 px."""
    W, n, fold = 1.4, 56, 1.35
    verts, faces, uvs = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            u, v = i / n, j / n
            z = 0.025 * math.sin(u * 6 + v * 2) * math.sin(v * 5 + 1)
            fu, fv = u, v
            if u + v > fold:
                # mirror the top-right corner across the fold line and lay it over the blanket
                fu, fv = fold - v, fold - u
                z = 0.035 + 0.02 * min(1.0, (u + v - fold) * 4)
            verts.append(((fu - 0.5) * W, (fv - 0.5) * W, z))
            uvs.append((u * 1.2, v * 1.2))
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    mesh = bpy.data.meshes.new('swatch')
    mesh.from_pydata(verts, [], faces)
    mesh.polygons.foreach_set('use_smooth', [True] * len(faces))
    uv = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    mod_obj = bpy.data.objects.new('swatch', mesh)
    scene.collection.objects.link(mod_obj)
    solid = mod_obj.modifiers.new('thickness', 'SOLIDIFY')
    solid.thickness = 0.025
    return mod_obj


def fabric(img):
    m = bpy.data.materials.new('swatch_' + img.name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    weave = bpy.data.images.get('gingham_n')
    if weave:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = weave
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 0.5
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.9
    p.inputs['Sheen Weight'].default_value = 0.5
    return m


swatch = swatch_mesh()
tassel_parts = []
for k in range(6):
    ang = -2.4 + k * 0.18
    g = tube([(-0.68, -0.68, 0.03), (-0.76 + math.cos(ang) * 0.08, -0.76 + math.sin(ang) * 0.08, 0.02), (-0.8 + math.cos(ang) * 0.16, -0.8 + math.sin(ang) * 0.16, 0.0)], 0.013, 6, 8)
    tassel_parts.append(g)
tv, tf = [], []
for g in tassel_parts:
    base = len(tv)
    tv += [tuple(p) for p in g.v]
    tf += [tuple(i + base for i in f) for f in g.f]
tm = bpy.data.meshes.new('tassel')
tm.from_pydata(tv, [], tf)
tassel = bpy.data.objects.new('tassel', tm)
scene.collection.objects.link(tassel)
gold = bpy.data.materials.new('tassel_gold')
gold.use_nodes = True
gp = next(x for x in gold.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
gp.inputs['Base Color'].default_value = (*lin('#f2c14e'), 1)
gp.inputs['Roughness'].default_value = 0.7
tm.materials.append(gold)
for item, img in albedo.items():
    swatch.data.materials.clear()
    swatch.data.materials.append(fabric(img))
    aim((0, 0.0, 0.0), 4.3, (0.15, -1.0, 1.25))
    render(item)
swatch.hide_render = True
tassel.hide_render = True

# ---------------------------------------------------------------- lit lanterns
lamp = bpy.data.objects.get('lantern')
if lamp is None:
    raise SystemExit('lantern asset missing from lantern-picnic.blend; run npm run assets:blender first')
lamp.hide_render = False
lamp.location = (0, 0, 0)
paper = next(m for m in lamp.data.materials if m and m.name.startswith('paper'))
pp = next(x for x in paper.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
factor = next((x for x in paper.node_tree.nodes if x.type == 'RGB'), None)
for item, (tint, glow) in LANTERNS.items():
    if factor:
        factor.outputs[0].default_value = (*lin(tint), 1)
    pp.inputs['Emission Color'].default_value = (*lin(glow), 1)
    pp.inputs['Emission Strength'].default_value = 0.55
    aim((0, 0, 0.5), 2.6, (0.25, -1.0, 0.35))
    render(item)
print('SHOP_COMPLETE')
