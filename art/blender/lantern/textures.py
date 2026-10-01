"""Tileable surface-detail textures, generated inside Blender with numpy, and the shared
material library that uses them.

All patterns are periodic by construction (FFT-filtered noise, integer-frequency waves,
wrap-around cellular noise), so they tile seamlessly under box-projected UVs.
Normal maps are tangent-space, OpenGL (+Y) convention, as glTF expects.
"""
import os

import bpy
import numpy as np

from .core import lin

SIZE = 512


# ----------------------------------------------------------------------------- noise kernels
def _rng(seed):
    return np.random.default_rng(seed)


def spectral(n, beta=1.2, seed=0, lo=1.0, hi=None, aniso=(1.0, 1.0)):
    """1/f^beta periodic noise in [0, 1]. aniso stretches features (x, y)."""
    w = _rng(seed).standard_normal((n, n))
    f = np.fft.fftfreq(n) * n
    fy, fx = np.meshgrid(f, f, indexing='ij')
    r = np.sqrt((fx * aniso[0]) ** 2 + (fy * aniso[1]) ** 2)
    r[0, 0] = 1
    amp = 1 / r ** beta
    amp[r < lo] = 0
    if hi:
        amp[r > hi] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * amp))
    out -= out.min()
    return out / (out.max() + 1e-9)


def cellular(n, cells, seed=0, jitter=0.9):
    """Wrap-around Worley noise: returns (F1, F2) distances in cell units.
    cells may be (columns, rows) for elongated cells (e.g. bark plates)."""
    cx, cy = (cells, cells) if isinstance(cells, int) else cells
    g = _rng(seed)
    pts = g.random((cy, cx, 2)) * jitter + (1 - jitter) / 2
    yy, xx = np.mgrid[0:n, 0:n] / n
    y, x = yy * cy, xx * cx
    ci, cj = np.floor(y).astype(int), np.floor(x).astype(int)
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    aspect = cx / cy  # measure distance in isotropic texture space, in column widths
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ni, nj = ci + dy, cj + dx
            p = pts[ni % cy, nj % cx]
            py, px = ni + p[..., 0], nj + p[..., 1]
            d = np.sqrt(((py - y) * aspect) ** 2 + (px - x) ** 2)
            f2 = np.where(d < f1, f1, np.minimum(f2, d))
            f1 = np.minimum(f1, d)
    return f1, f2


