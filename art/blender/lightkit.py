"""lightkit: build small, lovely, very light creatures and props in Blender, headless, from a few numbers.

    blender -b --factory-startup --python example_critters.py -- --out OUT_DIR

What you get per creature (the contract the game relies on):
  * One empty `<id>` at the centre of mass. Under it a `<id>_body` mesh, plus one `<id>_<part>` mesh for every moving
    part (tail, wing, fin, ear) whose ORIGIN IS THE HINGE. The game animates a part with one rotation per frame:
    no skeleton, no skinning, nothing evaluated per vertex.
  * Colour painted per face and stored as vertex colour (glTF COLOR_0) on ONE shared material, so a creature costs one
    draw call per mesh (body + each moving part) instead of one per colour. Only emissive pieces (a lure, a lantern
    glow) keep a material of their own. No textures, no UVs, no normal maps.
  * Deterministic output (fixed triangulation, sorted faces): re-running a builder does not churn the repository.
  * A report: triangles, draw calls, size, hinge points and `top` (height of the highest point above the centre, used
    to sink a swimmer just under the surface) for every creature, plus problems against the budgets.

Coordinates: Blender is Z up and a creature's nose points toward -Y. glTF is Y up with the nose toward +Z, so a
Blender hinge (x, y, z) becomes (x, z, -y) in the game. A part swinging about Blender Z swings about the game's Y.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))
AHEAD = Vector((0, -1, 0))
GLTF_AXIS = {'X': 'x', 'Y': 'z', 'Z': 'y'}   # a Blender rotation axis, as the game sees it
# Triangle budgets by on-screen size (the skill's budget table). Stored as the `budget` custom property on each
# creature's root, which scripts/blender_budget.py reads to gate a build.
BUDGETS = {'tiny': 120, 'small': 450, 'medium': 1500}


def args_after_dashes():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


# ------------------------------------------------------------------ maths
def pchip(points):
    """Monotone cubic through [(x, y), ...]: smooth, and never overshoots into a negative size."""
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    n = len(xs)
    if n == 1:
        return lambda x: ys[0]
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            h0, h1 = xs[i] - xs[i - 1], xs[i + 1] - xs[i]
            w1, w2 = 2 * h1 + h0, h1 + 2 * h0
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while xs[i + 1] < x:
            i += 1
        h = xs[i + 1] - xs[i]
        s = (x - xs[i]) / h
        return ((2 * s ** 3 - 3 * s ** 2 + 1) * ys[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i]
                + (-2 * s ** 3 + 3 * s ** 2) * ys[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1])
    return f


def _fn(v):
    if callable(v):
        return v
    if isinstance(v, (int, float)):
        return lambda t, v=float(v): v
    return pchip(v)


# -------------------------------------------------------------- materials
def _linear(c):
    return c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hex_color, alpha=1.0):
    value = hex_color.lstrip('#')
    return tuple(_linear(int(value[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)


def paint(name, color, emit_strength=0.0):
    """A colour to paint faces with. It becomes vertex colour on export; only an emissive paint (emit_strength > 0)
    stays a real material of its own, because vertex colour cannot glow. Reused by name."""
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    base = rgba(color)
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = 0.45
    if emit_strength > 0:
        bsdf.inputs['Emission Color'].default_value = base
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    m['lightkit_emit'] = float(emit_strength)
    m.use_backface_culling = True
    m.diffuse_color = base
    return m


def vertex_colour_material(name='lightkit', rough=0.45):
    """The one shared material: base colour from the `Col` colour attribute (exported as glTF COLOR_0)."""
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    m.use_backface_culling = True
    m.diffuse_color = (1, 1, 1, 1)
    return m


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for item in list(block):
            block.remove(item)


# --------------------------------------------------------------- geometry
class Geo:
    """Vertex and face lists with a per-face tag (usually the paint of that face)."""

    def __init__(self, verts, faces, tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [None] * len(self.faces)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def moved(self, offset):
        o = Vector(offset)
        return Geo([v + o for v in self.verts], self.faces, self.tags)

    def mirrored(self):
        """Mirror across X (the left/right twin), keeping faces pointing outward."""
        return Geo([Vector((-v.x, v.y, v.z)) for v in self.verts], [tuple(reversed(f)) for f in self.faces], self.tags)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def signed_volume(self):
        vol = 0.0
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                vol += a.dot(self.verts[f[i]].cross(self.verts[f[i + 1]]))
        return vol / 6.0

    def outward(self):
        """For CLOSED shapes: make the faces point outward."""
        if self.signed_volume() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def moments(self):
        """(volume, volume-weighted centroid sum) of a closed, outward shape."""
        vol, acc = 0.0, Vector()
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                b, c = self.verts[f[i]], self.verts[f[i + 1]]
                v = a.dot(b.cross(c)) / 6.0
                vol += v
                acc += v * (a + b + c) / 4.0
        return vol, acc


def facing(loc, normal, up=(0, 0, 1)):
    """A transform putting local +Z along `normal` at `loc`: for domes, dots and eyes sitting on a surface."""
    z = Vector(normal).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    return Matrix(((x.x, y.x, z.x, loc[0]), (x.y, y.y, z.y, loc[1]), (x.z, y.z, z.z, loc[2]), (0, 0, 0, 1)))


def place(loc=(0, 0, 0), yaw=0.0, pitch=0.0, roll=0.0, scale=1.0):
    """Translate, then rotate about X (pitch), Y (roll) and Z (yaw), in radians, then scale."""
    return Matrix.Translation(Vector(loc)) @ Euler((pitch, roll, yaw)).to_matrix().to_4x4() @ Matrix.Scale(scale, 4)


def skin(rings, tag=None):
    """Loft rings of points into faces (a ring of one point is a pole). tag(band, seg) labels each face."""
    verts, ids = [], []
    for ring in rings:
        idx = []
        for p in ring:
            idx.append(len(verts))
            verts.append(Vector(p))
        ids.append(idx)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(ids, ids[1:])):
        n = max(len(lo), len(up))
        if len(lo) == 1 and len(up) == 1:
            continue
        for s in range(n):
            if len(lo) == 1:
                f = (lo[0], up[(s + 1) % n], up[s])
            elif len(up) == 1:
                f = (lo[s], lo[(s + 1) % n], up[0])
            else:
                f = (lo[s], lo[(s + 1) % n], up[(s + 1) % n], up[s])
            faces.append(f)
            tags.append(tag(b, s) if tag else None)
    return Geo(verts, faces, tags)


def lathe(profile, segs, phase=0.0):
    """Revolve [(radius, height), ...] about Z, base first; radius 0 is a pole. Open at the base on purpose: domes sit
    on a surface, so their underside is never seen and never paid for."""
    rings = []
    for r, h in profile:
        if r < 1e-6:
            rings.append([Vector((0, 0, h))])
        else:
            rings.append([Vector((r * math.cos(phase + TAU * s / segs), r * math.sin(phase + TAU * s / segs), h))
                          for s in range(segs)])
    return skin(rings)


def lens(outline, thick=0.012):
    """A thin closed shape from a 2D outline [(u, v), ...] in the XY plane, pinched at the rim and puffed to +-thick/2
    in the middle so it still catches light: a fin, a petal, a wing, a leaf. Two triangles per outline point."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n
    verts = [Vector((p[0], p[1], 0.0)) for p in outline] + [Vector((cx, cy, thick / 2)), Vector((cx, cy, -thick / 2))]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n))
        faces.append((j, i, n + 1))
    return Geo(verts, faces).outward()


