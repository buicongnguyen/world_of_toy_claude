// Motion helpers: easing curves, critically-damped springs and a tiny timeline.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ease = {
  outCubic: t => 1 - (1 - clamp(t)) ** 3,
  inCubic: t => clamp(t) ** 3,
  inOutCubic: t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; },
  outBack: (t, s = 1.70158) => { t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1; },
  outElastic: t => { t = clamp(t); return t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1; },
  inOutSine: t => -(Math.cos(Math.PI * clamp(t)) - 1) / 2,
};

/** Damped spring toward a target (per axis when given arrays). Frame-rate independent. */
export class Spring {
  constructor(value = 0, {stiffness = 180, damping = 18} = {}) {
    this.value = value; this.target = value; this.velocity = 0; this.stiffness = stiffness; this.damping = damping;
  }
  set(v) { this.value = this.target = v; this.velocity = 0; return this; }
  kick(impulse) { this.velocity += impulse; return this; }
  update(dt) {
    // Semi-implicit Euler in small substeps keeps stiff springs stable at low frame rates.
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Exponential approach, frame-rate independent: move `current` toward `target` with half-life. */
export const approach = (current, target, dt, halfLife = .08) => lerp(target, current, 2 ** (-dt / Math.max(1e-4, halfLife)));

/** A minimal scheduler for timed callbacks and tweens driven by the game clock. */
export class Timeline {
  constructor() { this.items = []; this.time = 0; }
  after(seconds, fn) { this.items.push({at: this.time + seconds, fn}); }
  tween(seconds, fn, {delay = 0, done} = {}) { this.items.push({start: this.time + delay, end: this.time + delay + seconds, fn, done}); }
  clear() { this.items.length = 0; }
  update(dt) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.fn && it.at !== undefined) { if (this.time >= it.at) { this.items.splice(i, 1); it.fn(); } continue; }
      if (this.time < it.start) continue;
      const t = clamp((this.time - it.start) / (it.end - it.start));
      it.fn(t);
      if (t >= 1) { this.items.splice(i, 1); it.done?.(); }
    }
  }
}

/** Deterministic PRNG so dressing is identical on every load. */
export function random(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}
