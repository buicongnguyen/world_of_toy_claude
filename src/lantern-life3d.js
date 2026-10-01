// The 3D clearing's drawer for lantern-life.js: the Blender critters (critters.glb, built by
// art/blender/build_critters.py with lightkit). Every species part is one InstancedMesh, so five koi
// and four butterflies cost nine draws; tails and wings turn on their hinges by one matrix each.
// Vertex colour on one flat Lambert material, no shadow casting, nothing allocated per frame.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FISH, WINGS, PondLife, Meadow} from './lantern-life.js';

const UP = new THREE.Vector3(0, 1, 0), AHEAD = new THREE.Vector3(0, 0, 1);
// the water's tint over the fish, by hour: teal by day, warmer at golden hour, deep blue after dark
const WET = {afternoon: '#c6ebe4', golden: '#e6dcbc', sunset: '#d9bfae', dusk: '#7e86ad', night: '#5a6690'};
/** A short fingerprint of a text (FNV-1a), for versioning a fixed file name. */
function fingerprint(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }

export class Life3D {
  constructor(world, {budget = 1} = {}) {
    this.world = world;
    this.pond = new PondLife({budget}); this.meadow = new Meadow({budget});
    this.group = new THREE.Group(); this.group.name = 'life';
    this.m = new THREE.Matrix4(); this.t = new THREE.Matrix4(); this.r = new THREE.Matrix4();
    this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.s = new THREE.Vector3();
  }

