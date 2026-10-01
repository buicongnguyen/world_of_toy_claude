"""Build every runtime asset for The Lantern Picnic.

    npm run assets:blender        (headless: blender --background --factory-startup --python this file)

or live, through MCP for Blender:
    exec(open(r'<repo>/art/blender/build_lantern_picnic.py').read())

Outputs
  assets/lantern-picnic/fruit.glb     12 fruit
  assets/lantern-picnic/world.glb     island, foliage, rocks, props, keepsakes, cloth
  assets/lantern-picnic/friends.glb   5 rigged characters with 7 animation clips each
  assets/lantern-picnic/manifest.json asset inventory
  art/blender/lantern-picnic.blend    editable source (textures packed)
All geometry, paint, textures and animation are authored procedurally here; nothing is downloaded.
"""
import importlib
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else os.path.join(os.getcwd(), 'art', 'blender')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lantern  # noqa: E402
from lantern import characters, core, fruit, preview, props, textures, world  # noqa: E402

for mod in (core, textures, preview, fruit, characters, props, world):
    importlib.reload(mod)

OUT = os.path.join(ROOT, 'assets', 'lantern-picnic')
TEX_DIR = os.path.join(HERE, '.cache', 'textures')


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for item in list(coll):
            coll.remove(item)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def select_only(objs):
    layer = bpy.context.view_layer
    for o in layer.objects:
        o.select_set(False)
    for o in objs:
        for child in [o, *o.children_recursive]:
            child.select_set(True)
    layer.objects.active = objs[0]


def export(path, objs, animations=False):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_vertex_color='MATERIAL', export_image_format='WEBP', export_image_quality=82,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=11, export_draco_color_quantization=8, export_draco_generic_quantization=12,
        export_animations=animations, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=True, export_skins=True, export_def_bones=False, export_leaf_bone=False,
        export_cameras=False, export_lights=False, export_extras=False)
    return os.path.getsize(path)


def main(force_textures=True):
    t0 = time.time()
    reset()
    tex = textures.generate(TEX_DIR) if force_textures else textures.ensure(TEX_DIR)
    lib = textures.Library(tex)
    groups = {
        'fruit': fruit.build(lib, collection('fruit')),
        'props': props.build(lib, collection('props')),
        'world': world.build(lib, collection('world')),
        'friends': characters.build(lib, collection('friends')),
    }
    for objs in groups.values():
        for o in objs:
            core.finalize(o)
    os.makedirs(OUT, exist_ok=True)
    sizes = {
        'fruit.glb': export(os.path.join(OUT, 'fruit.glb'), groups['fruit']),
        'world.glb': export(os.path.join(OUT, 'world.glb'), groups['props'] + groups['world']),
        'friends.glb': export(os.path.join(OUT, 'friends.glb'), groups['friends'], animations=True),
    }
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    manifest = {
        'generator': 'Blender ' + bpy.app.version_string,
        'source': 'art/blender/build_lantern_picnic.py',
        'files': sizes,
        'fruit': [o.name for o in groups['fruit']],
        'props': [o.name for o in groups['props']],
        'world': [o.name for o in groups['world']],
        'friends': {o.name: sorted(a.name[len(o.name) + 1:] for a in bpy.data.actions if a.name.startswith(o.name + '_')) for o in groups['friends']},
        'clips': {name: {'seconds': dur, 'loop': loop} for name, (_, dur, loop) in characters.CLIPS.items()},
        'vertices': sum(len(o.data.vertices) for o in meshes),
        'triangles': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes),
        'textures': sorted(i.name for i in bpy.data.images if i.name.endswith(('_n', '_a'))),
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    for img in bpy.data.images:
        if img.name.endswith(('_n', '_a')) and not img.packed_file:
            img.pack()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'lantern-picnic.blend'), compress=True)
    print('LANTERN_ASSETS_COMPLETE %.1fs' % (time.time() - t0), json.dumps({k: manifest[k] for k in ('files', 'vertices', 'triangles')}))
    return manifest


if __name__ == '__main__' or bpy.app.background:
    main(force_textures=True)
