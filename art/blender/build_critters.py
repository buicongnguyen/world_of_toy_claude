"""Build the pond and meadow critters for the 3D clearing: two koi, a goldfish and a butterfly.

    npm run assets:critters       (headless: blender --background --factory-startup --python this file)

Outputs
  assets/lantern-picnic/critters.glb    one GLB, vertex colour on one shared material, every moving part hinged
  assets/lantern-picnic/critters.json   the report the game reads: length, top, hinges, triangles, draw calls
  art/blender/.cache/critters/          critters.blend (for budget checks) and previews at the game's pitch
Built with lightkit (art/blender/lightkit.py, from the lightweight-game-objects skill). The 2.5D stage draws the same
creatures as flat shapes, so only the 3D clearing downloads this file, and only after the clearing is on screen.
Palettes are saturated orange, gold and red: cream koi vanish against the teal pond at the size a phone shows them.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else os.path.join(os.getcwd(), 'art', 'blender')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lightkit as lk  # noqa: E402
from mathutils import Vector  # noqa: E402

RAD = math.radians
OUT = os.path.join(ROOT, 'assets', 'lantern-picnic')
CACHE = os.path.join(HERE, '.cache', 'critters')


def koi(cid, base, patch, fin_colour):
    c = lk.Critter(cid, 'small', wag=0.6)
    body_paint, patch_paint, fin = lk.paint(f'{cid} body', base), lk.paint(f'{cid} patch', patch), lk.paint(f'{cid} fin', fin_colour)
    white, black = lk.paint('eye white', '#FFFFFF'), lk.paint('eye black', '#121420')
    B = lk.Body(-0.34, 0.2,
                w=[(0, 0), (0.015, 0.02), (0.06, 0.042), (0.18, 0.066), (0.4, 0.075), (0.65, 0.06), (0.85, 0.034), (0.95, 0.024), (1, 0)],
                ht=[(0, 0), (0.015, 0.018), (0.06, 0.04), (0.2, 0.068), (0.42, 0.078), (0.66, 0.06), (0.86, 0.035), (0.95, 0.026), (1, 0)],
                hb=[(0, 0), (0.015, 0.016), (0.06, 0.034), (0.2, 0.054), (0.45, 0.06), (0.68, 0.046), (0.86, 0.028), (0.95, 0.021), (1, 0)],
                zc=[(0, -0.01), (0.3, 0.0), (1, 0.008)])

    def painter(t, th):                       # patches on the back, where a camera looking down sees them
        sn, cs = math.sin(th), math.cos(th)
        if 0.06 < t < 0.22 and sn > 0.3:
            return patch_paint
        if 0.33 < t < 0.56 and sn > -0.1 and cs > -0.6:
            return patch_paint
        if 0.68 < t < 0.8 and sn > 0.15 and cs < 0.55:
            return patch_paint
        return body_paint
    body = lk.body_loft(B, [0, 0.015, 0.06, 0.13, 0.22, 0.33, 0.44, 0.56, 0.68, 0.8, 0.95, 1], 12, painter)
    c.body.add(body)
    c.mass.append(body)
    for th in (RAD(26), math.pi - RAD(26)):
        pos, n = B.surface(0.1, th)
        c.body.add_all(lk.toy_eye(white, black, pos, n, 0.026))
    c.body.add(lk.ridge_fin(B, [(0.34, 0), (0.37, 0.05), (0.44, 0.054), (0.58, 0.034), (0.7, 0.02), (0.73, 0)]), fin)
    pec = [(0, -0.012), (0.035, 0.0), (0.06, 0.035), (0.045, 0.06), (0.0, 0.022)]
    pos, _ = B.surface(0.24, RAD(-10))
    right = lk.fin_xy(pec).transformed(lk.place(pos, roll=RAD(12)))
    c.body.add(right, fin)
    c.body.add(right.mirrored(), fin)
    hinge = B.centre(0.965)
    tail = c.part('tail', hinge)
    tail.add(lk.fin_yz([(0, 0.016), (0.06, 0.05), (0.16, 0.095), (0.12, 0.0), (0.16, -0.095), (0.06, -0.05), (0, -0.016)],
                       0.016).moved(hinge), fin)
    return c


def goldfish():
    c = lk.Critter('goldfish', 'small', wag=0.5)
    orange, gold, fin = lk.paint('goldfish orange', '#FF7A1A'), lk.paint('goldfish belly', '#FFD25A'), lk.paint('goldfish fin', '#FFB15A')
    white, black = lk.paint('eye white', '#FFFFFF'), lk.paint('eye black', '#121420')
    B = lk.Body(-0.2, 0.14,
                w=[(0, 0), (0.03, 0.03), (0.15, 0.065), (0.4, 0.08), (0.7, 0.055), (0.92, 0.025), (1, 0)],
                ht=[(0, 0), (0.03, 0.03), (0.2, 0.075), (0.45, 0.085), (0.75, 0.05), (0.92, 0.024), (1, 0)],
                hb=[(0, 0), (0.03, 0.026), (0.2, 0.06), (0.45, 0.07), (0.75, 0.04), (0.92, 0.02), (1, 0)])
    body = lk.body_loft(B, [0, 0.03, 0.1, 0.2, 0.32, 0.45, 0.6, 0.75, 0.88, 0.96, 1], 10,
                        lambda t, th: gold if math.sin(th) < -0.45 else orange)
    c.body.add(body)
    c.mass.append(body)
    for th in (RAD(22), math.pi - RAD(22)):
        pos, n = B.surface(0.13, th)
        c.body.add_all(lk.toy_eye(white, black, pos, n, 0.025))
    c.body.add(lk.ridge_fin(B, [(0.25, 0), (0.3, 0.07), (0.45, 0.075), (0.6, 0.04), (0.66, 0)]), fin)
    hinge = B.centre(0.95)
    tail = c.part('tail', hinge)
    tail.add(lk.fin_yz([(0, 0.018), (0.07, 0.07), (0.19, 0.115), (0.15, 0.035), (0.2, -0.04), (0.13, -0.1), (0.04, -0.05),
                        (0, -0.018)], 0.012).moved(hinge), fin)
    return c


def butterfly():
    """Wings hinged on the body's long axis; the game flaps them in opposite directions. The wing fill is white so
    each butterfly's instance colour paints it (pink, lemon, sky, apricot): one model, one draw per part."""
    c = lk.Critter('butterfly', 'small', wag=0.9)
    dark, fill, spot = lk.paint('wing edge', '#4A3466'), lk.paint('wing fill', '#FFFFFF'), lk.paint('wing spot', '#5A3A6E')
    B = lk.Body(-0.05, 0.05, w=[(0, 0), (0.15, 0.01), (0.5, 0.011), (0.85, 0.008), (1, 0)],
                ht=[(0, 0), (0.15, 0.01), (0.5, 0.011), (0.85, 0.008), (1, 0)])
    body = lk.body_loft(B, [0, 0.15, 0.5, 0.85, 1], 6, lambda t, th: dark)
    c.body.add(body)
    c.mass.append(body)
    outline = [(0.0, -0.03), (0.05, -0.075), (0.11, -0.07), (0.12, -0.02), (0.07, 0.005), (0.1, 0.035), (0.08, 0.07),
               (0.03, 0.06), (0.0, 0.03)]
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    inner = [(cx + (x - cx) * 0.74, cy + (y - cy) * 0.74) for x, y in outline]
    for side, name in ((1, 'wing_r'), (-1, 'wing_l')):
        hinge = Vector((0.01 * side, 0.0, 0.0))
        geo = [(lk.fin_xy(outline, 0.004), dark), (lk.fin_xy(inner, 0.004).moved((0, 0, 0.0025)), fill),
               (lk.fin_xy([(0.092 + 0.011 * math.cos(a), -0.048 + 0.011 * math.sin(a)) for a in [i * math.tau / 6 for i in range(6)]],
                          0.003).moved((0, 0, 0.004)), spot)]
        wing = c.part(name, hinge, axis='Y')
        for g, p in geo:
            g = g.moved(hinge)
            wing.add(g.mirrored() if side < 0 else g, p)
    return c


