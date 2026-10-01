// Particles: pooled additive sparkles (bursts, rings, embers, fireworks), GPU-animated
// fireflies and sun motes, and instanced paper confetti / drifting leaves.
import * as THREE from 'three';

const glowVertex = /* glsl */`
attribute float size; attribute float alpha; attribute vec3 tint; attribute float spin;
varying float vAlpha; varying vec3 vTint; varying float vSpin;
uniform float scale;
void main(){
  vAlpha = alpha; vTint = tint; vSpin = spin;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const glowFragment = /* glsl */`
varying float vAlpha; varying vec3 vTint; varying float vSpin;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  float core = exp(-r * r * 38.0);
  float halo = exp(-r * r * 9.0) * 0.45;
  // a soft four-point twinkle on some particles
  float c = cos(vSpin), s = sin(vSpin);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float star = max(0.0, 1.0 - abs(q.x) * 30.0) * max(0.0, 1.0 - abs(q.y) * 3.0) + max(0.0, 1.0 - abs(q.y) * 30.0) * max(0.0, 1.0 - abs(q.x) * 3.0);
  float a = (core + halo + star * 0.5 * step(0.5, fract(vSpin * 3.1))) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vTint * a, a);
}`;

export class Sparkles {
  constructor(max = 1600) {
    this.max = max; this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.spin = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.base = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('spin', new THREE.BufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {scale: {value: 300}}, vertexShader: glowVertex, fragmentShader: glowFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.budget = 1;
  }

  setViewport(height, pixelRatio) { this.material.uniforms.scale.value = height * pixelRatio * 0.9; }

  spawn(p, v, color, size, life, {gravity = -3, drag = 1.5, spin = Math.random() * 6.28} = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size; this.base[i] = size; this.life[i] = life; this.age[i] = 0; this.alpha[i] = 1;
    this.grav[i] = gravity; this.drag[i] = drag; this.spin[i] = spin;
  }

  /** Radial burst, e.g. a merge. intensity 1..3 scales count and speed. */
  burst(at, {color = '#ffd67a', count = 40, speed = 2.6, size = 0.28, life = 0.9, up = 1.4, gravity = -3.2, palette} = {}) {
    const n = Math.round(count * this.budget), c = new THREE.Color(), base = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random() * 0.8);
      const v = new THREE.Vector3(Math.cos(a) * s * e, up + Math.random() * s * 0.8, Math.sin(a) * s * e);
      c.copy(palette ? new THREE.Color(palette[k % palette.length]) : base).multiplyScalar(1.6 + Math.random() * 1.4);
      this.spawn(at, v, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), {gravity});
    }
  }

  /** A flat expanding ring of light on the cloth. */
  ring(at, {color = '#fff0b0', count = 36, radius = 0.2, speed = 3.2, size = 0.22, life = 0.55} = {}) {
    const n = Math.round(count * this.budget), c = new THREE.Color(color).multiplyScalar(2.2);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      const p = new THREE.Vector3(at.x + Math.cos(a) * radius, at.y, at.z + Math.sin(a) * radius);
      this.spawn(p, new THREE.Vector3(Math.cos(a) * speed, 0.2, Math.sin(a) * speed), c, size, life, {gravity: 0, drag: 4});
    }
  }

  /** Slowly rising motes (serving hearts of light, lantern sparks, campfire embers). */
  rise(at, {color = '#ffcf6b', count = 12, spread = 0.4, speed = 0.9, size = 0.2, life = 1.6} = {}) {
    const n = Math.max(1, Math.round(count * this.budget)), c = new THREE.Color(color).multiplyScalar(2);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Vector3(at.x + (Math.random() - 0.5) * spread, at.y + Math.random() * 0.2, at.z + (Math.random() - 0.5) * spread);
      this.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 0.3, speed * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.3), c, size * (0.6 + Math.random() * 0.6), life, {gravity: 0.2, drag: 0.6});
    }
  }

  firework(at, palette) {
    const hue = palette[Math.floor(Math.random() * palette.length)];
    this.burst(at, {color: hue, count: 90, speed: 5.5, size: 0.55, life: 1.8, up: 0, gravity: -1.2});
    this.burst(at, {color: '#fff6d8', count: 20, speed: 2, size: 0.4, life: 0.6, up: 0, gravity: -0.5});
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap-remove
        n--;
        if (i !== n) {
          for (const [arr, w] of [[this.pos, 3], [this.vel, 3], [this.col, 3]]) arr.copyWithin(i * w, n * w, n * w + w);
          for (const arr of [this.size, this.alpha, this.spin, this.life, this.age, this.grav, this.drag, this.base]) arr[i] = arr[n];
          i--;
        }
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.alpha[i] = Math.min(1, t * 12) * (1 - t) ** 1.4;
      this.size[i] = this.base[i] * (1 - t * 0.5);
      this.spin[i] += dt * 2;
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const name of ['position', 'tint', 'size', 'alpha', 'spin']) g.attributes[name].needsUpdate = true;
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------- fireflies & motes
const driftVertex = /* glsl */`
attribute vec4 seed; uniform float time, scale, intensity; uniform vec3 area, centre; uniform float blinkRate;
varying float vAlpha;
void main(){
  float t = time * (0.15 + seed.w * 0.25);
  vec3 p = centre + (seed.xyz - 0.5) * area;
  p.x += sin(t * 1.3 + seed.y * 20.0) * 0.8 + sin(t * 0.37 + seed.z * 9.0) * 1.6;
  p.z += cos(t * 1.1 + seed.x * 17.0) * 0.8 + cos(t * 0.29 + seed.y * 7.0) * 1.6;
  p.y += sin(t * 0.9 + seed.x * 13.0) * 0.35;
  float blink = blinkRate > 0.0 ? pow(0.5 + 0.5 * sin(time * blinkRate * (0.6 + seed.w) + seed.x * 50.0), 3.0) : 1.0;
  vAlpha = intensity * (0.25 + 0.75 * blink) * step(seed.w, intensity * 1.2 + 0.001);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.18 + seed.y * 0.12) * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const driftFragment = /* glsl */`
uniform vec3 color; varying float vAlpha;
void main(){
  vec2 p = gl_PointCoord - 0.5; float r = dot(p, p);
  float a = (exp(-r * 60.0) + exp(-r * 12.0) * 0.4) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(color * a, a);
}`;

