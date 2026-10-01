"""Five toy friends: rigid-part felt toys with a shared skeleton layout and procedurally keyed
animation clips (idle, walk, wave, eat, cheer, hop, talk).

Every bone points +Z with zero roll, so all bones share local axes:
  X = world X  -> positive tips the top forward (limbs hanging below swing back)
  Y = world Z  -> positive turns toward the character's left (+X)
  Z = world -Y -> positive raises the character's left (+X) side
Characters face -Y (towards the camera once exported as glTF +Z).
"""
import math

import bpy
from mathutils import Vector

from .core import TAU, Asset, cone, cyl, grad, lin, mix, mottle, rig, smoothstep, solid, sphere, torus, tube
from .fruit import EYE, GLINT, Surface, stick_on

FPS = 30

SPECIES = {
    'pip': dict(fur=('#9e6541', '#c98b5c'), light='#f0d0a4', inner='#e59d86', scarf='#2f8f80', nose='#3a2620', ears='round',
                muzzle=True, tail='stub', blush=0.8),
    'momo': dict(fur=('#e9ddcf', '#f8f1e7'), light='#fffaf2', inner='#f3a3b6', scarf='#a57bc6', nose='#f08aa0', ears='long',
                 muzzle=False, tail='puff', blush=1.0),
    'nori': dict(fur=('#c95a26', '#ef8440'), light='#fff4e6', inner='#3e2a24', scarf='#e5b43f', nose='#231a18', ears='fox',
                 muzzle=True, tail='brush', blush=0.7),
    'juniper': dict(fur=('#6d5d52', '#9a8676'), light='#efe2cc', inner='#5a4a40', scarf='#3f6aa6', nose='#e89531', ears='tufts',
                    muzzle=False, tail='feathers', blush=0.5, owl=True),
    'bramble': dict(fur=('#e2bf93', '#f2d7b0'), light='#fbead0', inner='#e6a08a', scarf='#c9493f', nose='#2a1c18', ears='tiny',
                    muzzle=True, tail=None, blush=1.2, spines=('#4e3526', '#b58d68')),
}

CHEEK = '#ff8e9e'


def bones(c):
    return {
        f'{c}_root': ((0, 0, 0), None),
        f'{c}_body': ((0, 0, 0.3), f'{c}_root'),
        f'{c}_head': ((0, 0, 0.9), f'{c}_body'),
        f'{c}_eyes': ((0, -0.36, 1.2), f'{c}_head'),
        f'{c}_ear_L': ((0.26, 0.0, 1.5), f'{c}_head'),
        f'{c}_ear_R': ((-0.26, 0.0, 1.5), f'{c}_head'),
        f'{c}_arm_L': ((0.31, -0.01, 0.84), f'{c}_body'),
        f'{c}_arm_R': ((-0.31, -0.01, 0.84), f'{c}_body'),
        f'{c}_foot_L': ((0.18, -0.02, 0.26), f'{c}_root'),
        f'{c}_foot_R': ((-0.18, -0.02, 0.26), f'{c}_root'),
        f'{c}_tail': ((0, 0.26, 0.36), f'{c}_body'),
    }


