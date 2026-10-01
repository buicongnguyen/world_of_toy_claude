"""Core authoring toolkit for The Lantern Picnic asset pipeline.

Everything here uses Blender's data API (bmesh, bpy.data) rather than context-dependent
operators, so the same code runs headless (`npm run assets:blender`) and live inside an
interactive Blender session driven through MCP for Blender.

Look-development model, shared by every asset:
  * Colour is hand-painted per vertex (paint functions evaluated in each part's local space),
    multiplied by ray-traced ambient occlusion, and exported as glTF COLOR_0.
  * Materials describe the *surface* only (felt, glossy fruit skin, lacquered wood, ceramic,
    linen, foliage...). They are shared across assets, carry tileable detail textures that were
    generated in Blender (see textures.py), and use KHR sheen/clearcoat where appropriate.
  * UVs are box-projected in world units so detail textures keep a constant texel density.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

TAU = math.tau


# ----------------------------------------------------------------------------- colour helpers
def lin(value):
    """sRGB hex (or linear tuple) -> linear RGB tuple."""
    if isinstance(value, (tuple, list, Vector)):
        return tuple(value[:3])
    h = value.lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def mix(a, b, t):
    a, b = lin(a), lin(b)
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(c, k):
    return tuple(x * k for x in lin(c))


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0 or 1e-9)))
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------------------- paint helpers
# A paint is a callable (local_position, world_position) -> linear RGB, or a colour value.
def solid(c):
    col = lin(c)
    return lambda lp, wp: col


def grad(c0, c1, lo, hi, axis=2, ease=smoothstep):
    """Gradient along a local axis between lo and hi."""
    return lambda lp, wp: mix(c0, c1, ease(lo, hi, lp[axis]))


def grad3(c0, c1, c2, lo, mid, hi, axis=2):
    def paint(lp, wp):
        z = lp[axis]
        return mix(c0, c1, smoothstep(lo, mid, z)) if z < mid else mix(c1, c2, smoothstep(mid, hi, z))
    return paint


def mottle(paint, amount=0.08, freq=3.0, seed=0.0):
    """Multiplies a paint by soft value noise so large surfaces never look flat."""
    base = as_paint(paint)
    off = Vector((seed * 7.1, seed * 3.3, seed * 5.7))

    def p(lp, wp):
        k = 1 + amount * noise.noise(Vector(wp) * freq + off)
        return tuple(max(0.0, c * k) for c in base(lp, wp))
    return p


def as_paint(p):
    return p if callable(p) else solid(p)


# ----------------------------------------------------------------------------- geometry
class Geo:
    """A lightweight polygon soup: vertices, faces, per-face smooth flags, and the
    untransformed 'local' coordinates used by paint functions."""

    def __init__(self, verts=None, faces=None, smooth=True):
        self.v = [Vector(p) for p in (verts or [])]
        self.local = [Vector(p) for p in self.v]
        self.f = [tuple(f) for f in (faces or [])]
        self.smooth = [smooth] * len(self.f)
        self.uv = None  # optional authored per-vertex UVs (leaf cards); box projection otherwise

    @classmethod
    def from_bmesh(cls, bm, smooth=True):
        bm.verts.index_update()
        g = cls([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces], smooth)
        bm.free()
        return g

    def copy(self):
        g = Geo()
        g.v = [p.copy() for p in self.v]
        g.local = [p.copy() for p in self.local]
        g.f = list(self.f)
        g.smooth = list(self.smooth)
        g.uv = list(self.uv) if self.uv else None
        return g

    # transforms only move world positions; local coordinates stay for painting
    def xf(self, loc=(0, 0, 0), rot=(0, 0, 0), scl=(1, 1, 1)):
        if isinstance(scl, (int, float)):
            scl = (scl, scl, scl)
        m = Matrix.Translation(loc) @ euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scl, 1))
        self.v = [m @ p for p in self.v]
        return self

    def matrix(self, m):
        self.v = [m @ p for p in self.v]
        return self

    def deform(self, fn, local_too=False):
        self.v = [Vector(fn(p.copy())) for p in self.v]
        if local_too:
            self.local = [p.copy() for p in self.v]
        return self

    def bake_local(self):
        """Use current positions as the paint space (after shaping, before placement)."""
        self.local = [p.copy() for p in self.v]
        return self

    def flat(self):
        self.smooth = [False] * len(self.f)
        return self

    def center(self):
        return sum(self.v, Vector()) / max(1, len(self.v))

    def bounds(self):
        xs, ys, zs = zip(*self.v)
        return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

    def displace(self, amount, freq=2.0, seed=0.0, center=None, octaves=1):
        """Radial noise displacement (for blobs, rocks, canopies)."""
        c = self.center() if center is None else Vector(center)
        off = Vector((seed * 13.7, seed * 5.1, seed * 9.3))
        out = []
        for p in self.v:
            d = (p - c)
            n = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
            out.append(p + n * amount * noise.fractal(p * freq + off, 0.5, 2.0, octaves) if octaves > 1 else p + n * amount * noise.noise(p * freq + off))
        self.v = out
        return self


def euler(rot):
    from mathutils import Euler
    return Euler(rot, 'XYZ')


def merge(*geos):
    g = Geo()
    with_uv = geos and all(part.uv for part in geos)
    g.uv = [] if with_uv else None
    for part in geos:
        base = len(g.v)
        g.v += [p.copy() for p in part.v]
        g.local += [p.copy() for p in part.local]
        g.f += [tuple(i + base for i in f) for f in part.f]
        g.smooth += part.smooth
        if with_uv:
            g.uv += list(part.uv)
    return g


def card(center, up, right, width, height, pivot=0.3):
    """A double-sided-material quad with authored 0..1 UVs (v up). `pivot` is how far along the
    height the anchor sits, so sprig textures grow out of the surface they are planted in."""
    c, u, r = Vector(center), Vector(up).normalized(), Vector(right).normalized()
    b = c - u * height * pivot
    t = b + u * height
    verts = [b - r * width / 2, b + r * width / 2, t + r * width / 2, t - r * width / 2]
    g = Geo(verts, [(0, 1, 2, 3)])
    g.uv = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    return g


# ---- primitives (all centred at the origin unless noted)
def sphere(r=1.0, seg=24, ring=14):
    r = (r, r, r) if isinstance(r, (int, float)) else r
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    g = Geo.from_bmesh(bm)
    g.v = [Vector((p.x * r[0], p.y * r[1], p.z * r[2])) for p in g.v]
    return g.bake_local()


def ico(r=1.0, sub=3):
    r = (r, r, r) if isinstance(r, (int, float)) else r
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    g = Geo.from_bmesh(bm)
    g.v = [Vector((p.x * r[0], p.y * r[1], p.z * r[2])) for p in g.v]
    return g.bake_local()


def cyl(r1=1.0, r2=None, h=1.0, seg=24, caps=True, base=False):
    """Cylinder/cone along Z. base=True puts the bottom at z=0."""
    r2 = r1 if r2 is None else r2
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    g = Geo.from_bmesh(bm)
    if base:
        g.v = [p + Vector((0, 0, h / 2)) for p in g.v]
    # side faces smooth, caps flat
    for i, f in enumerate(g.f):
        if len(f) > 4:
            g.smooth[i] = False
    return g.bake_local()


def rbox(sx, sy, sz, bevel=0.05, seg=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=min(bevel, min(sx, sy, sz) * 0.49),
                        offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    bm.normal_update()
    axis_faces = {f.index for f in bm.faces if max(abs(f.normal.x), abs(f.normal.y), abs(f.normal.z)) > 0.999}
    bm.faces.index_update()
    flat = [f.index in axis_faces for f in bm.faces]
    g = Geo.from_bmesh(bm)
    g.smooth = [not x for x in flat]
    return g.bake_local()


def resample(profile, count):
    """Catmull-Rom resample of a (radius, z) profile, keeping its end points exact."""
    pts = _catmull([(r, z, 0.0) for r, z in profile], count)
    out = [(max(0.0, p.x), p.y) for p in pts]
    out[0], out[-1] = tuple(profile[0]), tuple(profile[-1])
    return out


def lathe(profile, seg=32, wobble=None, rings=28, caps=True):
    """Revolve [(radius, z), ...] (bottom to top) around Z. Zero radius ends become poles;
    other ends are capped flat unless caps=False (bowls, open shells).
    The profile is resampled to `rings` smooth rings (None keeps it as authored).
    wobble(angle, t) -> radial multiplier for lobes/irregularity."""
    if rings and rings > len(profile):
        profile = resample(profile, rings)
    verts, faces, rings = [], [], []
    n = len(profile)
    for i, (r, z) in enumerate(profile):
        t = i / (n - 1)
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for k in range(seg):
            a = k * TAU / seg
            rr = r * (wobble(a, t) if wobble else 1.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            faces += [(a[0], b[k], b[(k + 1) % seg]) for k in range(seg)]
        elif len(b) == 1:
            faces += [(a[k], b[0], a[(k + 1) % seg]) for k in range(seg)]
        else:
            faces += [(a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]) for k in range(seg)]
    if caps and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
    if caps and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
    g = Geo(verts, faces)
    return g


def _catmull(points, samples):
    pts = [Vector(p) for p in points]
    if len(pts) == 2:
        return [pts[0].lerp(pts[1], i / (samples - 1)) for i in range(samples)]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    segs = len(pts) - 1
    for i in range(samples):
        u = i / (samples - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def tube(points, radius=0.05, seg=10, samples=None, caps=True, smooth_path=True):
    """Sweep a circle along a Catmull-Rom path. radius may be a float or f(t)."""
    samples = samples or max(6, len(points) * 6)
    path = _catmull(points, samples) if smooth_path else [Vector(p) for p in points]
    rfn = radius if callable(radius) else (lambda t: radius)
    verts, faces = [], []
    # parallel-transport frames
    tangents = []
    for i in range(len(path)):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        tangents.append((b - a).normalized())
    up = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normal = tangents[0].cross(up).normalized()
    for i, (p, t) in enumerate(zip(path, tangents)):
        if i:
            axis = tangents[i - 1].cross(t)
            if axis.length > 1e-6:
                ang = tangents[i - 1].angle(t)
                normal = Matrix.Rotation(ang, 3, axis.normalized()) @ normal
        binormal = t.cross(normal).normalized()
        r = rfn(i / (len(path) - 1))
        for k in range(seg):
            a = k * TAU / seg
            verts.append(p + (normal * math.cos(a) + binormal * math.sin(a)) * r)
    for i in range(len(path) - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    g = Geo(verts, faces)
    if caps:
        # rounded end caps: a pole slightly beyond each end
        for end, sign in ((0, -1), (len(path) - 1, 1)):
            r = rfn(end / (len(path) - 1))
            tip = path[end] + tangents[end] * sign * r * 0.6
            idx = len(g.v)
            g.v.append(tip)
            g.local.append(tip.copy())
            ring = [end * seg + k for k in range(seg)]
            for k in range(seg):
                a, b = ring[k], ring[(k + 1) % seg]
                g.f.append((a, b, idx) if sign > 0 else (b, a, idx))
                g.smooth.append(True)
    return g


def torus(R=1.0, r=0.2, seg=32, ring=10):
    verts, faces = [], []
    for i in range(seg):
        a = i * TAU / seg
        for j in range(ring):
            b = j * TAU / ring
            verts.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg):
        for j in range(ring):
            a, b = i * ring + j, i * ring + (j + 1) % ring
            c, d = ((i + 1) % seg) * ring + (j + 1) % ring, ((i + 1) % seg) * ring + j
            faces.append((a, d, c, b))
    return Geo(verts, faces)


def grid(sx, sy, nx, ny, fn=None):
    """Flat grid in XY centred at origin; fn(x, y) -> z height."""
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x, y = (i / nx - 0.5) * sx, (j / ny - 0.5) * sy
            verts.append((x, y, fn(x, y) if fn else 0.0))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return Geo(verts, faces)


def leaf(length=0.4, width=0.16, thick=0.025, bend=0.08, seg=16, ring=8, curl=0.0):
    """A closed, gently cupped leaf pointing along +X from the origin."""
    g = sphere((length / 2, width / 2, thick), seg, ring)
    def shape(p):
        t = min(1.0, max(0.0, (p.x + length / 2) / length))  # 0 at base, 1 at tip
        taper = 1 - 0.55 * t ** 2.2 - 0.35 * (1 - t) ** 6
        y = p.y * max(0.05, taper)
        z = p.z + bend * t * t + curl * (y / (width / 2 + 1e-6)) ** 2 * width * 0.5
        return Vector((p.x + length / 2, y, z))
    g.deform(shape, local_too=True)
    return g


def cone(r=0.5, h=1.0, seg=16):
    return cyl(r, 0.0, h, seg, caps=True, base=True)


def ring_positions(n, radius, z=0.0, start=0.0):
    return [(radius * math.cos(start + i * TAU / n), radius * math.sin(start + i * TAU / n), z) for i in range(n)]


# ----------------------------------------------------------------------------- assets
class Asset:
    """Collects painted parts and builds one mesh object (optionally rigid-skinned)."""

    def __init__(self, name, ao=0.35, ao_strength=0.9, ground=True):
        self.name = name
        self.parts = []
        self.ao = ao
        self.ao_strength = ao_strength
        self.ground = ground

    def add(self, geo, mat, paint='#ffffff', bone=None, normals=None):
        """normals: optional (centre, blend) that bends the shading normals of this part toward
        the direction away from `centre` (soft, volumetric shading for canopies and leaf cards)."""
        if geo.uv is None:
            orient_outward(geo)
        self.parts.append((geo, mat, as_paint(paint), bone))
        if normals is not None:
            self.normal_parts[id(geo)] = normals
        return geo

    @property
    def normal_parts(self):
        if not hasattr(self, '_normal_parts'):
            self._normal_parts = {}
        return self._normal_parts

    def build(self, lib, collection=None, samples=28):
        verts, faces, face_mat, face_smooth, colors, bones = [], [], [], [], [], []
        uvs, bend = {}, {}
        mats = []
        for geo, mat, paint, bone in self.parts:
            if mat not in mats:
                mats.append(mat)
            mi = mats.index(mat)
            base = len(verts)
            verts += geo.v
            for lp, wp in zip(geo.local, geo.v):
                colors.append(paint(lp, wp))
            bones += [bone] * len(geo.v)
            if geo.uv:
                for i, t in enumerate(geo.uv):
                    uvs[base + i] = t
            spec = self.normal_parts.get(id(geo))
            if spec:
                for i in range(len(geo.v)):
                    bend[base + i] = spec
            for f, s in zip(geo.f, geo.smooth):
                faces.append(tuple(i + base for i in f))
                face_mat.append(mi)
                face_smooth.append(s)
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in verts], [], faces)
        mesh.validate(clean_customdata=False)
        mesh.polygons.foreach_set('use_smooth', face_smooth)
        mesh.polygons.foreach_set('material_index', face_mat)
        for m in mats:
            mesh.materials.append(lib.material(m))
        box_uv(mesh)
        if uvs:
            data = mesh.uv_layers['UVMap'].data
            for loop in mesh.loops:
                t = uvs.get(loop.vertex_index)
                if t is not None:
                    data[loop.index].uv = t
        ao = occlusion(mesh, self.ao, samples, self.ground) if self.ao > 0 else [1.0] * len(mesh.vertices)
        if bend:
            bend_normals(mesh, bend)
        attr = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        flat = []
        for c, o in zip(colors, ao):
            k = 1 - self.ao_strength * (1 - o)
            flat += [c[0] * k, c[1] * k, c[2] * k, 1.0]
        attr.data.foreach_set('color', flat)
        mesh.color_attributes.active_color = attr
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
        obj = bpy.data.objects.new(self.name, mesh)
        (collection or bpy.context.scene.collection).objects.link(obj)
        obj['bones'] = sorted({b for b in bones if b})
        obj['_bone_map'] = [b or '' for b in bones]
        return obj


def bend_normals(mesh, bend):
    """Custom split normals: selected vertices shade as if they were on a smooth volume around a
    centre (the classic stylised-tree trick). bend: {vertex index: (centre, blend 0..1)}."""
    mesh.update()
    corner = [Vector(c.vector) for c in mesh.corner_normals]
    co = mesh.vertices
    out = []
    for loop, n in zip(mesh.loops, corner):
        spec = bend.get(loop.vertex_index)
        if spec is None:
            out.append(n)
            continue
        centre, k = spec
        d = co[loop.vertex_index].co - Vector(centre)
        if d.length < 1e-6:
            out.append(n)
            continue
        # lift slightly so canopies catch the sky on top and darken underneath
        d = d.normalized()
        d = (d + Vector((0, 0, 0.25))).normalized()
        out.append(n.lerp(d, k).normalized())
    mesh.normals_split_custom_set(out)


def orient_outward(geo):
    """Closed parts get consistent outward normals (lathe profiles that fold back, e.g. a plate
    well, would otherwise face inward and vanish under back-face culling). Open surfaces keep
    their authored winding."""
    edges = {}
    for f in geo.f:
        for i in range(len(f)):
            e = (min(f[i], f[i - 1]), max(f[i], f[i - 1]))
            edges[e] = edges.get(e, 0) + 1
    if not edges or any(c != 2 for c in edges.values()):
        return geo
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in geo.v]
    faces = []
    for f in geo.f:
        try:
            faces.append(bm.faces.new([vs[i] for i in f]))
        except ValueError:
            bm.free()
            return geo
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    geo.f = [tuple(v.index for v in face.verts) for face in faces]
    bm.free()
    return geo


def box_uv(mesh, scale=1.0):
    """World-unit box projection (like Blender's Cube Projection without bounds fitting)."""
    uv = mesh.uv_layers.new(name='UVMap')
    co = [v.co for v in mesh.vertices]
    data = uv.data
    for poly in mesh.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            p = co[mesh.loops[li].vertex_index]
            if ax == 0:
                data[li].uv = (p.y * scale * (1 if n.x > 0 else -1), p.z * scale)
            elif ax == 1:
                data[li].uv = (p.x * scale * (-1 if n.y > 0 else 1), p.z * scale)
            else:
                data[li].uv = (p.x * scale, p.y * scale * (1 if n.z > 0 else -1))


_DIRS = {}


def _hemisphere(n):
    """Cosine-weighted, low-discrepancy hemisphere directions around +Z."""
    if n not in _DIRS:
        dirs = []
        golden = math.pi * (3 - math.sqrt(5))
        for i in range(n):
            u = (i + 0.5) / n
            r = math.sqrt(u)
            a = i * golden
            dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
        _DIRS[n] = dirs
    return _DIRS[n]


def occlusion(mesh, distance, samples=28, ground=True):
    """Ray-traced ambient occlusion per vertex (1 = open, 0 = occluded).
    A ground plane at z=0 is included so feet and bases sit naturally."""
    verts = [v.co.copy() for v in mesh.vertices]
    polys = [tuple(p.vertices) for p in mesh.polygons]
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    mesh.update()
    normals = [Vector(n.vector) for n in mesh.vertex_normals]
    dirs = _hemisphere(samples)
    out = []
    for p, n in zip(verts, normals):
        if n.length < 1e-6:
            out.append(1.0)
            continue
        rot = n.to_track_quat('Z', 'Y').to_matrix()
        origin = p + n * (distance * 0.02 + 1e-4)
        hit = 0.0
        for d in dirs:
            w = rot @ d
            loc, _, _, dist = tree.ray_cast(origin, w, distance)
            if loc is not None:
                hit += 1 - (dist / distance) ** 2 * 0.5
                continue
            if ground and w.z < -1e-4 and origin.z >= -1e-3:
                t = -origin.z / w.z
                if t < distance:
                    hit += 1 - (t / distance) ** 2 * 0.5
        out.append(1 - hit / len(dirs))
    return out


# ----------------------------------------------------------------------------- rigging
def rig(obj, name, bones, collection=None):
    """Create an armature from {bone: (head, parent)} with every bone pointing +Z (uniform local
    axes: X = world X, Y = world Z up, Z = world -Y/front), then bind the mesh rigidly using the
    per-vertex bone map recorded by Asset.build."""
    arm = bpy.data.armatures.new(name + '_rig')
    ao = bpy.data.objects.new(name, arm)
    (collection or bpy.context.scene.collection).objects.link(ao)
    view_layer = bpy.context.view_layer
    view_layer.objects.active = ao
    with bpy.context.temp_override(active_object=ao, object=ao, selected_objects=[ao], selected_editable_objects=[ao]):
        bpy.ops.object.mode_set(mode='EDIT')
        eb = {}
        for bone, (head, parent) in bones.items():
            b = arm.edit_bones.new(bone)
            b.head = Vector(head)
            b.tail = Vector(head) + Vector((0, 0, 0.12))
            b.roll = 0.0
            eb[bone] = b
        for bone, (head, parent) in bones.items():
            if parent:
                eb[bone].parent = eb[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
    obj.parent = ao
    bone_map = list(obj['_bone_map'])
    for bone in bones:
        vg = obj.vertex_groups.new(name=bone)
        idx = [i for i, b in enumerate(bone_map) if b == bone]
        if idx:
            vg.add(idx, 1.0, 'REPLACE')
    mod = obj.modifiers.new('rig', 'ARMATURE')
    mod.object = ao
    del obj['_bone_map']
    for pb in ao.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ao


# ----------------------------------------------------------------------------- misc
def rng(seed):
    return random.Random(seed)


def finalize(obj):
    if '_bone_map' in obj.keys():
        del obj['_bone_map']
    return obj