def normal_from_height(h, strength=4.0):
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    n = np.stack([-dx * strength * h.shape[0] / 64, -dy * strength * h.shape[0] / 64, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def uv(n=SIZE):
    y, x = np.mgrid[0:n, 0:n] / n
    return x, y


# ----------------------------------------------------------------------------- patterns
# Each returns (height[0..1], albedo[0..1] or None). Row 0 is the bottom of the image.
def pat_linen(n):
    x, y = uv(n)
    N = 40
    u, v = x * N, y * N
    fu, fv = u % 1, v % 1
    slub_u = spectral(n, 1.5, 11, aniso=(40, 1))  # thickness variation along threads
    slub_v = spectral(n, 1.5, 12, aniso=(1, 40))
    warp = np.sin(np.pi * fv) ** 0.7 * (0.75 + 0.25 * np.cos(np.pi * (fu * 2 - 1))) * (0.85 + 0.3 * slub_u)
    weft = np.sin(np.pi * fu) ** 0.7 * (0.75 + 0.25 * np.cos(np.pi * (fv * 2 - 1))) * (0.85 + 0.3 * slub_v)
    over = ((np.floor(u) + np.floor(v)) % 2).astype(bool)
    h = np.where(over, np.maximum(warp, weft * 0.6), np.maximum(weft, warp * 0.6))
    h = h * 0.85 + spectral(n, 0.4, 13) * 0.15
    albedo = 0.9 + 0.1 * h - 0.05 * spectral(n, 1.2, 14, lo=2)
    return h, albedo


def pat_felt(n):
    fine = spectral(n, 0.35, 21, lo=40)
    fibre = spectral(n, 0.9, 22, lo=20, aniso=(3, 1)) * 0.5 + spectral(n, 0.9, 23, lo=20, aniso=(1, 3)) * 0.5
    blot = spectral(n, 1.6, 24, lo=1, hi=6)
    h = fine * 0.55 + fibre * 0.45
    albedo = 0.9 + 0.08 * (blot - 0.5) + 0.05 * (fine - 0.5)
    return h, albedo


def pat_knit(n):
    x, y = uv(n)
    cols, rows = 16, 22
    u, v = (x * cols) % 1, (y * rows) % 1
    def lobe(cx, ang):
        dx, dy = u - cx, v - 0.5
        c, s = np.cos(ang), np.sin(ang)
        rx, ry = dx * c - dy * s, dx * s + dy * c
        return np.clip(1 - (rx / 0.2) ** 2 - (ry / 0.55) ** 2, 0, 1) ** 0.6
    h = np.maximum(lobe(0.27, 0.5), lobe(0.73, -0.5))
    h = h * 0.9 + spectral(n, 0.5, 31, lo=30) * 0.1
    return h, 0.86 + 0.14 * h


def pat_wood(n):
    x, y = uv(n)
    warp = spectral(n, 1.8, 41, lo=1, hi=8, aniso=(1, 6))
    rings = np.sin((y * 7 + warp * 2.2) * np.pi * 2) * 0.5 + 0.5
    grain = spectral(n, 0.8, 42, lo=10, aniso=(1, 12))
    h = rings * 0.35 + grain * 0.65
    albedo = 0.86 + 0.07 * rings + 0.1 * (grain - 0.5)
    return h, albedo


def pat_wicker(n):
    x, y = uv(n)
    N = 8
    u, v = x * N, y * N
    fu, fv = u % 1, v % 1
    cell = (np.floor(u) + np.floor(v)) % 2
    strands = 3
    band_h = np.sin(np.pi * ((fv * strands) % 1)) ** 0.6 * np.sin(np.pi * fu) ** 0.25
    band_v = np.sin(np.pi * ((fu * strands) % 1)) ** 0.6 * np.sin(np.pi * fv) ** 0.25
    h = np.where(cell == 0, band_h, band_v)
    albedo = 0.7 + 0.3 * h + 0.05 * spectral(n, 1.0, 51, lo=4)
    return h, albedo


def pat_skin(n):
    f1, _ = cellular(n, 48, 61)
    pits = 1 - np.clip(f1 / 0.55, 0, 1) ** 0.5
    h = 1 - pits * 0.7 + spectral(n, 0.8, 62, lo=8) * 0.3
    return h, None


def pat_ceramic(n):
    h = spectral(n, 2.0, 71, lo=1, hi=10) * 0.8 + spectral(n, 0.3, 72, lo=60) * 0.2
    return h, None


def pat_leaf(n):
    f1, f2 = cellular(n, 7, 81)
    veins = np.clip((f2 - f1) / 0.05, 0, 1) ** 0.5
    h = veins * 0.35 + spectral(n, 0.7, 82, lo=12) * 0.65
    albedo = 0.9 + 0.1 * veins
    return h, albedo


def leaf_scatter(n, count, length=(0.12, 0.2), aspect=0.42, seed=0, periodic=True, sprig=None):
    """Overlapping leaf shapes painted back to front. Returns (height, shade, mask).
    Each leaf is a pointed ellipse with a soft dome, a midrib and lighter tips. With `sprig`
    ((x, y) base point), leaves radiate from that point like a cut twig instead of tiling."""
    g = _rng(seed)
    yy, xx = np.mgrid[0:n, 0:n] / n
    h = np.zeros((n, n))
    shade = np.zeros((n, n))
    mask = np.zeros((n, n))
    for k in range(count):
        L = g.uniform(*length)
        W = L * aspect * g.uniform(0.85, 1.15)
        if sprig:
            # leaves fan out from the stem, larger toward the outside of the twig
            ang = g.uniform(0.25, np.pi - 0.25)
            t = g.uniform(0.05, 0.55)
            bx, by = sprig[0] + np.cos(ang) * t * 0.9, sprig[1] + np.sin(ang) * t * 0.9
            theta = ang + g.uniform(-0.45, 0.45)
        else:
            bx, by = g.random(), g.random()
            theta = g.uniform(0, 2 * np.pi)
        dx, dy = xx - bx, yy - by
        if periodic:
            dx, dy = (dx + 0.5) % 1 - 0.5, (dy + 0.5) % 1 - 0.5
        c, s = np.cos(theta), np.sin(theta)
        u, v = dx * c + dy * s, -dx * s + dy * c  # u along the leaf from its base
        t = np.clip(u / L, 0, 1)
        half = W / 2 * np.sin(np.pi * t) ** 0.75 * (1 - 0.25 * t)
        inside = (u > 0) & (u < L) & (np.abs(v) < half)
        q = np.where(inside, np.abs(v) / np.maximum(half, 1e-6), 1)
        dome = np.sqrt(np.clip(1 - q ** 2, 0, 1)) * (0.55 + 0.45 * t)
        rib = np.exp(-(v / (W * 0.045)) ** 2) * (t < 0.92)
        layer = k / count
        hh = 0.35 + 0.45 * dome - 0.12 * rib + 0.2 * layer
        sh = (0.78 + 0.22 * t) * (1 - 0.18 * rib) * (0.9 + 0.1 * g.random()) * (0.86 + 0.14 * layer)
        h = np.where(inside, hh, h)
        shade = np.where(inside, sh, shade)
        mask = np.where(inside, 1.0, mask)
    return h, shade, mask


def pat_canopy(n):
    # soft, broad leaves for the canopy volume; the leaf cards carry the crisp silhouette
    h, shade, mask = leaf_scatter(n, 170, (0.1, 0.17), seed=91)
    base = spectral(n, 1.4, 92, lo=1, hi=6)
    h = np.where(mask > 0, h, 0.2) * 0.8 + base * 0.2
    albedo = np.where(mask > 0, 0.88 + 0.12 * shade, 0.82) + 0.04 * (base - 0.5)
    return h, albedo


def leafcard(n=512, seed=301):
    """RGBA sprig for foliage cards: grey-scale leaves (vertex colour supplies the hue) with alpha."""
    h, shade, mask = leaf_scatter(n, 26, (0.2, 0.34), 0.4, seed, periodic=False, sprig=(0.5, 0.04))
    # a thin twig up the middle
    yy, xx = np.mgrid[0:n, 0:n] / n
    twig = (np.abs(xx - 0.5 - 0.03 * np.sin(yy * 6)) < 0.008 * (1.2 - yy)) & (yy < 0.55)
    grey = np.where(mask > 0, 0.68 + 0.32 * shade, 0.5)
    grey = np.where(twig & (mask == 0), 0.35, grey)
    alpha = np.clip(mask + twig, 0, 1)
    # soften the rim a touch so mip levels keep a leafy edge instead of shrinking to nothing
    edge = (np.roll(alpha, 1, 0) + np.roll(alpha, -1, 0) + np.roll(alpha, 1, 1) + np.roll(alpha, -1, 1)) / 4
    alpha = np.maximum(alpha, edge * 0.9)
    rgb = np.repeat(grey[..., None], 3, -1)
    return np.concatenate([rgb, alpha[..., None]], -1)


def pat_bark(n):
    fibres = spectral(n, 1.0, 101, lo=4, aniso=(10, 1))
    f1, f2 = cellular(n, (7, 2), 102)  # tall bark plates separated by vertical furrows
    cracks = np.clip((f2 - f1) / 0.08, 0, 1)
    h = fibres * 0.6 + cracks * 0.4
    albedo = 0.7 + 0.3 * h
    return h, albedo


def pat_stone(n):
    # soft pitted stone with faint sediment layers; no cellular cracks (they read as turtle shell)
    base = spectral(n, 1.6, 111, lo=1)
    x, y = uv(n)
    strata = np.sin((y * 6 + spectral(n, 1.8, 112, lo=1, hi=5) * 0.8) * np.pi * 2) * 0.5 + 0.5
    speck = spectral(n, 0.2, 113, lo=80)
    pits = np.clip(1 - cellular(n, 30, 114)[0] / 0.3, 0, 1) ** 2
    h = base * 0.55 + strata * 0.15 + speck * 0.15 - pits * 0.15
    albedo = 0.84 + 0.1 * base + 0.05 * strata + 0.05 * (speck - 0.5)
    return h, albedo


def pat_soil(n):
    base = spectral(n, 1.4, 121, lo=1)
    f1, _ = cellular(n, 22, 122)
    pebbles = np.clip(1 - f1 / 0.35, 0, 1) ** 0.5 * (spectral(n, 2.0, 123, lo=1, hi=6) > 0.55)
    h = base * 0.6 + pebbles * 0.4
    albedo = 0.75 + 0.2 * base + 0.12 * pebbles
    return h, albedo


def pat_grass(n):
    blades = spectral(n, 0.5, 131, lo=30, aniso=(1, 2.5))
    clumps = spectral(n, 1.8, 132, lo=1, hi=8)
    h = blades * 0.7 + clumps * 0.3
    albedo = 0.78 + 0.22 * (clumps * 0.6 + blades * 0.4)
    return h, albedo


def pat_paper(n):
    fibres = spectral(n, 0.6, 141, lo=10)
    ribs = np.sin(uv(n)[1] * np.pi * 2 * 12) * 0.5 + 0.5
    h = fibres * 0.5 + ribs * 0.5
    return h, 0.92 + 0.08 * fibres


def pat_gingham(n):
    x, y = uv(n)
    # woven cotton: 32 threads per check, over-under
    N = 64
    u, v = x * N, y * N
    fu, fv = u % 1, v % 1
    warp = np.sin(np.pi * fv) ** 0.6
    weft = np.sin(np.pi * fu) ** 0.6
    over = ((np.floor(u) + np.floor(v)) % 2).astype(bool)
    h = np.where(over, np.maximum(warp, weft * 0.5), np.maximum(weft, warp * 0.5)) * 0.8 + spectral(n, 0.6, 151, lo=6) * 0.2
    # two blue stripes per tile in each direction, with slightly soft, thread-stepped edges
    def stripe(t):
        k = (t * 2) % 1
        return np.clip((np.abs(k - 0.5) - 0.25) * -40 + 0.5, 0, 1)
    sx, sy = stripe(x), stripe(y)
    # vivid cornflower on warm cream: saturated enough to feel sunny, cool enough that warm fruit pops
    cream = np.array([1.0, 0.95, 0.85])
    single = np.array([0.66, 0.8, 0.97])
    double = np.array([0.4, 0.6, 0.92])
    both = (sx * sy)[..., None]
    one = np.clip(sx + sy - 2 * sx * sy, 0, 1)[..., None]
    col = cream * (1 - both - one) + single * one + double * both
    col = col * (0.93 + 0.07 * h[..., None]) * (0.97 + 0.03 * spectral(n, 1.4, 152, lo=1, hi=4)[..., None])
    return h, col


def _weave(n):
    x, y = uv(n)
    u, v = x * 64, y * 64
    fu, fv = u % 1, v % 1
    warp, weft = np.sin(np.pi * fv) ** 0.6, np.sin(np.pi * fu) ** 0.6
    over = ((np.floor(u) + np.floor(v)) % 2).astype(bool)
    return np.where(over, np.maximum(warp, weft * 0.5), np.maximum(weft, warp * 0.5)) * 0.8 + spectral(n, 0.6, 151, lo=6) * 0.2


def _band(t, count, lo, hi, soft=40):
    """1 inside [lo, hi) of every 1/count period (fractions of the period), with thread-stepped edges."""
    k = (t * count) % 1
    return np.clip(np.minimum((k - lo), (hi - k)) * soft + 0.5, 0, 1)


def blanket_albedo(n, style):
    """Shop blanket patterns on the gingham's tile layout (one tile = two 1.4-unit checks each way),
    so the game can swap the cloth's albedo without touching UVs. Returns RGB in [0, 1]."""
    x, y = uv(n)
    h = _weave(n)
    if style == 'cornflower':
        return pat_gingham(n)[1]
    if style == 'strawberry':
        sx, sy = _band(x, 2, 0.25, 0.75), _band(y, 2, 0.25, 0.75)
        cream, single, double = np.array([1.0, 0.96, 0.9]), np.array([0.96, 0.58, 0.56]), np.array([0.86, 0.18, 0.24])
        both = (sx * sy)[..., None]
        one = np.clip(sx + sy - 2 * sx * sy, 0, 1)[..., None]
        col = cream * (1 - both - one) + single * one + double * both
    elif style == 'meadow':
        # a sage tartan: wide green sett, cream overcheck and a thin butter-yellow pinstripe
        base = np.array([0.56, 0.74, 0.5])
        wide = np.maximum(_band(x, 2, 0.1, 0.45), _band(y, 2, 0.1, 0.45))[..., None]
        cross = (_band(x, 2, 0.1, 0.45) * _band(y, 2, 0.1, 0.45))[..., None]
        cream = np.maximum(_band(x, 2, 0.62, 0.7), _band(y, 2, 0.62, 0.7))[..., None]
        gold = np.maximum(_band(x, 2, 0.82, 0.85, 80), _band(y, 2, 0.82, 0.85, 80))[..., None]
        col = base * (1 - wide) + np.array([0.33, 0.56, 0.36]) * wide
        col = col * (1 - cross) + np.array([0.24, 0.45, 0.3]) * cross
        col = col * (1 - cream) + np.array([0.98, 0.95, 0.84]) * cream
        col = col * (1 - gold) + np.array([1.0, 0.84, 0.34]) * gold
    elif style == 'honey':
        # patchwork: four quilted patches per tile in honey, cream, marigold and apricot, stitched apart
        cx, cy = np.floor(x * 2).astype(int) % 2, np.floor(y * 2).astype(int) % 2
        patch = cx + 2 * cy
        palette = np.array([[0.98, 0.76, 0.3], [1.0, 0.93, 0.78], [1.0, 0.63, 0.34], [0.99, 0.84, 0.5]])
        col = palette[patch]
        fx, fy = (x * 2) % 1, (y * 2) % 1
        # a little daisy print on the cream patch
        dots = ((np.sin(fx * np.pi * 10) * np.sin(fy * np.pi * 10)) > 0.86) & (patch == 1)
        col = np.where(dots[..., None], np.array([0.97, 0.62, 0.3]), col)
        # diagonal quilting and the seams between patches
        quilt = (np.abs(((fx + fy) * 3) % 1 - 0.5) < 0.03) | (np.abs(((fx - fy) * 3) % 1 - 0.5) < 0.03)
        seam = (np.minimum(fx, 1 - fx) < 0.018) | (np.minimum(fy, 1 - fy) < 0.018)
        col = col * np.where(quilt[..., None], 0.9, 1.0) * np.where(seam[..., None], 0.72, 1.0)
    else:
        raise ValueError(style)
    return np.clip(col * (0.93 + 0.07 * h[..., None]) * (0.97 + 0.03 * spectral(n, 1.4, 152, lo=1, hi=4)[..., None]), 0, 1)


PATTERNS = {
    # key: (pattern, normal strength baked into the map)
    'linen': (pat_linen, 3.0), 'felt': (pat_felt, 2.2), 'knit': (pat_knit, 5.0), 'wood': (pat_wood, 2.5),
    'wicker': (pat_wicker, 6.0), 'skin': (pat_skin, 1.6), 'ceramic': (pat_ceramic, 1.2), 'leaf': (pat_leaf, 2.0),
    'canopy': (pat_canopy, 5.0), 'bark': (pat_bark, 5.0), 'stone': (pat_stone, 4.0), 'soil': (pat_soil, 4.0),
    'grass': (pat_grass, 2.5), 'paper': (pat_paper, 1.5), 'gingham': (pat_gingham, 1.4),
}


def _to_image(name, rgb, non_color, directory):
    n = rgb.shape[0]
    alpha = rgb.shape[-1] == 4
    img = bpy.data.images.get(name)
    if img is not None and img.size[0] != n:
        bpy.data.images.remove(img)
        img = None
    img = img or bpy.data.images.new(name, n, n, alpha=alpha)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    rgba = (rgb if alpha else np.concatenate([rgb, np.ones((n, n, 1))], -1)).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(directory, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def ensure(directory, size=SIZE, force=()):
    """Reuse detail textures already in this Blender session; generate missing ones (or `force`d keys)."""
    out = {}
    for key in PATTERNS:
        n = bpy.data.images.get(f'{key}_n')
        if n is None or key in force:
            out.update(generate(directory, size, keys=[key]))
        else:
            out[key] = {'n': n, 'a': bpy.data.images.get(f'{key}_a')}
    card = bpy.data.images.get('leafcard_a')
    if card is None or 'leafcard' in force:
        out.update(generate(directory, size, keys=['leafcard']))
    else:
        out['leafcard'] = {'n': None, 'a': card}
    return out


def generate(directory, size=SIZE, keys=None):
    """Generate detail textures; returns {key: {'n': image, 'a': image|None}}."""
    os.makedirs(directory, exist_ok=True)
    out = {}
    if not keys or 'leafcard' in keys:
        out['leafcard'] = {'n': None, 'a': _to_image('leafcard_a', leafcard(size), False, directory)}
    for key, (fn, strength) in PATTERNS.items():
        if keys and key not in keys:
            continue
        h, albedo = fn(size)
        normal = normal_from_height(h, strength)
        entry = {'n': _to_image(f'{key}_n', normal, True, directory), 'a': None}
        if albedo is not None:
            a = np.clip(albedo, 0, 1)
            # albedo detail is stored as display-referred grey; keep it near white so the
            # painted vertex colour stays in charge of hue and value.
            entry['a'] = _to_image(f'{key}_a', a if a.ndim == 3 else np.repeat(a[..., None], 3, -1), False, directory)
        out[key] = entry
    return out


# ----------------------------------------------------------------------------- materials
# Surface definitions shared by every asset. Colour comes from vertex paint.
SURFACES = {
    'glossy':    dict(rough=0.30, coat=0.55, coat_rough=0.12, detail='skin', tile=5, nstr=0.35),
    'fuzzy':     dict(rough=0.60, sheen=0.9, sheen_rough=0.35, sheen_color='#ffe3ea', detail='skin', tile=5, nstr=0.2),
    'bloom':     dict(rough=0.45, sheen=0.6, sheen_rough=0.4, sheen_color='#d9d6ff', coat=0.2, detail='skin', tile=6, nstr=0.15),
    'rind':      dict(rough=0.42, coat=0.3, coat_rough=0.3, detail='skin', tile=3, nstr=0.9),
    'waxy':      dict(rough=0.38, coat=0.35, coat_rough=0.2, detail='leaf', tile=4, nstr=0.35),
    'felt':      dict(rough=0.92, sheen=1.0, sheen_rough=0.45, sheen_color='#fff4e8', detail='felt', tile=4, nstr=0.55, albedo=True),
    'knit':      dict(rough=0.88, sheen=0.7, sheen_rough=0.5, sheen_color='#ffffff', detail='knit', tile=7, nstr=0.9, albedo=True),
    'eye':       dict(rough=0.06, coat=1.0, coat_rough=0.02),
    'nose':      dict(rough=0.25, coat=0.8, coat_rough=0.1),
    'wood':      dict(rough=0.52, coat=0.3, coat_rough=0.25, detail='wood', tile=2.2, nstr=0.45, albedo=True),
    'rawwood':   dict(rough=0.8, detail='wood', tile=2.2, nstr=0.7, albedo=True),
    'wicker':    dict(rough=0.72, detail='wicker', tile=3.2, nstr=1.0, albedo=True),
    'ceramic':   dict(rough=0.16, coat=1.0, coat_rough=0.04, detail='ceramic', tile=1.5, nstr=0.2),
    'linen':     dict(rough=0.93, sheen=0.55, sheen_rough=0.55, sheen_color='#fff8ee', detail='linen', tile=2.4, nstr=0.6, albedo=True),
    'foliage':   dict(rough=0.6, spec=0.35, sheen=0.25, sheen_rough=0.5, sheen_color='#e8ffcf', coat=0.2, coat_rough=0.3, detail='leaf', tile=3, nstr=0.3, albedo=True),
    'canopy':    dict(rough=0.85, spec=0.2, sheen=0.12, sheen_rough=0.6, sheen_color='#f1ffd8', detail='canopy', tile=0.8, nstr=0.35, albedo=True),
    'leaves':    dict(rough=0.88, spec=0.15, sheen=0.1, sheen_rough=0.6, sheen_color='#f4ffd9', card='leafcard'),
    'gingham':   dict(rough=0.92, sheen=0.5, sheen_rough=0.55, sheen_color='#fffaf0', detail='gingham', tile=1 / 2.8, nstr=0.5, albedo=True),
    'bark':      dict(rough=0.9, detail='bark', tile=1.4, nstr=1.0, albedo=True),
    'stone':     dict(rough=0.82, detail='stone', tile=0.9, nstr=0.8, albedo=True),
    'soil':      dict(rough=0.95, detail='soil', tile=0.55, nstr=1.0, albedo=True),
    'turf':      dict(rough=0.9, spec=0.25, sheen=0.3, sheen_rough=0.7, sheen_color='#e6ffc8', detail='grass', tile=0.45, nstr=0.6, albedo=True),
    'brass':     dict(base='#e3b865', rough=0.3, metal=1.0),
    'iron':      dict(base='#4a4540', rough=0.45, metal=0.85),
    'paper':     dict(rough=0.7, detail='paper', tile=2.5, nstr=0.35, albedo=True, emission='#ffc766', emission_strength=0.0),
    'glow':      dict(rough=0.5, emission='#ffe6a3', emission_strength=3.0),
    'candle':    dict(rough=0.5, emission='#ffb347', emission_strength=6.0),
    'mushroom':  dict(rough=0.55, coat=0.25, coat_rough=0.3, detail='skin', tile=3, nstr=0.2),
    'water':     dict(base='#6fa7b8', rough=0.05, coat=1.0, coat_rough=0.0),
}


class Library:
    def __init__(self, textures):
        self.textures = textures
        self.cache = {}

    def material(self, key):
        if key in self.cache:
            return self.cache[key]
        spec = SURFACES[key]
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        p = next(_n for _n in nt.nodes if _n.type == 'BSDF_PRINCIPLED')
        base = lin(spec.get('base', '#ffffff'))
        p.inputs['Roughness'].default_value = spec.get('rough', 0.5)
        p.inputs['Metallic'].default_value = spec.get('metal', 0.0)
        if 'spec' in spec:
            p.inputs['Specular IOR Level'].default_value = spec['spec']
        if spec.get('coat'):
            p.inputs['Coat Weight'].default_value = spec['coat']
            p.inputs['Coat Roughness'].default_value = spec.get('coat_rough', 0.1)
        if spec.get('sheen'):
            p.inputs['Sheen Weight'].default_value = spec['sheen']
            p.inputs['Sheen Roughness'].default_value = spec.get('sheen_rough', 0.5)
            p.inputs['Sheen Tint'].default_value = (*lin(spec.get('sheen_color', '#ffffff')), 1)
        if 'emission' in spec:
            p.inputs['Emission Color'].default_value = (*lin(spec['emission']), 1)
            p.inputs['Emission Strength'].default_value = spec.get('emission_strength', 1.0)

        # Base colour = [detail albedo] x factor x vertex paint (recognised by the glTF exporter).
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = (*base, 1)
        mapping = None
        detail = self.textures.get(spec.get('detail')) if spec.get('detail') else None
        if detail:
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'UVMap'
            mapping = nt.nodes.new('ShaderNodeMapping')
            t = spec.get('tile', 1.0)
            mapping.inputs['Scale'].default_value = (t, t, 1)
            nt.links.new(uvn.outputs['UV'], mapping.inputs['Vector'])
        first = rgb.outputs[0]
        if spec.get('card'):
            # alpha-cut sprig on authored UVs: glTF baseColorTexture x COLOR_0, alphaMode MASK
            ta = nt.nodes.new('ShaderNodeTexImage')
            ta.image = self.textures[spec['card']]['a']
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'UVMap'
            nt.links.new(uvn.outputs['UV'], ta.inputs['Vector'])
            m1 = nt.nodes.new('ShaderNodeMix')
            m1.data_type, m1.blend_type = 'RGBA', 'MULTIPLY'
            m1.inputs['Factor'].default_value = 1
            nt.links.new(ta.outputs['Color'], m1.inputs[6])
            nt.links.new(rgb.outputs[0], m1.inputs[7])
            first = m1.outputs[2]
            clip = nt.nodes.new('ShaderNodeMath')
            clip.operation = 'ROUND'
            nt.links.new(ta.outputs['Alpha'], clip.inputs[0])
            nt.links.new(clip.outputs[0], p.inputs['Alpha'])
            m.use_backface_culling = False
            # Blender flips shading normals on back faces, which paints half the sprigs dark; undo the
            # flip so both faces shade from the bent canopy normal (the game does the same in its shader).
            # glTF ignores this procedural normal and keeps the authored custom normals.
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            sign = nt.nodes.new('ShaderNodeMath')
            sign.operation = 'MULTIPLY_ADD'
            nt.links.new(geo.outputs['Backfacing'], sign.inputs[0])
            sign.inputs[1].default_value = -2.0
            sign.inputs[2].default_value = 1.0
            flip = nt.nodes.new('ShaderNodeVectorMath')
            flip.operation = 'SCALE'
            nt.links.new(geo.outputs['Normal'], flip.inputs[0])
            nt.links.new(sign.outputs[0], flip.inputs['Scale'])
            nt.links.new(flip.outputs[0], p.inputs['Normal'])
            try:
                m.surface_render_method = 'DITHERED'
            except (AttributeError, TypeError):
                pass
        if detail and spec.get('albedo') and detail['a'] is not None:
            ta = nt.nodes.new('ShaderNodeTexImage')
            ta.image = detail['a']
            nt.links.new(mapping.outputs['Vector'], ta.inputs['Vector'])
            m1 = nt.nodes.new('ShaderNodeMix')
            m1.data_type, m1.blend_type = 'RGBA', 'MULTIPLY'
            m1.inputs['Factor'].default_value = 1
            nt.links.new(ta.outputs['Color'], m1.inputs[6])
            nt.links.new(rgb.outputs[0], m1.inputs[7])
            first = m1.outputs[2]
        m2 = nt.nodes.new('ShaderNodeMix')
        m2.data_type, m2.blend_type = 'RGBA', 'MULTIPLY'
        m2.inputs['Factor'].default_value = 1
        nt.links.new(first, m2.inputs[6])
        nt.links.new(vc.outputs['Color'], m2.inputs[7])
        nt.links.new(m2.outputs[2], p.inputs['Base Color'])
        if detail:
            tn = nt.nodes.new('ShaderNodeTexImage')
            tn.image = detail['n']
            nt.links.new(mapping.outputs['Vector'], tn.inputs['Vector'])
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = spec.get('nstr', 1.0)
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
        m.diffuse_color = (*base, 1)
        self.cache[key] = m
        return m