def build_character(c, lib, collection):
    s = SPECIES[c]
    a = Asset(c, ao=0.35, ao_strength=0.85)
    B = lambda name: f'{c}_{name}'
    fur_lo, fur_hi = s['fur']
    fur = mottle(grad(fur_lo, fur_hi, 0.0, 1.7), 0.05, 4, seed=len(c))

    # --- body with a soft, painted belly patch (an oval on the front of the body)
    body = sphere((0.37, 0.31, 0.43), 40, 26)
    light = s['light']

    def belly(lp, wp):
        d = math.hypot(lp.x / 0.24, (lp.z + 0.03) / 0.3)
        k = smoothstep(1.0, 0.86, d) * smoothstep(0.02, -0.12, lp.y)
        base = fur(lp, wp)
        if s.get('owl'):
            v = (abs(lp.x) * 1.8 + lp.z * 3.2) % 0.5
            patch = mix(light, '#bba88d', smoothstep(0.36, 0.46, v) * 0.75)
        else:
            patch = light
        return mix(base, patch, k)
    a.add(body.xf(loc=(0, 0.01, 0.56)), 'felt', belly, B('body'))

    # --- head
    head = sphere((0.45, 0.39, 0.4), 40, 24).xf(loc=(0, -0.02, 1.22))
    a.add(head, 'felt', fur, B('head'))
    surf = Surface(head)
    eye_z, spread, eye_size = (1.24, 0.17, 1.0) if not s.get('owl') else (1.26, 0.19, 1.35)

    if s.get('owl'):
        # facial disc around each eye and a little beak; eyes are then projected onto the discs
        discs = []
        for side in (-1, 1):
            dp, dn = surf.front(side * 0.17, 1.24)
            disc = stick_on(sphere((0.19, 0.05, 0.18), 28, 14), dp, dn, 0.035)
            discs.append(disc)
            a.add(disc, 'felt', s['light'], B('head'))
        surf = Surface(head, *discs)
        bp, bn = surf.front(0, 1.13)
        beak = cone(0.055, 0.14, 12).xf(rot=(math.radians(90), 0, 0))
        a.add(stick_on(beak.xf(rot=(math.radians(-35), 0, 0)), bp, bn, -0.02), 'nose', s['nose'], B('head'))
    if s['muzzle']:
        mp, mn = surf.front(0, 1.1)
        snout = (0.2, 0.2, 0.14) if c == 'bramble' else (0.2, 0.14, 0.14)
        muzzle = sphere(snout, 28, 16)
        a.add(stick_on(muzzle, mp, mn, 0.07 if c != 'bramble' else 0.02), 'felt', s['light'], B('head'))
        surf_m = Surface(muzzle)
        np_, nn = surf_m.front(0, mp.z + 0.06)
        if np_ is not None:
            a.add(stick_on(sphere((0.055, 0.04, 0.042), 18, 10), np_, nn, 0.01), 'nose', s['nose'], B('head'))
            gp, gn = surf_m.front(-0.012, mp.z + 0.075)
            if gp is not None:
                a.add(stick_on(sphere((0.012, 0.01, 0.01), 8, 6), gp + gn * 0.035, gn, 0), 'eye', GLINT, B('head'))
        # tiny smile under the nose
        pts = []
        for t in (-1, -0.5, 0, 0.5, 1):
            q, qn = surf_m.front(t * 0.05, mp.z - 0.035 - (1 - t * t) * 0.02)
            if q is not None:
                pts.append(q + qn * 0.006)
        if len(pts) > 2:
            a.add(tube(pts, 0.009, 8, 14), 'eye', EYE, B('head'))
    elif not s.get('owl'):
        # bunny: small nose and a "w" mouth
        np_, nn = surf.front(0, 1.14)
        a.add(stick_on(sphere((0.045, 0.03, 0.032), 16, 8), np_, nn, 0.01), 'nose', s['nose'], B('head'))
        pts = []
        for t in (-1, -0.5, 0, 0.5, 1):
            q, qn = surf.front(t * 0.05, 1.09 - abs(t) * 0.0 - (1 - abs(abs(t) - 0.5) * 2) * 0.015)
            if q is not None:
                pts.append(q + qn * 0.005)
        a.add(tube(pts, 0.008, 8, 14), 'eye', EYE, B('head'))

    # --- eyes (own bone so the game can blink them)
    for side in (-1, 1):
        ep, en = surf.front(side * spread, eye_z)
        if s.get('owl'):
            ring = torus(0.075, 0.012, 24, 8).xf(rot=(math.radians(90), 0, 0))
            a.add(stick_on(ring, ep, en, -0.008), 'brass', '#ffffff', B('head'))
        a.add(stick_on(sphere((0.052 * eye_size, 0.03, 0.068 * eye_size), 18, 12), ep, en, 0.012), 'eye', EYE, B('eyes'))
        gp, gn = surf.front(side * spread - 0.018, eye_z + 0.03)
        a.add(stick_on(sphere((0.016, 0.01, 0.018), 10, 6), gp + gn * 0.02, gn, 0), 'eye', GLINT, B('eyes'))
        gp2, gn2 = surf.front(side * spread + 0.02, eye_z - 0.025)
        a.add(stick_on(sphere((0.007, 0.006, 0.008), 8, 6), gp2 + gn2 * 0.018, gn2, 0), 'eye', GLINT, B('eyes'))
        cp, cn = surf.front(side * 0.29, 1.1)
        if cp is not None:
            a.add(stick_on(sphere((0.07, 0.014, 0.04), 16, 8), cp, cn, 0.006), 'felt', mix(CHEEK, fur_hi, 1 - min(1, s['blush'])), B('head'))

    # --- ears
    for side, bone in ((1, B('ear_L')), (-1, B('ear_R'))):
        kind = s['ears']
        if kind == 'round':
            a.add(sphere((0.13, 0.08, 0.13), 20, 12).xf(loc=(side * 0.3, 0.02, 1.52)), 'felt', fur_hi, bone)
            a.add(sphere((0.075, 0.03, 0.08), 16, 8).xf(loc=(side * 0.3, -0.05, 1.52)), 'felt', s['inner'], bone)
        elif kind == 'long':
            ear = sphere((0.11, 0.07, 0.36), 24, 16).xf(loc=(side * 0.2, 0.02, 1.86), rot=(0, side * 0.14, 0))
            a.add(ear, 'felt', grad(fur_lo, fur_hi, -0.36, 0.36), bone)
            a.add(sphere((0.06, 0.03, 0.26), 16, 10).xf(loc=(side * 0.2, -0.05, 1.88), rot=(0, side * 0.14, 0)), 'felt', s['inner'], bone)
        elif kind == 'fox':
            ear = cone(0.15, 0.36, 24).xf(loc=(side * 0.25, 0.02, 1.43), rot=(0.08, side * 0.3, 0), scl=(1, 0.55, 1))
            a.add(ear, 'felt', grad(fur_hi, s['inner'], 0.22, 0.36), bone)
            a.add(cone(0.09, 0.24, 16).xf(loc=(side * 0.25, -0.03, 1.45), rot=(0.08, side * 0.3, 0), scl=(1, 0.35, 1)), 'felt', '#fff1e2', bone)
        elif kind == 'tufts':
            tuft = cone(0.08, 0.28, 16).xf(loc=(side * 0.27, 0.02, 1.5), rot=(0.1, side * 0.55, 0), scl=(1, 0.6, 1))
            a.add(tuft, 'felt', grad(fur_hi, fur_lo, 0.0, 0.28), bone)
        elif kind == 'tiny':
            a.add(sphere((0.08, 0.05, 0.075), 16, 10).xf(loc=(side * 0.3, 0.0, 1.47)), 'felt', fur_hi, bone)
            a.add(sphere((0.045, 0.02, 0.045), 12, 6).xf(loc=(side * 0.3, -0.04, 1.47)), 'felt', s['inner'], bone)

    # --- arms (wings for the owl), feet
    for side, arm, foot in ((1, B('arm_L'), B('foot_L')), (-1, B('arm_R'), B('foot_R'))):
        if s.get('owl'):
            wing = sphere((0.08, 0.2, 0.34), 24, 14).xf(loc=(side * 0.36, 0.05, 0.62), rot=(0.15, side * -0.25, 0))
            a.add(wing, 'felt', grad(fur_lo, fur_hi, -0.3, 0.3), arm)
            foot_geo = [sphere((0.05, 0.08, 0.045), 12, 8).xf(loc=(side * 0.17 + d * 0.06, -0.14, 0.045)) for d in (-1, 0, 1)]
            for g in foot_geo:
                a.add(g, 'nose', s['nose'], foot)
            a.add(sphere((0.1, 0.1, 0.1), 16, 10).xf(loc=(side * 0.17, -0.02, 0.14)), 'felt', fur_lo, foot)
        else:
            arm_geo = tube([(side * 0.31, -0.01, 0.82), (side * 0.38, -0.04, 0.64), (side * 0.41, -0.08, 0.5)], lambda t: 0.105 - 0.01 * t, 16, 14)
            a.add(arm_geo, 'felt', fur_hi if c != 'bramble' else s['fur'][0], arm)
            a.add(sphere((0.16, 0.21, 0.11), 24, 14).xf(loc=(side * 0.18, -0.1, 0.11)), 'felt', fur_lo, foot)
            a.add(sphere((0.09, 0.03, 0.06), 14, 8).xf(loc=(side * 0.18, -0.29, 0.1)), 'felt', s['light'], foot)

    # --- scarf, spectacles, tail, spines
    if not s.get('owl'):
        scarf = torus(0.33, 0.075, 40, 12).xf(loc=(0, -0.0, 0.93), scl=(1.0, 0.86, 1.0))
        a.add(scarf, 'knit', s['scarf'], B('body'))
        tail1 = tube([(0.14, -0.27, 0.92), (0.18, -0.33, 0.78), (0.2, -0.33, 0.62)], lambda t: 0.07 - 0.015 * t, 12, 12)
        a.add(tail1, 'knit', s['scarf'], B('body'))
        for k in range(3):
            fringe = tube([(0.16 + k * 0.03, -0.33, 0.6), (0.16 + k * 0.035, -0.34, 0.54)], 0.012, 6, 4)
            a.add(fringe, 'knit', s['scarf'], B('body'))
    else:
        # a jaunty bow tie and round spectacles for the storyteller
        for side in (-1, 1):
            a.add(sphere((0.09, 0.05, 0.06), 16, 8).xf(loc=(side * 0.08, -0.3, 0.93), rot=(0, side * 0.2, 0)), 'knit', s['scarf'], B('body'))
        a.add(sphere((0.035, 0.04, 0.035), 12, 8).xf(loc=(0, -0.32, 0.93)), 'knit', s['scarf'], B('body'))
        bridge_p, bridge_n = surf.front(0, eye_z + 0.02)
        a.add(tube([bridge_p + Vector((-0.09, -0.06, 0)), bridge_p + Vector((0, -0.075, 0.015)), bridge_p + Vector((0.09, -0.06, 0))], 0.01, 6, 8), 'brass', '#ffffff', B('head'))
    tail = s['tail']
    if tail == 'stub':
        a.add(sphere(0.09, 16, 10).xf(loc=(0, 0.3, 0.32)), 'felt', fur_lo, B('tail'))
    elif tail == 'puff':
        a.add(sphere(0.14, 20, 12).xf(loc=(0, 0.33, 0.3)), 'felt', s['light'], B('tail'))
    elif tail == 'brush':
        brush = tube([(0, 0.26, 0.3), (0.12, 0.52, 0.3), (0.3, 0.66, 0.55), (0.34, 0.6, 0.85)], lambda t: 0.1 + 0.12 * math.sin(math.pi * min(1, t * 1.25)) , 18, 26)
        brush.bake_local()
        a.add(brush, 'felt', lambda lp, wp: mix(fur_hi, '#fff4e6', smoothstep(0.66, 0.8, lp.z)), B('tail'))
    elif tail == 'feathers':
        for k in (-1, 0, 1):
            a.add(sphere((0.07, 0.16, 0.03), 14, 8).xf(loc=(k * 0.07, 0.32, 0.22), rot=(-0.5, 0, k * 0.3)), 'felt', fur_lo, B('tail'))
    if s.get('spines'):
        lo, hi = s['spines']
        # a dark spiny coat hugging the back of head and body, covered in swept-back quills
        for part, centre, radius, bone in (('head', Vector((0, 0.05, 1.26)), Vector((0.47, 0.38, 0.42)), B('head')),
                                           ('body', Vector((0, 0.07, 0.6)), Vector((0.39, 0.31, 0.44)), B('body'))):
            coat = sphere(radius, 36, 22).xf(loc=centre)
            coat.deform(lambda p, c=centre: p if p.y > c.y - 0.05 else Vector((p.x, c.y - 0.05 + (p.y - c.y + 0.05) * 0.15, p.z)))
            a.add(coat, 'felt', solid(lo), bone)
            n_quills = 120 if part == 'head' else 150
            for i in range(n_quills):
                u = (i + 0.5) / n_quills
                dz = 1 - 2 * u
                ang = i * 2.39996
                ring = math.sqrt(max(0.0, 1 - dz * dz))
                dirv = Vector((math.cos(ang) * ring, math.sin(ang) * ring, dz))
                if dirv.y < 0.1 or (part == 'head' and dz < -0.55) or (part == 'body' and dz > 0.75):
                    continue
                base = centre + Vector((dirv.x * radius.x, dirv.y * radius.y, dirv.z * radius.z)) * 0.97
                out = (dirv + Vector((0, 0.9, 0.35 if part == 'head' else 0.1))).normalized()
                quill = cone(0.042, 0.19, 8)
                q = Vector((0, 0, 1)).rotation_difference(out)
                m = q.to_matrix().to_4x4()
                m.translation = base
                a.add(quill.matrix(m), 'felt', grad(lo, hi, 0.02, 0.19), bone)

    obj = a.build(lib, collection)
    obj.name = c + '_mesh'
    obj.data.name = c + '_mesh'
    ao = rig(obj, c, bones(c), collection)
    make_actions(ao, c, s)
    return ao