def main():
    os.makedirs(CACHE, exist_ok=True)
    lk.reset_scene()
    critters = [koi('koi_flame', '#FF6A1A', '#FFD23A', '#FFC48A'), koi('koi_gold', '#FFC21F', '#F0381A', '#FFE2A6'), goldfish(), butterfly()]
    report = lk.build_and_export(critters, os.path.join(OUT, 'critters.glb'), vertex_colours=True, glb_limit=80 * 1024)
    lk.save_blend(os.path.join(CACHE, 'critters.blend'))
    clean = lk.save_report(report, os.path.join(OUT, 'critters.json'))
    ppu = lk.preview(report, os.path.join(CACHE, 'preview.png'), pitch=54, background='#3f9aa8')
    lk.preview(report, os.path.join(CACHE, 'preview-swing.png'), pitch=54, background='#3f9aa8', swing=0.6)
    lk.shrink_png(os.path.join(CACHE, 'preview.png'), os.path.join(CACHE, 'preview-onscreen.png'), 70 / ppu, up=3)
    for cid, e in clean['critters'].items():
        print(f"{cid:12} {e['tris']:4} tris (budget {e['budget']})  {e['draws']} draws  {e['length']:.3f} long  top {e['top']:.3f}  parts {sorted(e['parts'])}")
    print(f"{clean['glb']}: {clean['glb_bytes']} bytes; problems: {clean['problems'] or 'none'}")
    if clean['problems']:
        raise SystemExit(1)


main()