  /** Load critters.glb from the asset folder `base`. The GLB keeps a fixed name, so its report (critters.json,
   *  always revalidated) versions the request: a deploy never pairs new code with an older cached model. */
  async load(base) {
    const url = new URL('critters.glb', base);
    try { const r = await fetch(new URL('critters.json', base), {cache: 'no-cache'}); if (r.ok) url.searchParams.set('v', fingerprint(await r.text())); } catch { /* the plain URL then */ }
    const gltf = await new GLTFLoader().loadAsync(url.href);
    this.material = new THREE.MeshLambertMaterial({vertexColors: true});
    // The pond is a glaze lying on the turf, so nothing can swim beneath it. The fish swim at the surface instead,
    // pressed flat, tinted toward the water and drawn just after it: they read as under water with no second
    // pass, and the lily pads, a hair higher, still pass over them. Unlit (pressed flat, lit normals would turn
    // edge-on and dark); the hour's light comes from the tint instead.
    // It writes depth, and each fish swims a hair above the last, so two crossing koi overlap by depth.
    this.wet = new THREE.MeshBasicMaterial({vertexColors: true, color: WET.afternoon, transparent: true, opacity: 0.9});
    const node = name => { const o = gltf.scene.getObjectByName(name); if (!o?.isMesh) throw new Error(`critters.glb has no ${name}`); o.updateMatrix(); return o; };
    const instanced = (o, count, material = this.material) => {
      const mesh = new THREE.InstancedMesh(o.geometry, material, Math.max(1, count));
      if (material === this.wet) mesh.renderOrder = 2;
      mesh.count = count; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.name = o.name;
      this.group.add(mesh);
      return {mesh, local: o.matrix.clone()};
    };
    this.relayout();
    this.fish = FISH.map((sp, kind) => {
      const n = this.pond.fish.filter(f => f.kind === kind).length;
      return {body: instanced(node(`${sp.id}_body`), n, this.wet), tail: instanced(node(`${sp.id}_tail`), n, this.wet)};
    });
    // sized for the meadow's full count, so butterflies appear even if the flowers only arrive at a later relayout
    const n = this.meadow.count;
    this.butterfly = {body: instanced(node('butterfly_body'), n), right: instanced(node('butterfly_wing_r'), n), left: instanced(node('butterfly_wing_l'), n)};
    this.butterflyParts = [this.butterfly.body, this.butterfly.right, this.butterfly.left];
    const colour = new THREE.Color();
    for (let i = 0; i < n; i++) {
      colour.set(WINGS[i % WINGS.length]); // the meadow's colour for butterfly i
      this.butterfly.right.mesh.setColorAt(i, colour); this.butterfly.left.mesh.setColorAt(i, colour);
    }
    // rings on the water: a small pool, drawn only while one spreads
    const ring = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    this.rings = this.pond.ripples.map(() => {
      const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false}));
      r.renderOrder = 2; r.visible = false; this.group.add(r);
      return r;
    });
    return this;
  }

  /** Read the pond and the flowers again (the clearing rebuilds its dressing when the board's shape changes). */
  relayout() {
    const w = this.world, water = w.water;
    this.water = water;
    this.pond.setPond({x: water.position.x, y: water.position.y, z: water.position.z, rx: water.scale.x, rz: water.scale.z});
    const flowers = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const g of w.world.children) {
      if (!/^(flower_\w+|bush_flower)-instances$/.test(g.name)) continue;
      const mesh = g.children.find(o => o.isInstancedMesh);
      for (let i = 0; i < (mesh?.count ?? 0); i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); flowers.push({x: p.x, y: p.y, z: p.z}); }
    }
    this.meadow.setFlowers(flowers);
  }

  setHour(key) { this.meadow.setHour(key); this.wet?.color.set(WET[key] || WET.afternoon); }

  /** A tap on the screen: true when it landed on the water (fish scatter, a ring spreads). */
  tap(raycaster) {
    const plane = this.plane ??= new THREE.Plane(UP.clone(), 0);
    plane.constant = -this.pond.pond.y;
    const hit = raycaster.ray.intersectPlane(plane, this.p);
    return !!hit && this.pond.tap(hit.x, hit.z);
  }

  update(dt, quiet) {
    if (this.world.water !== this.water) this.relayout();
    this.pond.update(dt, quiet); this.meadow.update(dt, quiet);
    const {m, t, r, p, q, q2, s} = this, P = this.pond.pond, mobile = this.world.mobile;
    // fish
    const counts = this.counts ??= [0, 0, 0];
    counts[0] = counts[1] = counts[2] = 0;
    for (let j = 0; j < this.pond.fish.length; j++) {
      const f = this.pond.fish[j], sp = this.fish[f.kind], i = counts[f.kind]++;
      p.set(f.x, P.y + 0.002 + j * 0.0006, f.z);
      q.setFromAxisAngle(UP, Math.PI / 2 - f.heading + f.wag * 0.18); // the body yaws a little against the tail
      // a little broader (from above, a koi is its back) and pressed flat enough that its back stays under the
      // lily pads, which float only 0.013-0.018 above the water
      s.set(f.scale * 1.25, f.scale * 0.08, f.scale);
      m.compose(p, q, s);
      sp.body.mesh.setMatrixAt(i, t.multiplyMatrices(m, sp.body.local));
      sp.tail.mesh.setMatrixAt(i, t.multiplyMatrices(m, sp.tail.local).multiply(r.makeRotationY(-f.wag)));
    }
    for (let k = 0; k < this.fish.length; k++) { this.fish[k].body.mesh.instanceMatrix.needsUpdate = true; this.fish[k].tail.mesh.instanceMatrix.needsUpdate = true; }
    // butterflies: at dusk they climb away and are gone
    const B = this.butterfly, M = this.meadow, parts = this.butterflyParts, on = M.weight > 0.01 && M.list.length > 0;
    for (let k = 0; k < 3; k++) { parts[k].mesh.visible = on; parts[k].mesh.count = M.list.length; }
    if (on) {
      const away = 1 - M.weight, size = (mobile ? 1.8 : 1.25) * Math.min(1, M.weight * 3);
      for (let i = 0; i < M.list.length; i++) {
        const b = M.list[i];
        p.set(b.x, b.y + away * away * 3, b.z);
        q.setFromAxisAngle(UP, Math.PI / 2 - b.heading).multiply(q2.setFromAxisAngle(AHEAD, b.bank));
        s.setScalar(size);
        m.compose(p, q, s);
        const open = b.perch > 0 ? 0.55 + 0.45 * Math.abs(Math.cos(b.flap)) : 0.15 + 0.85 * Math.abs(Math.cos(b.flap)), fold = (1 - open) * 1.25;
        B.body.mesh.setMatrixAt(i, t.multiplyMatrices(m, B.body.local));
        B.right.mesh.setMatrixAt(i, t.multiplyMatrices(m, B.right.local).multiply(r.makeRotationZ(fold)));
        B.left.mesh.setMatrixAt(i, t.multiplyMatrices(m, B.left.local).multiply(r.makeRotationZ(-fold)));
      }
      for (let k = 0; k < 3; k++) parts[k].mesh.instanceMatrix.needsUpdate = true;
    }
    // rings
    for (let i = 0; i < this.rings.length; i++) {
      const rp = this.pond.ripples[i], ring = this.rings[i], k = rp.age / rp.life;
      ring.visible = k < 1;
      if (!ring.visible) continue;
      ring.position.set(rp.x, P.y + 0.012, rp.z);
      ring.scale.setScalar((0.06 + k * 0.42) * rp.size);
      ring.material.opacity = (1 - k) * (1 - k) * 0.7;
    }
  }

  info() {
    return {fish: this.pond.fish.map(f => ({kind: FISH[f.kind].id, x: +f.x.toFixed(3), z: +f.z.toFixed(3), state: f.state})), ripples: this.pond.ripples.filter(r => r.age < r.life).length,
      events: this.pond.events, butterflies: this.meadow.weight > 0.01 ? this.meadow.list.length : 0, weight: +this.meadow.weight.toFixed(2),
      draws: this.group.children.filter(o => o.visible).length};
  }
}