YZ = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def fin_yz(points, thick=0.012):
    """An upright fin (thin along X) from (y, z) outline points: tails, dorsal fins, ears, crests."""
    return lens(points, thick).transformed(YZ)


def fin_xy(points, thick=0.01):
    """A flat fin or wing (thin along Z) from (x, y) outline points: pectoral fins, wings, leaves, lily pads."""
    return lens(points, thick)


# ------------------------------------------------------------------ bodies
class Body:
    """A body swept from the nose (t = 0, toward -Y) to the tail end (t = 1). Profiles are key points [(t, value)],
    interpolated smoothly: half width `w`, upper and lower half heights `ht` and `hb`, centre height `zc`, sideways
    offset `xc` (a wavy eel), and a superellipse exponent `p` (2 = oval, larger = boxier)."""

    def __init__(self, y0, y1, w, ht, hb=None, zc=0.0, xc=0.0, p=2.0):
        self.y0, self.y1 = y0, y1
        self.w, self.ht = _fn(w), _fn(ht)
        self.hb = _fn(hb) if hb is not None else self.ht
        self.zc, self.xc, self.p = _fn(zc), _fn(xc), _fn(p)

    def y(self, t):
        return self.y0 + (self.y1 - self.y0) * t

    def centre(self, t):
        return Vector((self.xc(t), self.y(t), self.zc(t)))

    def axes(self, t):
        e = 1e-3
        tan = (self.centre(min(1.0, t + e)) - self.centre(max(0.0, t - e))).normalized()
        return tan, tan.cross(UP).normalized()

    def point(self, t, th):
        """th = 0 is the right flank (+X), pi/2 the back, -pi/2 the belly."""
        c = self.centre(t)
        _, side = self.axes(t)
        cs, sn = math.cos(th), math.sin(th)
        e = 2.0 / self.p(t)
        x = math.copysign(abs(cs) ** e, cs)
        z = math.copysign(abs(sn) ** e, sn)
        h = self.ht(t) if z >= 0 else self.hb(t)
        return c + side * (self.w(t) * x) + UP * (h * z)

    def edge(self, t, side=1):
        """Height of the back (side=1) or belly (side=-1) at t."""
        return self.zc(t) + (self.ht(t) if side > 0 else -self.hb(t))

    def surface(self, t, th, lift=0.0):
        """(point, outward normal) on the surface: where eyes, dots and spikes go."""
        p = self.point(t, th)
        e = 1e-3
        dt = self.point(min(1.0, t + e), th) - self.point(max(0.0, t - e), th)
        dth = self.point(t, th + e) - self.point(t, th - e)
        n = dth.cross(dt).normalized()
        if n.dot(p - self.centre(t)) < 0:
            n = -n
        return p + n * lift, n