# ----------------------------------------------------------------------------- animation
D = math.radians


def _pose(bones_, c):
    return {b: {'r': [0.0, 0.0, 0.0], 'l': [0.0, 0.0, 0.0], 's': [1.0, 1.0, 1.0]} for b in bones_}


def _ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def clip_idle(t, c, s, P):
    w = t / 2.4 * TAU
    P['body']['l'][2] = 0.012 * math.sin(w * 2)
    P['body']['r'][2] = D(1.6) * math.sin(w)
    P['head']['r'][0] = D(2.5) * math.sin(w + 1)
    P['head']['r'][1] = D(6) * math.sin(w * 0.5)
    P['head']['r'][2] = D(-2) * math.sin(w)
    for side, k in (('L', 1), ('R', -1)):
        P['arm_' + side]['r'][2] = k * D(4 + 2 * math.sin(w * 2 + k))
        floppy = 8 if s['ears'] == 'long' else 4
        P['ear_' + side]['r'][2] = k * D(floppy * math.sin(w + 0.6 * k))
    P['tail']['r'][1] = D(12) * math.sin(w * 1.5)


def clip_walk(t, c, s, P):
    w = t / 0.8 * TAU
    P['root']['l'][2] = 0.045 * abs(math.sin(w))
    P['root']['r'][2] = D(6) * math.sin(w)
    P['body']['r'][0] = D(4)
    P['head']['r'][2] = D(-3.5) * math.sin(w)
    P['head']['r'][0] = D(-2) + D(2) * math.sin(w * 2)
    P['foot_L']['r'][0] = D(-24) * math.sin(w)
    P['foot_R']['r'][0] = D(24) * math.sin(w)
    P['foot_L']['l'][2] = 0.05 * max(0.0, math.sin(w))
    P['foot_R']['l'][2] = 0.05 * max(0.0, -math.sin(w))
    P['arm_L']['r'][0] = D(22) * math.sin(w)
    P['arm_R']['r'][0] = D(-22) * math.sin(w)
    P['arm_L']['r'][2] = D(8)
    P['arm_R']['r'][2] = D(-8)
    for side, k in (('L', 1), ('R', -1)):
        P['ear_' + side]['r'][0] = D(6) * math.sin(w * 2 + 0.8)
        P['ear_' + side]['r'][2] = k * D(3)
    P['tail']['r'][1] = D(18) * math.sin(w)