export class Drift {
  constructor({count = 220, color = '#fff2a0', area = [24, 3, 18], centre = [0, 1.4, 0], blinkRate = 1.6} = {}) {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.uniforms = {
      time: {value: 0}, scale: {value: 300}, intensity: {value: 0}, area: {value: new THREE.Vector3(...area)}, centre: {value: new THREE.Vector3(...centre)},
      color: {value: new THREE.Color(color).multiplyScalar(2.2)}, blinkRate: {value: blinkRate},
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: driftVertex, fragmentShader: driftFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 4;
  }
  setViewport(height, pixelRatio) { this.uniforms.scale.value = height * pixelRatio * 0.9; }
  update(time, intensity) { this.uniforms.time.value = time; this.uniforms.intensity.value = intensity; this.points.visible = intensity > 0.01; }
}

// ---------------------------------------------------------------------------- confetti & leaves
export class Flutter {
  constructor(max = 360) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.12, 0.07, 2, 1);
    geo.translate(0, 0, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({side: THREE.DoubleSide, roughness: 0.7, metalness: 0.0}), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.frustumCulled = false;
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.budget = 1;
    this.leafShape = null;
  }

  confetti(at, {count = 120, palette = ['#ff6b8b', '#ffd166', '#6fd3c6', '#9a8cff', '#ffffff', '#ff9f5a'], spread = 1, speed = 5} = {}) {
    const n = Math.round(count * this.budget);
    for (let k = 0; k < n && this.items.length < this.max; k++) {
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        p: new THREE.Vector3(at.x + (Math.random() - .5) * spread, at.y, at.z + (Math.random() - .5) * spread),
        v: new THREE.Vector3(Math.cos(a) * speed * 0.35 * Math.random(), speed * (0.7 + Math.random() * 0.6), Math.sin(a) * speed * 0.35 * Math.random()),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3(Math.random() * 9 - 4.5, Math.random() * 9 - 4.5, Math.random() * 9 - 4.5),
        s: 0.8 + Math.random() * 0.7, life: 3.5 + Math.random() * 1.5, age: 0, color: new THREE.Color(palette[k % palette.length]), drag: 1.8, fall: -3.2, floor: 0.12,
      });
    }
  }

  /** Leaves or petals drifting down across the scene (ambient). */
  drift(area, palette, {size = 1.3} = {}) {
    if (this.items.length >= this.max) return;
    this.items.push({
      p: new THREE.Vector3(area.x + (Math.random() - .5) * area.w, area.y, area.z + (Math.random() - .5) * area.d),
      v: new THREE.Vector3(0.4 + Math.random() * 0.4, -0.35 - Math.random() * 0.2, (Math.random() - .5) * 0.2),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1),
      s: size * (0.8 + Math.random() * 0.5), life: 14, age: 0, color: new THREE.Color(palette[Math.floor(Math.random() * palette.length)]), drag: 0.2, fall: 0, floor: 0.06, sway: Math.random() * 6,
    });
  }

  update(dt, time) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age > it.life) { this.items.splice(i, 1); continue; }
      const k = Math.exp(-it.drag * dt);
      it.v.x *= k; it.v.z *= k; it.v.y = it.v.y * k + it.fall * dt;
      if (it.sway !== undefined) { it.v.x += Math.sin(time * 1.3 + it.sway) * 0.4 * dt; it.v.z += Math.cos(time * 0.9 + it.sway) * 0.3 * dt; }
      if (it.fall && it.v.y < -1.1) it.v.y = -1.1 + Math.sin(time * 5 + i) * 0.1; // paper flutters rather than drops
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < it.floor) { it.p.y = it.floor; it.v.set(0, 0, 0); it.w.multiplyScalar(0.9); }
      it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
      const fade = Math.min(1, (it.life - it.age) / 0.6);
      d.position.copy(it.p); d.rotation.copy(it.r); d.scale.setScalar(it.s * fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix); this.mesh.setColorAt(n, it.color); n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; }
}