def body_loft(body, ts, sides, painter, phase=0.0):
    """Loft a body through stations `ts` (0..1) with `sides` around it. painter(t, theta) returns the paint of the face
    at that spot: every stripe, patch and belly of the creature comes from that one function, for zero extra geometry.
    Put stations where the colour changes, so patch edges land on face edges."""
    rings = []
    for t in ts:
        if body.w(t) < 1e-5 and body.ht(t) < 1e-5 and body.hb(t) < 1e-5:
            rings.append([body.centre(t)])
        else:
            rings.append([body.point(t, phase + TAU * s / sides) for s in range(sides)])

    def tag(b, s):
        return painter((ts[b] + ts[b + 1]) / 2, phase + TAU * (s + 0.5) / sides)
    return skin(rings, tag).outward()


def ridge_fin(body, outline, side=1, sink=0.012, thick=0.012):
    """A fin standing on the back (side=1) or belly (side=-1). outline = [(t, height), ...] with height 0 at both ends.
    The base sinks into the body, so there is never a gap."""
    base = [(body.y(t), body.edge(t, side) - side * sink) for t, _ in outline]
    top = [(body.y(t), body.edge(t, side) + side * h) for t, h in outline]
    return fin_yz(base + top[::-1], thick)


# ----------------------------------------------------------- face details
def toy_eye(white, black, pos, normal, r, look=0.3):
    """A white dome, a black bead glancing forward and a glint: the most charm per triangle there is (about 40).
    Returns [(Geo, paint)] to add to a Piece."""
    n = Vector(normal).normalized()
    base = Vector(pos) - n * r * 0.28
    out = [(lathe([(r, 0.0), (0.74 * r, 0.33 * r), (0.0, 0.46 * r)], 8).transformed(facing(base, n)), white)]
    d = (n + AHEAD * look).normalized()
    alpha = n.angle(d)
    hit = 1.0 / math.sqrt((math.sin(alpha) / r) ** 2 + (math.cos(alpha) / (0.46 * r)) ** 2)
    pr = 0.62 * r
    centre = base + d * (hit - pr * pr / (4.4 * r))
    out.append((lathe([(pr, 0.0), (0.0, 0.3 * pr)], 6).transformed(facing(centre, d)), black))
    up = UP - d * UP.dot(d)
    up = up.normalized() if up.length > 1e-4 else Vector((0, 0, 1))
    front = AHEAD - d * AHEAD.dot(d)
    front = front.normalized() if front.length > 1e-4 else Vector()
    glint = centre + d * (0.2 * pr) + up * (0.42 * pr) + front * (0.18 * pr)
    out.append((lathe([(0.3 * pr, 0.0), (0.0, 0.12 * pr)], 3, phase=0.4).transformed(facing(glint, d)), white))
    return out