def clip_wave(t, c, s, P):
    clip_idle(t, c, s, P)
    up = _ease(t / 0.3) * (1 - _ease((t - 1.35) / 0.3))
    P['arm_R']['r'][2] = -D(150) * up
    P['arm_R']['r'][0] = -D(10) * up
    P['arm_R']['r'][1] = D(35) * math.sin((t - 0.3) * TAU * 1.6) * up
    P['head']['r'][2] = D(-9) * up
    P['head']['r'][0] = D(-4) * up
    P['body']['r'][2] = D(4) * up
    P['ear_L']['r'][2] += D(6) * up
    P['ear_R']['r'][2] -= D(6) * up


def clip_eat(t, c, s, P):
    clip_idle(t, c, s, P)
    k = _ease(t / 0.2) * (1 - _ease((t - 1.0) / 0.2))
    nib = max(0.0, math.sin((t - 0.15) * TAU * 2.5))
    P['arm_L']['r'][0] = -D(62) * k
    P['arm_R']['r'][0] = -D(62) * k
    P['arm_L']['r'][2] = -D(14) * k
    P['arm_R']['r'][2] = D(14) * k
    P['head']['r'][0] = D(10) * k + D(8) * nib * k
    P['body']['l'][2] = -0.02 * nib * k
    P['eyes']['s'][1] = 1.0


