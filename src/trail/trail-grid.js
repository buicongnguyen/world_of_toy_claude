// The Lantern Trail's walk grid: heights and walkable cells baked from the 3D islets, plus moving
// blockers (mist walls). Pure maths over typed arrays, so node tests can walk the whole map.

const decode64 = s => typeof atob === 'function'
  ? Uint8Array.from(atob(s), c => c.charCodeAt(0))
  : new Uint8Array(Buffer.from(s, 'base64'));

export class WalkGrid {
  /** `grid` is the manifest's {x0, z0, nx, nz, cell, walk, height} (walk/height base64 bytes). */
  constructor(grid) {
    Object.assign(this, {x0: grid.x0, z0: grid.z0, nx: grid.nx, nz: grid.nz, cell: grid.cell});
    this.base = decode64(grid.walk);
    this.heights = decode64(grid.height);
    this.walk = this.base.slice();
    this.blockers = new Map(); // id -> list of cell indices
    this.erode();
  }
  /** Cells where a body fits: walkable with their four neighbours walkable too. Paths are planned on these. */
  erode() {
    const nx = this.nx, nz = this.nz, w = this.walk, open = this.open = new Uint8Array(w.length);
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (w[k] && w[k - 1] && w[k + 1] && w[k - nx] && w[k + nx]) open[k] = 1;
    }
  }
  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
  centre(k) { return {x: this.x0 + (k % this.nx + 0.5) * this.cell, z: this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell}; }
  walkable(x, z) { const k = this.index(x, z); return k >= 0 && this.walk[k] === 1; }
  /** Lawn or deck height under (x, z), bilinear over neighbouring walkable cells. */
  heightAt(x, z) {
    const fx = (x - this.x0) / this.cell - 0.5, fz = (z - this.z0) / this.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    let sum = 0, w = 0;
    for (const [di, dj, k] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
      const c = jj * this.nx + ii;
      if (!this.heights[c]) continue; // no lawn or deck here (scenery footprints still have a lawn height)
      sum += (this.heights[c] / 32 - 2) * k; w += k;
    }
    return w > 0 ? sum / w : null;
  }
  /** Block (or with `on = false` free) every walkable cell within a capsule from a to b. */
  setBlocker(id, a, b, radius, on = true) {
    if (!on) {
      for (const k of this.blockers.get(id) || []) this.walk[k] = this.base[k];
      this.blockers.delete(id);
      this.rebuild();
      return;
    }
    if (this.blockers.has(id)) return;
    const cells = [], vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1;
    for (let k = 0; k < this.walk.length; k++) {
      if (!this.base[k]) continue;
      const p = this.centre(k), t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2));
      if (Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t) < radius) cells.push(k);
    }
    this.blockers.set(id, cells);
    this.rebuild();
  }
  rebuild() {
    this.walk = this.base.slice();
    for (const cells of this.blockers.values()) for (const k of cells) this.walk[k] = 0;
    this.erode();
  }
  /** Move a body of `radius` from (x, z) by (dx, dz), sliding along walls. Returns the new {x, z}. */
  move(x, z, dx, dz, radius = 0.22) {
    // already overlapping something (an old save, a teleport): any step onto walkable ground is allowed
    if (!this.clear(x, z, radius)) { const k = this.index(x + dx, z + dz); return k >= 0 && this.heights[k] ? {x: x + dx, z: z + dz} : {x, z}; } // lawn under scenery, never the sky
    const ok = (px, pz) => this.clear(px, pz, radius);
    if (ok(x + dx, z + dz)) return {x: x + dx, z: z + dz};
    if (Math.abs(dx) > 1e-6 && ok(x + dx, z)) return {x: x + dx, z};
    if (Math.abs(dz) > 1e-6 && ok(x, z + dz)) return {x, z: z + dz};
    // glance off a slanted edge: try the move turned 40 degrees either way, shortened
    const len = Math.hypot(dx, dz);
    for (const a of [0.7, -0.7]) {
      const c = Math.cos(a), s = Math.sin(a), mx = (dx * c - dz * s) * 0.7, mz = (dx * s + dz * c) * 0.7;
      if (len > 1e-6 && ok(x + mx, z + mz)) return {x: x + mx, z: z + mz};
    }
    return {x, z};
  }
  clear(x, z, r) {
    if (!this.walkable(x, z)) return false;
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]])
      if (!this.walkable(x + ox, z + oz)) return false;
    return true;
  }
  /** The walkable cell nearest to (x, z), searching outward up to `reach` units. */
  nearest(x, z, reach = 3) {
    const here = this.index(x, z);
    if (here >= 0 && this.open[here]) return {x, z};
    const steps = Math.ceil(reach / this.cell);
    let best = null, bd = Infinity;
    const i0 = Math.floor((x - this.x0) / this.cell), j0 = Math.floor((z - this.z0) / this.cell);
    for (let j = j0 - steps; j <= j0 + steps; j++) for (let i = i0 - steps; i <= i0 + steps; i++) {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      const k = j * this.nx + i;
      if (!this.open[k]) continue;
      const p = this.centre(k);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  /** A* over walkable cells (8-way, no corner cutting), returning a smoothed list of {x, z} or null. */
  path(from, to, maxNodes = 60000) {
    const goal = this.nearest(to.x, to.z), start = this.nearest(from.x, from.z, 1);
    if (!goal || !start) return null;
    const s = this.index(start.x, start.z), g = this.index(goal.x, goal.z), nx = this.nx;
    if (s === g) return [goal];
    const open = new MinHeap(), came = new Int32Array(this.walk.length).fill(-1), cost = new Float64Array(this.walk.length).fill(Infinity); // 64-bit: a float32 copy never equals the float64 sum, so cells would "improve" forever
    const gx = g % nx, gz = Math.floor(g / nx);
    const h = k => { const dx = Math.abs(k % nx - gx), dz = Math.abs(Math.floor(k / nx) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    cost[s] = 0; open.push(s, h(s));
    let seen = 0;
    while (open.size && seen++ < maxNodes) {
      const k = open.pop();
      if (k === g) break;
      const i = k % nx, j = Math.floor(k / nx);
      for (const [di, dj, c] of NEIGHBOURS) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= this.nz) continue;
        const n = jj * nx + ii;
        if (!this.open[n]) continue;
        if (di && dj && (!this.open[j * nx + ii] || !this.open[jj * nx + i])) continue;
        const nc = cost[k] + c;
        if (nc < cost[n]) { cost[n] = nc; came[n] = k; open.push(n, nc + h(n)); }
      }
    }
    if (came[g] < 0) return null;
    const cells = [];
    for (let k = g; k !== s; k = came[k]) cells.push(k);
    cells.reverse();
    // string-pull: keep only the corners a straight walk can't skip
    const pts = cells.map(k => this.centre(k)), out = [];
    let anchor = {x: from.x, z: from.z};
    for (let i = 0; i < pts.length; i++) {
      const next = pts[i + 1];
      if (next && this.sight(anchor, next)) continue;
      out.push(pts[i]); anchor = pts[i];
    }
    out[out.length - 1] = {x: goal.x, z: goal.z};
    return out;
  }
  /** True when a body can walk straight from a to b. */
  sight(a, b, radius = 0.2) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i <= n; i++) { const t = i / n; if (!this.clear(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false; }
    return true;
  }
}
const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

class MinHeap {
  constructor() { this.keys = []; this.pri = []; }
  get size() { return this.keys.length; }
  push(k, p) {
    const K = this.keys, P = this.pri; let i = K.length; K.push(k); P.push(p);
    while (i > 0) { const up = (i - 1) >> 1; if (P[up] <= P[i]) break; [K[up], K[i]] = [K[i], K[up]]; [P[up], P[i]] = [P[i], P[up]]; i = up; }
  }
  pop() {
    const K = this.keys, P = this.pri, top = K[0], lk = K.pop(), lp = P.pop();
    if (K.length) {
      K[0] = lk; P[0] = lp; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < K.length && P[l] < P[m]) m = l;
        if (r < K.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [P[m], P[i]] = [P[i], P[m]]; i = m;
      }
    }
    return top;
  }
}
