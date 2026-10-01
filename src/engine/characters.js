// Toy friends: Blender-authored skinned characters with crossfaded clips, procedural blinking,
// head tracking and simple path walking.
import * as THREE from 'three';
import {approach, clamp} from './tween.js';

const ONE_SHOTS = new Set(['wave', 'eat', 'cheer', 'hop']);

export class Character {
  constructor(library, name) {
    this.name = name;
    const {root, clips} = library.friend(name);
    this.root = new THREE.Group();
    this.root.name = `friend-${name}`;
    this.model = root;
    this.root.add(root);
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    for (const [clip, anim] of clips) {
      const action = this.mixer.clipAction(anim);
      if (ONE_SHOTS.has(clip)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = false; }
      this.actions.set(clip, action);
    }
    this.bones = {};
    root.traverse(o => { if (o.isBone) this.bones[o.name.slice(name.length + 1)] = o; });
    this.state = 'idle';
    this.current = null;
    this.blinkTimer = 1 + Math.random() * 3; this.blink = 0;
    this.look = new THREE.Vector2(); this.lookTarget = null;
    this.path = null; this.speed = 1.3; this.facing = 0; this.heading = 0;
    this.mixer.addEventListener('finished', e => {
      if (this.current === e.action) this.play(this.path ? 'walk' : this.rest, 0.25);
    });
    this.rest = 'idle';
    this.play('idle', 0);
    this.mixer.setTime(Math.random() * 2);
  }

  play(clip, fade = 0.2) {
    const next = this.actions.get(clip);
    if (!next) return;
    if (this.current === next && !ONE_SHOTS.has(clip)) return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    else if (fade) next.fadeIn(fade);
    this.current = next;
    this.state = clip;
  }

  /** Walk through world-space points, then face `face` (radians) and call done(). */
  walk(points, {face, done, speed = 1.3} = {}) {
    this.path = points.map(p => p.clone());
    this.speed = speed; this.pathDone = done; this.pathFace = face;
    this.play('walk', 0.2);
  }

  place(position, face = 0) { this.root.position.copy(position); this.heading = face; this.root.rotation.y = face; this.path = null; }

  lookAt(worldPoint) { this.lookTarget = worldPoint ? worldPoint.clone() : null; }

  update(dt, quiet = false) {
    // path following
    if (this.path?.length) {
      const target = this.path[0], pos = this.root.position;
      const d = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
      const dist = d.length();
      if (dist < 0.05) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          if (this.pathFace !== undefined) this.faceTarget = this.pathFace;
          this.play(this.rest, 0.3);
          this.pathDone?.();
        }
      } else {
        const step = Math.min(dist, this.speed * dt);
        pos.addScaledVector(d.normalize(), step);
        this.faceTarget = Math.atan2(d.x, d.z);
      }
    }
    if (this.ground) this.root.position.y = this.ground(this.root.position.x, this.root.position.z);
    if (this.faceTarget !== undefined) {
      let diff = this.faceTarget - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 7);
      this.root.rotation.y = this.heading;
    }
    this.mixer.update(dt);

    // blink: squash the eye bone
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 0.16; this.blinkTimer = 2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.6 : 0); }
    const eyes = this.bones.eyes;
    if (eyes) {
      this.blink = Math.max(0, this.blink - dt);
      const k = this.blink > 0 ? Math.abs(Math.sin((this.blink / 0.16) * Math.PI)) : 0;
      eyes.scale.y = 1 - 0.9 * k;
    }

    // head tracking layered on top of the animation
    const head = this.bones.head;
    if (head && !quiet) {
      let yaw = 0, pitch = 0;
      if (this.lookTarget && !this.path) {
        const hp = head.getWorldPosition(new THREE.Vector3());
        const local = this.root.worldToLocal(this.lookTarget.clone()).sub(this.root.worldToLocal(hp.clone()));
        yaw = clamp(Math.atan2(local.x, local.z), -0.8, 0.8);
        pitch = clamp(Math.atan2(-local.y, Math.hypot(local.x, local.z)), -0.3, 0.45);
      }
      this.look.x = approach(this.look.x, yaw, dt, 0.12);
      this.look.y = approach(this.look.y, pitch, dt, 0.12);
      // bone local axes (Blender): X tips forward, Y turns; glTF keeps the bone frame
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.y, this.look.x, 0, 'YXZ'));
      head.quaternion.multiply(q);
    }
  }

  react(kind) {
    // one-shot reactions return to the resting loop automatically
    if (this.path) return;
    this.play(kind, 0.12);
  }

  setRest(clip) { this.rest = clip; if (!this.path && !ONE_SHOTS.has(this.state)) this.play(clip, 0.3); }
}