def dot(body, t, th, r, n=6, lift=0.002):
    """A small raised dot on the surface (freckles, scales, a blush). Returns a Geo to add with a paint."""
    pos, nrm = body.surface(t, th, lift)
    ring = [(r * math.cos(TAU * i / n + 0.3), r * math.sin(TAU * i / n + 0.3)) for i in range(n)]
    return lens(ring, 0.25 * r).transformed(facing(pos, nrm, up=(0, -1, 0)))


# ---------------------------------------------------------------- pieces
def triangulate(obj):
    """Triangulate with fixed diagonals and sort faces, so the exported GLB is byte-for-byte reproducible."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3],
                                   quad_method='FIXED', ngon_method='EAR_CLIP')
    for edge in result['edges']:
        edge.smooth = True
    bm.verts.index_update()
    bm.faces.index_update()

    def key(face):
        c = face.calc_center_median()
        return (face.material_index, round(c.x, 4), round(c.y, 4), round(c.z, 4), tuple(sorted(v.index for v in face.verts)))
    rank = {f.index: n for n, f in enumerate(sorted(bm.faces, key=key))}
    bm.faces.sort(key=lambda f: rank[f.index])
    bm.faces.index_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


class Piece:
    """Collects geometry and paints into one named mesh."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.face_paint = [], [], []

    def add(self, geo, paint_=None, xf=None):
        """Add a Geo. `paint_` paints every face; when None, each face keeps its own tag (see body_loft)."""
        verts = [xf @ v for v in geo.verts] if xf is not None else geo.verts
        base = len(self.verts)
        self.verts += [Vector(v) for v in verts]
        for face, tag in zip(geo.faces, geo.tags):
            p = paint_ if paint_ is not None else tag
            if p is None:
                raise ValueError(f'{self.name}: a face has no paint')
            self.faces.append(tuple(base + i for i in face))
            self.face_paint.append(p)
        return self

    def add_all(self, pairs):
        for geo, p in pairs:
            self.add(geo, p)
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def bounds(self):
        xs, ys, zs = zip(*[(v.x, v.y, v.z) for v in self.verts])
        return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

    def build(self, origin, parent=None, shared=None):
        """Create the object with its ORIGIN at `origin` (a hinge, or the creature's centre). With `shared` (the vertex
        colour material) paints become vertex colour; without it every paint is a material slot (one draw call each)."""
        o = Vector(origin)
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([v - o for v in self.verts], [], [tuple(f) for f in self.faces])
        if shared is None:
            slots = list(dict.fromkeys(self.face_paint))
        else:
            slots = [shared] + list(dict.fromkeys(p for p in self.face_paint if p.get('lightkit_emit', 0) > 0))
        for m in slots:
            mesh.materials.append(m)
        for poly, p in zip(mesh.polygons, self.face_paint):
            poly.material_index = slots.index(p) if p in slots else 0
            poly.use_smooth = True
        if shared is not None:
            attr = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
            for poly, p in zip(mesh.polygons, self.face_paint):
                for li in poly.loop_indices:
                    attr.data[li].color = p.diffuse_color
            mesh.color_attributes.active_color = attr
            try:
                mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
            except AttributeError:
                pass
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if parent is not None:
            obj.parent = parent
            obj.location = o - parent.location
        else:
            obj.location = o
        return triangulate(obj)


