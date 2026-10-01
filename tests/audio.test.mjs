import test from 'node:test';
import assert from 'node:assert/strict';
import DefaultExport, { AudioEngine } from '../src/engine/audio.js';

const SFX = ['pick', 'drop', 'move', 'invalid', 'merge', 'serve', 'share', 'thread', 'skewerDone', 'basket', 'land', 'coin', 'star', 'undo', 'whoosh', 'ui', 'uiHover', 'open', 'close', 'firework', 'lanternLight', 'eat', 'cheer', 'footstep', 'splash'];
const STINGERS = ['lantern', 'celebrate', 'finale', 'chapter'];
const TIMES = ['afternoon', 'golden', 'sunset', 'dusk', 'night'];
const CHARACTERS = ['pip', 'momo', 'nori', 'juniper', 'bramble', 'stranger'];
const OPTS = { merge: [{ tier: 0, chain: 1, count: 2 }, { tier: 11, chain: 5, count: 4 }, { tier: 6, chain: 3, count: 3 }], thread: [{ slot: 1 }, { slot: 3 }], land: [{ size: 0 }, { size: 1 }], star: [{ index: 0 }, { index: 2 }], footstep: [{ size: 1 }] };

function exerciseEverything(engine) {
  engine.setEnabled(true);
  engine.setVolumes({ music: 0.5, sfx: 1, ambience: 0.2, voice: 0.9 });
  engine.setVolumes({ music: 7, sfx: -1, ambience: Number.NaN });
  engine.setVolumes();
  engine.setVolumes(null);
  for (const key of [...TIMES, 'bogus', undefined]) engine.setTimeOfDay(key, 2);
  for (const level of [0, 1, 2, 3, 4, 5, 99, -3, Number.NaN, '4']) engine.setIntensity(level);
  for (const name of [...SFX, 'nope', undefined, 42]) engine.play(name, OPTS[name]?.[0] ?? {});
  engine.play('merge', null);
  engine.play('merge', { tier: 'x', chain: Infinity, count: -1 });
  for (const name of [...STINGERS, 'nope']) engine.stinger(name);
  engine.duck();
  engine.duck(0.8, 3);
  engine.stopBabble();
  engine.setEnabled(false);
}

test('imports cleanly and exposes the engine class', () => {
  assert.equal(typeof AudioEngine, 'function');
  assert.equal(DefaultExport, AudioEngine);
  assert.equal(globalThis.AudioContext, undefined, 'Node has no Web Audio');
});

test('every public method is a safe no-op without Web Audio', async () => {
  for (const engine of [new AudioEngine(), new AudioEngine({ lowPower: true })]) {
    assert.equal(engine.available, false);
    const unlocked = engine.unlock();
    assert.ok(unlocked instanceof Promise);
    assert.equal(await unlocked, false);
    exerciseEverything(engine);
    const d = engine.babble('pip', 'Hello there! Want some berries?');
    assert.ok(Number.isFinite(d) && d > 0.5 && d < 5, `plausible duration, got ${d}`);
    assert.equal(engine.babble('momo', ''), 0);
    assert.equal(engine.babble('momo', ' ... !? '), 0);
    engine.dispose();
    engine.dispose();
    exerciseEverything(engine);
    assert.equal(await engine.unlock(), false);
  }
});

test('babble timing follows text length, rate and punctuation', () => {
  const e = new AudioEngine();
  const short = e.babble('nori', 'Hi'), long = e.babble('nori', 'Hello, would you like a lantern tonight');
  assert.ok(long > short * 5);
  const fast = e.babble('nori', 'Hello, would you like a lantern tonight', { rate: 2 });
  assert.ok(Math.abs(fast - long / 2) < 0.02, 'rate scales duration');
  assert.ok(e.babble('pip', 'a b. c') > e.babble('pip', 'a b c'), 'sentence ends pause');
  assert.ok(e.babble('juniper', 'hoo hoo') > e.babble('bramble', 'hoo hoo'), 'owl speaks slower than the hedgehog');
  assert.ok(e.babble('momo', '안녕하세요') > 0, 'Hangul gets one syllable per character');
  assert.ok(Number.isFinite(e.babble(undefined, null)));
});

// ── A strict fake of the Web Audio graph: it validates automation arguments and source lifecycles. ──

class FakeParam {
  constructor(value = 0) { this.value = value; }
  static check(...values) {
    for (const v of values) if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`non-finite automation argument ${v}`);
  }
  static time(t) {
    FakeParam.check(t);
    if (t < 0) throw new RangeError(`negative automation time ${t}`);
  }
  setValueAtTime(v, t) { FakeParam.check(v); FakeParam.time(t); return this; }
  linearRampToValueAtTime(v, t) { FakeParam.check(v); FakeParam.time(t); return this; }
  exponentialRampToValueAtTime(v, t) {
    FakeParam.check(v);
    if (v <= 0) throw new RangeError(`exponential ramp to ${v}`);
    FakeParam.time(t);
    return this;
  }
  setTargetAtTime(v, t, c) {
    FakeParam.check(v, c);
    if (c < 0) throw new RangeError('negative time constant');
    FakeParam.time(t);
    return this;
  }
  cancelScheduledValues(t) { FakeParam.time(t); return this; }
  cancelAndHoldAtTime(t) { FakeParam.time(t); return this; }
}

class FakeNode {
  constructor(ctx, params = {}) {
    this.context = ctx;
    ctx.created++;
    for (const [k, v] of Object.entries(params)) this[k] = new FakeParam(v);
  }
  connect(dest) {
    if (!(dest instanceof FakeNode || dest instanceof FakeParam)) throw new TypeError('connect() needs a node or param');
    return dest;
  }
  disconnect() {}
}