def clip_cheer(t, c, s, P):
    # anticipation, leap, land squash, settle
    crouch = _ease(t / 0.18) * (1 - _ease((t - 0.18) / 0.12))
    air = max(0.0, math.sin(min(1.0, max(0.0, (t - 0.25) / 0.55)) * math.pi))
    land = _ease((t - 0.8) / 0.06) * (1 - _ease((t - 0.9) / 0.25))
    P['root']['l'][2] = -0.06 * crouch + 0.42 * air - 0.03 * land
    sq = 0.08 * crouch + 0.1 * land - 0.06 * air
    P['root']['s'] = [1 + sq, 1 + sq, 1 - sq]
    arms = _ease((t - 0.15) / 0.2) * (1 - _ease((t - 1.1) / 0.3))
    P['arm_L']['r'][2] = D(155) * arms
    P['arm_R']['r'][2] = -D(155) * arms
    P['arm_L']['r'][1] = D(20) * math.sin(t * 18) * arms
    P['arm_R']['r'][1] = -D(20) * math.sin(t * 18) * arms
    P['foot_L']['r'][0] = -D(25) * air
    P['foot_R']['r'][0] = -D(25) * air
    P['head']['r'][0] = -D(12) * air
    for side, k in (('L', 1), ('R', -1)):
        P['ear_' + side]['r'][2] = k * D(-14 * air + 10 * land)
    P['tail']['r'][1] = D(30) * math.sin(t * 16)