class Critter:
    """One creature or prop: a body plus hinged parts.

        c = Critter('fish_koi', wag=0.6)
        c.body.add(geo, paint)            # build the body
        c.mass.append(body_geo)           # closed shapes that define the centre of mass
        tail = c.part('tail', hinge)      # a moving part, hinged at `hinge`, swinging about Blender Z
        tail.add(fin_geo, paint)
    """

    def __init__(self, cid, size_class='small', wag=0.6, budget=None):
        self.id, self.size_class, self.wag = cid, size_class, wag
        self.budget = budget if budget is not None else BUDGETS.get(size_class)
        self.body = Piece(cid + '_body')
        self.parts, self.hinges, self.axes, self.mass = {}, {}, {}, []

    def part(self, name, hinge, axis='Z'):
        self.hinges[name] = Vector(hinge)
        self.axes[name] = axis
        self.parts[name] = Piece(f'{self.id}_{name}')
        return self.parts[name]

    def centre(self):
        vol, acc = 0.0, Vector()
        for g in self.mass:
            v, a = g.moments()
            vol += v
            acc += a
        if abs(vol) > 1e-9:
            return acc / vol
        lo, hi = self.body.bounds()
        return (lo + hi) / 2

    def build(self, shared=None):
        centre = self.centre()
        empty = bpy.data.objects.new(self.id, None)
        empty.empty_display_type = 'PLAIN_AXES'
        bpy.context.scene.collection.objects.link(empty)
        empty.location = centre
        if self.budget is not None:
            empty['budget'] = int(self.budget)          # gated by scripts/blender_budget.py
        objs = [empty, self.body.build(centre, empty, shared)]
        for name, piece in self.parts.items():
            objs.append(piece.build(self.hinges[name], empty, shared))
        return empty, objs


# ----------------------------------------------------------- export + checks
def gltf_point(v):
    """A Blender offset (x, y, z) as the game sees it: (x, z, -y)."""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def build_and_export(critters, glb_path, vertex_colours=True, glb_limit=None):
    """Build every critter, export ONE GLB, and return a report (see save_report). Triangle budgets are gated by
    scripts/blender_budget.py on the saved .blend (see save_blend); this only checks the file size."""
    os.makedirs(os.path.dirname(os.path.abspath(glb_path)), exist_ok=True)
    shared = vertex_colour_material() if vertex_colours else None
    report = {'glb': os.path.basename(glb_path), 'vertex_colours': vertex_colours, 'critters': {}, 'problems': []}
    built, everything = {}, []
    for c in critters:
        empty, objs = c.build(shared)
        built[c.id] = (empty, objs, c)
        everything += objs
        centre = empty.location.copy()
        pieces = [c.body] + list(c.parts.values())
        lo = Vector((min(p.bounds()[0].x for p in pieces), min(p.bounds()[0].y for p in pieces), min(p.bounds()[0].z for p in pieces)))
        hi = Vector((max(p.bounds()[1].x for p in pieces), max(p.bounds()[1].y for p in pieces), max(p.bounds()[1].z for p in pieces)))
        meshes = [o for o in objs if o.type == 'MESH']
        tris = sum(len(o.data.polygons) for o in meshes)
        draws = sum(len({poly.material_index for poly in o.data.polygons}) for o in meshes)
        report['critters'][c.id] = {
            'class': c.size_class, 'tris': tris, 'budget': c.budget, 'draws': draws, 'wag': c.wag,
            'length': round(hi.y - lo.y, 4), 'width': round(hi.x - lo.x, 4), 'height': round(hi.z - lo.z, 4),
            'top': round(hi.z - centre.z, 4),
            'parts': {n: {'hinge': gltf_point(c.hinges[n] - centre), 'axis': GLTF_AXIS[c.axes[n]], 'tris': p.tris()}
                      for n, p in c.parts.items()},
        }
    bpy.ops.object.select_all(action='DESELECT')
    for o in everything:
        o.select_set(True)
    bpy.context.view_layer.objects.active = everything[0]
    options = dict(filepath=glb_path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                   export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
                   export_animations=False, export_texcoords=False, export_normals=True)
    try:
        bpy.ops.export_scene.gltf(**options, export_vertex_color='MATERIAL')   # Blender 4.2+
    except TypeError:
        bpy.ops.export_scene.gltf(**options, export_colors=True)              # older exporters
    report['glb_bytes'] = os.path.getsize(glb_path)
    if glb_limit and report['glb_bytes'] > glb_limit:
        report['problems'].append(f"{report['glb']}: {report['glb_bytes']} bytes, over the {glb_limit} budget")
    report['_built'] = built
    return report