class FakeSource extends FakeNode {
  start(t = 0, offset = 0) {
    if (this.startTime !== undefined) throw new Error('InvalidStateError: start() called twice');
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(offset) || offset < 0) throw new RangeError('bad start()');
    this.startTime = t;
    this.context.live.add(this);
  }
  stop(t = 0) {
    if (this.startTime === undefined) throw new Error('InvalidStateError: stop() before start()');
    if (!Number.isFinite(t) || t < 0) throw new RangeError('bad stop()');
    this.stopTime = t;
  }
}

class FakeContext {
  constructor() {
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.state = 'suspended';
    this.created = 0;
    this.live = new Set();
    this.destination = new FakeNode(this);
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { return new FakeNode(this, { gain: 1 }); }
  createBiquadFilter() { return Object.assign(new FakeNode(this, { frequency: 350, Q: 1, gain: 0, detune: 0 }), { type: 'lowpass' }); }
  createStereoPanner() { return new FakeNode(this, { pan: 0 }); }
  createConvolver() { return Object.assign(new FakeNode(this), { buffer: null }); }
  createWaveShaper() { return Object.assign(new FakeNode(this), { curve: null, oversample: 'none' }); }
  createDynamicsCompressor() { return new FakeNode(this, { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
  createOscillator() {
    const o = new FakeSource(this, { frequency: 440, detune: 0 });
    o.type = 'sine';
    o.setPeriodicWave = (wave) => { if (!wave) throw new TypeError('missing PeriodicWave'); };
    return o;
  }
  createBufferSource() { return Object.assign(new FakeSource(this, { playbackRate: 1, detune: 0 }), { buffer: null, loop: false }); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
  }
  createPeriodicWave(real, imag) {
    if (real.length !== imag.length) throw new Error('real/imag length mismatch');
    return { real, imag };
  }
  advance(dt) {
    this.currentTime += dt;
    for (const s of this.live) {
      if (s.stopTime !== undefined && s.stopTime <= this.currentTime) {
        this.live.delete(s);
        s.onended?.();
      }
    }
  }
}

test('drives the whole engine against a strict fake Web Audio graph', async () => {
  const warnings = [], originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  globalThis.AudioContext = FakeContext;
  try {
    for (const lowPower of [false, true]) {
      const e = new AudioEngine({ lowPower });
      assert.equal(e.available, true);
      e.setTimeOfDay('golden', 0); // before unlock: applied instantly on build
      assert.equal(e.babble('pip', 'hi'), e.babble('pip', 'hi'));
      e.play('pick'); // before unlock: ignored
      assert.equal(await e.unlock(), true);
      assert.equal(await e.unlock(), true, 'idempotent');
      const ctx = e.ctx;
      for (const buf of [e.white, e.pink, e.crackle]) assert.ok(buf.getChannelData(0).every(Number.isFinite));
      const caps = Object.fromEntries(Object.entries(e.pools).map(([k, p]) => [k, p.cap]));
      const run = (seconds) => {
        for (let i = 0; i < Math.round(seconds / 0.025); i++) {
          ctx.advance(0.025);
          e._tick();
          for (const [k, pool] of Object.entries(e.pools)) assert.ok(pool.length <= caps[k], `${k} pool over cap`);
        }
      };
      run(3);
      assert.equal(e.music.root, 0, 'golden is in C');

      for (const key of TIMES) {
        e.setTimeOfDay(key, 3);
        for (let level = 0; level <= 5; level++) {
          e.setIntensity(level);
          run(3.5);
        }
      }
      assert.equal(e.music.root, 5, 'night is in F');

      for (const name of SFX) {
        for (const opts of OPTS[name] ?? [{}]) {
          const before = ctx.created;
          e.play(name, { ...opts, pan: 0.3 });
          assert.ok(ctx.created > before, `${name} made sound`);
          run(0.12);
        }
      }
      for (let i = 0; i < 20; i++) e.play('coin'); // a burst cascades instead of stacking
      for (let i = 0; i < 40; i++) e.play('merge', { tier: i % 12, chain: 1 + (i % 5), count: 2 + (i % 3) }); // voice cap stress
      run(1);
      const before = ctx.created;
      e.play('definitelyNotASound');
      e.stinger('nope');
      assert.equal(ctx.created, before, 'unknown names are ignored');
      for (const name of STINGERS) { e.stinger(name); run(1.5); }
      for (const who of CHARACTERS) {
        const d = e.babble(who, 'Hello! Is this your lantern? Yes, it is... thank you.');
        assert.ok(d > 1);
        run(0.4);
      }
      e.stopBabble();
      e.babble('momo', 'Right away!');
      e.duck(0.6, 1);
      e.duck(0.3, 0.5);
      run(3);

      e.setVolumes({ music: 0, ambience: 0 });
      run(3);
      e.setVolumes({ music: 0.8, ambience: 0.6 });
      e.setEnabled(false);
      await new Promise((r) => setTimeout(r, 600)); // lets the post-fade suspend fire
      assert.equal(ctx.state, 'suspended');
      const quiet = ctx.created;
      run(3);
      e.play('coin');
      assert.equal(ctx.created, quiet, 'nothing is scheduled while disabled');
      e.setEnabled(true);
      assert.equal(ctx.state, 'running');
      run(10);
      assert.ok(ctx.live.size < 400, `finished voices are released (live sources: ${ctx.live.size})`);

      e.dispose();
      assert.equal(ctx.state, 'closed');
      exerciseEverything(e);
    }
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
    delete globalThis.AudioContext;
  }
});
