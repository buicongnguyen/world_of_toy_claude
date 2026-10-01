// Camera rig: frames the play surface inside the HUD-free "safe" area of the screen, then adds
// cinematic moves (fly-ins, push-ins, orbits), a gentle idle drift and trauma-based shake.
import * as THREE from 'three';
import {clamp, ease, lerp} from './tween.js';

const tmp = new THREE.Vector3();

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 900);
    this.pitch = THREE.MathUtils.degToRad(52);
    this.yaw = 0;
    this.target = new THREE.Vector3();
    this.distance = 30;
    this.offset = new THREE.Vector2(); // view offset in pixels (lens shift)
    this.trauma = 0; this.time = 0; this.drift = 1;
    this.shot = null; // active cinematic {from, to, t, duration, curve}
    this.hold = null;
    this.parallax = new THREE.Vector2(); this.parallaxTarget = new THREE.Vector2();
  }

  /** Pose for gameplay: fit `points` (world) into `safe` rect {x,y,w,h} of a width x height viewport. */
  fit(points, width, height, safe, {pitch = 52, fov = 30, smooth = false} = {}) {
    const cam = this.camera, previous = smooth && this.current && !this.shot ? this.current : null;
    cam.fov = fov; cam.aspect = width / height; this.pitch = THREE.MathUtils.degToRad(pitch);
    const centre = points.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    this.target.copy(centre);
    this.width = width; this.height = height;
    let lo = 4, hi = 200;
    for (let i = 0; i < 24; i++) {
      const d = (lo + hi) / 2;
      const b = this.bounds(points, d, width, height);
      if (b.w <= safe.w && b.h <= safe.h) hi = d; else lo = d;
    }
    this.distance = hi;
    const b = this.bounds(points, hi, width, height);
    // shift the projection so the framed bounds sit in the centre of the safe rect
    this.offset.set((b.x + b.w / 2) - (safe.x + safe.w / 2), (b.y + b.h / 2) - (safe.y + safe.h / 2));
    this.base = this.pose();
    if (previous) { this.blend = {from: previous, t: 0}; this.apply(previous); } else this.apply(this.base);
    return this.base;
  }

  bounds(points, distance, width, height) {
    const cam = this.camera;
    this.place(cam, this.target, distance, this.yaw, this.pitch);
    cam.aspect = width / height; cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      tmp.copy(p).project(cam);
      const x = (tmp.x * 0.5 + 0.5) * width, y = (-tmp.y * 0.5 + 0.5) * height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
  }

  place(cam, target, distance, yaw, pitch) {
    cam.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    cam.lookAt(target);
  }

  pose() { return {target: this.target.clone(), distance: this.distance, yaw: this.yaw, pitch: this.pitch, fov: this.camera.fov, offset: this.offset.clone()}; }

  apply(p, extra = {}) {
    const cam = this.camera;
    cam.fov = p.fov;
    this.place(cam, p.target, p.distance, p.yaw + (extra.yaw || 0), p.pitch + (extra.pitch || 0));
    if (extra.shake) cam.position.add(extra.shake);
    if (this.width) cam.setViewOffset(this.width, this.height, p.offset.x, p.offset.y, this.width, this.height);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Blend from pose `from` to `to` over `duration` seconds. */
  move(from, to, duration, {curve = ease.inOutCubic, done, arc = 0} = {}) {
    this.shot = {from, to, t: 0, duration, curve, done, arc};
  }

  flyIn(duration = 3.2, done) {
    const to = this.base;
    const from = {...to, target: to.target.clone().add(new THREE.Vector3(0, 1.5, -4)), distance: to.distance * 1.9, yaw: to.yaw - 0.55, pitch: to.pitch + 0.2, fov: to.fov + 6, offset: to.offset.clone()};
    this.apply(from);
    this.move(from, to, duration, {done, curve: ease.outCubic, arc: 0.3});
  }

  pushTo(point, {distance = 0.55, duration = 1.4, pitch = -0.08, hold = 2.2, done} = {}) {
    const to = {...this.base, target: point.clone(), distance: this.base.distance * distance, pitch: this.base.pitch + pitch, offset: new THREE.Vector2()};
    const from = this.current || this.base;
    clearTimeout(this.hold);
    this.move(from, to, duration, {curve: ease.inOutCubic, done: () => {
      this.holdPose = to;
      this.hold = setTimeout(() => { this.holdPose = null; this.move(to, this.base, 1.6, {curve: ease.inOutCubic, done}); }, hold * 1000);
    }});
  }

  /** Dialogue framing: glide to a close shot on `point` (optionally from a yaw offset) and hold it
   *  until release(). Consecutive calls cut smoothly between speakers. */
  focus(point, {distance = 0.42, duration = 1.1, pitch = -0.16, yaw = 0} = {}) {
    if (!this.base) return;
    clearTimeout(this.hold);
    const to = {...this.base, target: point.clone(), distance: this.base.distance * distance, pitch: this.base.pitch + pitch, yaw: this.base.yaw + yaw, offset: new THREE.Vector2()};
    const from = this.current || this.base;
    this.holdPose = null;
    this.move(from, to, duration, {curve: ease.inOutCubic, done: () => { if (this.focused === to) this.holdPose = to; }});
    this.focused = to;
  }

  /** End a dialogue framing and glide back to the gameplay pose. */
  release({duration = 1.3} = {}) {
    if (!this.focused) return;
    const from = this.current || this.focused;
    this.focused = null; this.holdPose = null;
    this.move(from, this.base, duration, {curve: ease.inOutCubic});
  }

  /** Slowly sway around `pose` (default: the gameplay pose); blends in and out smoothly. */
  /** Abandon any cinematic move: snap (default) or glide back to the gameplay pose. */
  reset({glide = false} = {}) {
    clearTimeout(this.hold);
    this.shot = null; this.holdPose = null; this.focused = null;
    this.blend = glide && this.current ? {from: this.current, t: 0} : null;
    if (!glide && this.base) this.apply(this.base);
  }

  get busy() { return !!(this.shot || this.blend || this.holdPose); }

  orbit(on, pose = null) {
    if (on === this.orbiting && pose === this.orbitPose) return;
    if (this.current) this.blend = {from: this.current, t: 0};
    this.orbiting = on; this.orbitPose = pose;
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  pointer(nx, ny) { this.parallaxTarget.set(nx, ny); }

  update(dt, {quiet = false, dragging = false} = {}) {
    this.time += dt;
    let pose = this.base;
    if (!pose) return;
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(1, s.t + dt / s.duration);
      const k = s.curve(s.t);
      pose = {
        target: s.from.target.clone().lerp(s.to.target, k),
        distance: lerp(s.from.distance, s.to.distance, k),
        yaw: lerp(s.from.yaw, s.to.yaw, k) + Math.sin(k * Math.PI) * s.arc * 0.3,
        pitch: lerp(s.from.pitch, s.to.pitch, k),
        fov: lerp(s.from.fov, s.to.fov, k),
        offset: s.from.offset.clone().lerp(s.to.offset, k),
      };
      if (s.t >= 1) { this.shot = null; s.done?.(); }
    } else if (this.holdPose) {
      pose = this.holdPose;
    } else if (this.orbiting) {
      const b = this.orbitPose || this.base;
      pose = {...b, yaw: b.yaw + Math.sin(this.time * 0.07) * 0.35, distance: b.distance * 1.05, pitch: b.pitch - 0.05};
    }
    if (this.blend && !this.shot) {
      this.blend.t = Math.min(1, this.blend.t + dt / 1.4);
      const k = ease.inOutCubic(this.blend.t), f = this.blend.from;
      pose = {target: f.target.clone().lerp(pose.target, k), distance: lerp(f.distance, pose.distance, k), yaw: lerp(f.yaw, pose.yaw, k),
        pitch: lerp(f.pitch, pose.pitch, k), fov: lerp(f.fov, pose.fov, k), offset: f.offset.clone().lerp(pose.offset, k)};
      if (this.blend.t >= 1) this.blend = null;
    }
    this.current = pose;
    const extra = {};
    if (!quiet) {
      if (!dragging) this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 2));
      extra.yaw = Math.sin(this.time * 0.13) * 0.006 * this.drift + this.parallax.x * 0.012;
      extra.pitch = Math.sin(this.time * 0.11 + 1) * 0.004 * this.drift - this.parallax.y * 0.008;
      if (this.trauma > 0) {
        const s = this.trauma * this.trauma * 0.12;
        extra.shake = new THREE.Vector3(Math.sin(this.time * 47) * s, Math.sin(this.time * 53 + 1) * s, Math.sin(this.time * 41 + 2) * s * 0.5);
        this.trauma = Math.max(0, this.trauma - dt * 1.6);
      }
    } else this.trauma = 0;
    this.apply(pose, extra);
  }

  /** Screen-space vertical position (0 top .. 1 bottom) of a world point, for focus effects. */
  screenY(point) { tmp.copy(point).project(this.camera); return clamp(-tmp.y * 0.5 + 0.5); }
}