def clip_hop(t, c, s, P):
    clip_idle(t, c, s, P)
    air = max(0.0, math.sin(min(1.0, max(0.0, (t - 0.08) / 0.4)) * math.pi))
    land = _ease((t - 0.48) / 0.04) * (1 - _ease((t - 0.52) / 0.12))
    P['root']['l'][2] = 0.16 * air
    sq = 0.07 * land - 0.04 * air
    P['root']['s'] = [1 + sq, 1 + sq, 1 - sq]
    P['arm_L']['r'][2] = D(40) * air
    P['arm_R']['r'][2] = -D(40) * air


def clip_talk(t, c, s, P):
    clip_idle(t, c, s, P)
    w = t / 2.0 * TAU
    P['head']['r'][0] += D(4) * math.sin(w * 3)
    P['head']['r'][1] += D(8) * math.sin(w)
    P['arm_L']['r'][0] = -D(28) - D(16) * math.sin(w * 2)
    P['arm_L']['r'][2] = D(18) + D(8) * math.sin(w * 2 + 1)
    P['body']['r'][1] = D(5) * math.sin(w)


CLIPS = {
    # name: (function, duration seconds, loops)
    'idle': (clip_idle, 2.4, True),
    'walk': (clip_walk, 0.8, True),
    'wave': (clip_wave, 1.8, False),
    'eat': (clip_eat, 1.2, False),
    'cheer': (clip_cheer, 1.5, False),
    'hop': (clip_hop, 0.64, False),
    'talk': (clip_talk, 2.0, True),
}


def make_actions(ao, c, s):
    ao.animation_data_create()
    names = [b.name for b in ao.pose.bones]
    short = {n: n[len(c) + 1:] for n in names}
    for clip, (fn, duration, loops) in CLIPS.items():
        act = bpy.data.actions.new(f'{c}_{clip}')
        act.use_fake_user = True
        ao.animation_data.action = act
        frames = max(2, round(duration * FPS))
        step = 2
        for f in list(range(0, frames, step)) + [frames]:
            t = f / FPS if not (loops and f == frames) else 0.0
            P = _pose(short.values(), c)
            fn(t, c, s, P)
            for n in names:
                pb = ao.pose.bones[n]
                v = P[short[n]]
                pb.rotation_euler = v['r']
                pb.location = v['l']
                pb.scale = v['s']
                pb.keyframe_insert('rotation_euler', frame=f)
                pb.keyframe_insert('location', frame=f)
                pb.keyframe_insert('scale', frame=f)
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, frames
        act['loop'] = loops
        track = ao.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 0, act)
        track.mute = True
        ao.animation_data.action = None
    for pb in ao.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


NAMES = ['pip', 'momo', 'nori', 'juniper', 'bramble']


def build(lib, collection, names=NAMES):
    return [build_character(c, lib, collection) for c in names]