def save_blend(path):
    """Save the built scene, so `blender -b file.blend --python blender_budget.py` can gate the budgets in CI."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(path), compress=True)


def save_report(report, path):
    """Write the report (JSON). The game can read `top`, `wag` and each part's `hinge`/`axis` from it, so the art and the
    runtime never drift apart."""
    clean = {k: v for k, v in report.items() if not k.startswith('_')}
    with open(path, 'w', encoding='utf8') as f:
        json.dump(clean, f, indent=1, sort_keys=True)
    return clean


# ----------------------------------------------------------------- previews
def _workbench(scene):
    for engine in ('BLENDER_WORKBENCH', 'BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = engine
            return engine
        except TypeError:
            continue
    return scene.render.engine


def preview(report, png_path, pitch=46, size=(1600, 800), cols=4, spacing=0.8, background='#3c8296', swing=0.0,
            heading=90):
    """Render every critter on a grid with an orthographic camera tilted like the game's, over a background in the
    colour they will be seen against (water, grass), so you judge silhouette and colour as a player will. `swing`
    turns every moving part (radians; `_l` parts the other way, like a flap) to check its hinge; `heading` turns the creatures (90 = nose to the right).
    Returns the render's pixels per world unit (feed it to shrink_png)."""
    scene = bpy.context.scene
    _workbench(scene)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = png_path
    scene.view_settings.view_transform = 'Standard'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'VERTEX' if report.get('vertex_colours') else 'MATERIAL'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.color = rgba(background)[:3]
    items = list(report['_built'].values())
    cols = min(cols, len(items))
    rows = math.ceil(len(items) / cols)
    for i, (empty, objs, c) in enumerate(items):
        empty.location = Vector(((i % cols) * spacing, -(i // cols) * spacing, 0.0))
        empty.rotation_euler = (0, 0, RAD(heading))
        for o in objs[2:]:
            part = o.name[len(c.id) + 1:]
            axis = 'XYZ'.index(c.axes.get(part, 'Z'))
            rot = [0.0, 0.0, 0.0]
            rot[axis] = -swing if part.endswith('_l') else swing   # mirrored twins (wing_l / wing_r) flap opposite
            o.rotation_euler = rot
    aspect = size[0] / size[1]
    need_w = cols * spacing
    need_h = rows * spacing * math.sin(RAD(pitch)) + spacing * 0.4
    cam_data = bpy.data.cameras.new('lightkit preview')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(need_w, need_h * aspect) * 1.08
    cam = bpy.data.objects.new('lightkit preview', cam_data)
    scene.collection.objects.link(cam)
    theta = RAD(90 - pitch)
    target = Vector(((cols - 1) * spacing / 2, -(rows - 1) * spacing / 2, 0))
    cam.location = target + Vector((0, -math.sin(theta) * 20, math.cos(theta) * 20))
    cam.rotation_euler = (theta, 0, 0)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    return size[0] / cam_data.ortho_scale


def shrink_png(src, dst, factor, up=3):
    """Shrink a preview by `factor` (the game's on-screen pixels per unit / the preview's), then enlarge it `up` times
    for viewing: this is what a player really sees. Details that vanish here are triangles you can delete."""
    img = bpy.data.images.load(src)
    w, h = img.size
    sw, sh = max(1, round(w * factor)), max(1, round(h * factor))
    img.scale(sw, sh)
    if up > 1:
        img.scale(sw * up, sh * up)
    img.filepath_raw = dst
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return sw, sh
