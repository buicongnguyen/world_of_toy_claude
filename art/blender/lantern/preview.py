"""Look-development helpers: a soft studio, turntable-free contact sheets, and quick renders.
Used interactively through MCP for Blender and by the gallery/key-art scripts."""
import math

import bpy
from mathutils import Vector

from .core import lin


def engine_id(kind='EEVEE'):
    items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    if kind == 'CYCLES':
        return 'CYCLES'
    return 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in items else 'BLENDER_EEVEE'


def use_gpu(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                return kind
        except (TypeError, ValueError):
            continue
    scene.cycles.device = 'CPU'
    return 'CPU'


def studio(collection_name='preview_studio', background='#c9d3cf', strength=0.55):
    """Soft three-light studio with a curved backdrop."""
    scene = bpy.context.scene
    coll = bpy.data.collections.get(collection_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o)
    else:
        coll = bpy.data.collections.new(collection_name)
        scene.collection.children.link(coll)
    world = bpy.data.worlds.get('studio') or bpy.data.worlds.new('studio')
    world.use_nodes = True
    bg = next(_n for _n in world.node_tree.nodes if _n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (*lin(background), 1)
    bg.inputs[1].default_value = strength
    scene.world = world
    for name, loc, energy, size, color in (('key', (-4, -5, 7), 900, 5, '#fff3e0'), ('fill', (5, -3, 4), 350, 6, '#e3ecff'),
                                           ('rim', (1, 6, 6), 500, 4, '#ffffff')):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.size = energy, size
        light.color = lin(color)
        o = bpy.data.objects.new(name, light)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        coll.objects.link(o)
    return coll


def arrange(objs, cols=6, spacing=1.6, origin=(0, 0)):
    for i, o in enumerate(objs):
        r, c = divmod(i, cols)
        o.location = (origin[0] + (c - (min(cols, len(objs)) - 1) / 2) * spacing, origin[1] + r * spacing * 1.1, 0)


def camera_for(objs, direction=(0.35, -1.0, 0.62), fov=30, margin=1.12, name='preview_cam'):
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = (hi - lo).length / 2 * margin
    cam_data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    cam_data.lens_unit = 'FOV'
    cam_data.angle = math.radians(fov)
    cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    d = Vector(direction).normalized()
    cam.location = center + d * (radius / math.sin(math.radians(fov) / 2))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def render(path, width=1280, height=720, engine='EEVEE', samples=64, transparent=False):
    scene = bpy.context.scene
    scene.render.engine = engine_id(engine)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    # Match the game's Khronos PBR Neutral tone mapping so colours are judged as players see them.
    views = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items]
    scene.view_settings.view_transform = 'Khronos PBR Neutral' if 'Khronos PBR Neutral' in views else 'AgX'
    scene.view_settings.look = 'None'
    if engine == 'CYCLES':
        use_gpu(scene)
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    else:
        try:
            scene.eevee.taa_render_samples = samples
            scene.eevee.use_raytracing = True
            scene.eevee.use_shadows = True
        except AttributeError:
            pass
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
