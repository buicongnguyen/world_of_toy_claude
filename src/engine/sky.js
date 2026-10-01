// Time of day: a procedural sky dome (gradient sky, sun and moon, stars, and a sea of clouds
// below the floating island), the lighting rig it implies, and smooth transitions between the
// five moods of the story.
import * as THREE from 'three';

const C = hex => new THREE.Color(hex);

// Each chapter of the story happens a little later in the same evening.
export const TIMES = {
  afternoon: {
    sun: [-0.45, 0.82, 0.35], sunColor: '#fff1dc', sunIntensity: 3.1, hemiSky: '#d6ecff', hemiGround: '#6f8b4e', hemiIntensity: 1.15,
    zenith: '#5aa3e0', horizon: '#cfe8f2', haze: '#d9edf3', deep: '#6ea9d8', cloudLit: '#ffffff', cloudShade: '#a9c4dc', glow: '#fff4d6',
    stars: 0, moon: 0, fog: '#d9ecef', exposure: 1.0, env: 0.9, bloom: [0.22, 0.4, 0.92],
    grade: {saturation: 1.08, contrast: 1.04, warmth: 0.02, vignette: 0.22, tint: '#fffaf2'},
    fireflies: 0, lanterns: 0.25, lights: 0, dust: 1,
  },
  golden: {
    sun: [-0.62, 0.36, 0.5], sunColor: '#ffcf8f', sunIntensity: 2.9, hemiSky: '#ffe2bd', hemiGround: '#6a7a45', hemiIntensity: 1.0,
    zenith: '#6f9ad0', horizon: '#ffd6a0', haze: '#ffe1bd', deep: '#9b9fc8', cloudLit: '#fff0d4', cloudShade: '#d2a896', glow: '#ffd08a',
    stars: 0, moon: 0, fog: '#f4dcbc', exposure: 1.0, env: 0.85, bloom: [0.32, 0.45, 0.88],
    grade: {saturation: 1.1, contrast: 1.05, warmth: 0.05, vignette: 0.26, tint: '#fff5e8'},
    fireflies: 0.15, lanterns: 0.45, lights: 0.15, dust: 1,
  },
  sunset: {
    sun: [-0.72, 0.16, 0.62], sunColor: '#ffb886', sunIntensity: 2.3, hemiSky: '#f2d2d0', hemiGround: '#5c6070', hemiIntensity: 1.0,
    zenith: '#4d5fa8', horizon: '#ff9f7c', haze: '#ffb49a', deep: '#7a5c9c', cloudLit: '#ffc49a', cloudShade: '#9a7aa0', glow: '#ff9a5e',
    stars: 0.08, moon: 0, fog: '#e8a894', exposure: 1.02, env: 0.75, bloom: [0.45, 0.5, 0.84],
    grade: {saturation: 1.06, contrast: 1.06, warmth: 0.05, vignette: 0.3, tint: '#fff2ec'},
    fireflies: 0.4, lanterns: 0.7, lights: 0.45, dust: 0.6,
  },
  dusk: {
    sun: [0.35, 0.72, -0.2], sunColor: '#a9b8ff', sunIntensity: 1.15, hemiSky: '#8f9ade', hemiGround: '#3c4150', hemiIntensity: 1.05,
    zenith: '#1d2658', horizon: '#b77aa6', haze: '#8c6f9a', deep: '#2e3068', cloudLit: '#c69ab8', cloudShade: '#4c4a78', glow: '#e6a0c4',
    stars: 0.55, moon: 0.4, fog: '#6d5f8c', exposure: 1.12, env: 0.6, bloom: [0.6, 0.5, 0.82],
    grade: {saturation: 1.05, contrast: 1.08, warmth: -0.02, vignette: 0.36, tint: '#eef0ff'},
    fireflies: 0.75, lanterns: 1, lights: 0.85, dust: 0,
  },
  night: {
    sun: [0.4, 0.8, -0.3], sunColor: '#9fb6ff', sunIntensity: 0.85, hemiSky: '#6f7fcf', hemiGround: '#28303f', hemiIntensity: 0.9,
    zenith: '#070c28', horizon: '#2d3a74', haze: '#343a6a', deep: '#0b1030', cloudLit: '#6e78b4', cloudShade: '#1c2046', glow: '#9fb3ff',
    stars: 1, moon: 1, fog: '#262b55', exposure: 1.2, env: 0.5, bloom: [0.72, 0.55, 0.8],
    grade: {saturation: 1.02, contrast: 1.1, warmth: -0.04, vignette: 0.42, tint: '#e6ecff'},
    fireflies: 1, lanterns: 1, lights: 1, dust: 0,
  },
};
export const CHAPTER_TIMES = ['afternoon', 'golden', 'sunset', 'dusk', 'night'];

function blend(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k];
    if (typeof x === 'number') out[k] = x + (y - x) * t;
    else if (typeof x === 'string') out[k] = C(x).lerp(C(y), t);
    else if (x?.isColor) out[k] = x.clone().lerp(y, t);
    else if (Array.isArray(x)) out[k] = x.map((v, i) => v + (y[i] - v) * t);
    else if (typeof x === 'object') out[k] = blend(x, y, t);
  }
  return out;
}
const resolve = p => blend(p, p, 0);

const skyVertex = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
  gl_Position = p.xyww;
}`;
const skyFragment = /* glsl */`
uniform vec3 zenith, horizon, haze, deep, cloudLit, cloudShade, glow, sunDir, moonDir;
uniform float stars, moon, time;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5453), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5453), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = .5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col;
  if (up >= 0.0) {
    col = mix(horizon, zenith, pow(smoothstep(0.0, 0.85, up), 0.55));
    // stars and a soft moon
    vec3 sp = floor(d * 380.0);
    float s = step(0.9965, hash(sp)) * stars * smoothstep(0.05, 0.4, up);
    s *= 0.6 + 0.4 * sin(time * 2.0 + hash(sp + 3.0) * 30.0);
    col += vec3(s) * 1.4;
    float m = smoothstep(0.9993, 0.9996, dot(d, moonDir)) * moon;
    col = mix(col, vec3(1.0, 0.97, 0.9) * 2.2, m);
    col += glow * pow(max(dot(d, moonDir), 0.0), 64.0) * moon * 0.35;
  } else {
    // looking down past the island: open sky deepening below, with a drifting sea of clouds
    float depth = smoothstep(0.0, -0.8, up);
    vec3 base = mix(haze, deep, depth);
    vec2 uv = d.xz / max(-up, 0.05) * 5.0;
    vec2 drift = vec2(time * 0.006, time * 0.0035);
    float c = fbm(uv * 0.11 + drift);
    float detail = fbm(uv * 0.45 - drift * 2.0);
    float puff = smoothstep(0.46, 0.74, c + detail * 0.16);
    float toward = dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4));
    vec3 cloud = mix(cloudShade, cloudLit, clamp(0.35 + (c - 0.45) * 2.2 + toward * 0.18, 0.0, 1.0));
    col = mix(base, cloud, puff * mix(0.92, 0.45, depth));
    col = mix(col, haze, smoothstep(-0.2, 0.0, up) * 0.8);
  }
  // sun glow around the horizon toward the sun
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += glow * (pow(sd, 8.0) * 0.35 + pow(sd, 90.0) * 0.8) * (1.0 - stars * 0.8);
  col += glow * pow(sd, 2400.0) * 6.0 * (1.0 - stars);
  gl_FragColor = vec4(col, 1.0);
}`;

export class TimeOfDay {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.current = resolve(TIMES.afternoon);
    this.from = this.current; this.to = this.current; this.t = 1; this.duration = 1; this.key = 'afternoon';
    this.uniforms = {
      zenith: {value: C('#fff')}, horizon: {value: C('#fff')}, haze: {value: C('#fff')}, deep: {value: C('#fff')}, cloudLit: {value: C('#fff')}, cloudShade: {value: C('#fff')},
      glow: {value: C('#fff')}, sunDir: {value: new THREE.Vector3(0, 1, 0)}, moonDir: {value: new THREE.Vector3(-0.5, 0.45, -0.75).normalize()},
      stars: {value: 0}, moon: {value: 0}, time: {value: 0},
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    dome.frustumCulled = false; dome.renderOrder = -10; this.dome = dome;
    scene.add(dome);
    // a separate scene holding only the dome, used to build the reflection environment
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(dome.geometry, dome.material);
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null; this.envAge = 99;

    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.sun.shadow.intensity = 0.72; // soft, storybook shadows that never blot out the play surface
    Object.assign(this.sun.shadow.camera, {left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 60});
    this.sunTarget = new THREE.Object3D(); scene.add(this.sunTarget); this.sun.target = this.sunTarget;
    this.hemi = new THREE.HemisphereLight('#fff', '#444', 1);
    this.rim = new THREE.DirectionalLight('#ffffff', 0.4);
    scene.add(this.sun, this.hemi, this.rim);
    scene.fog = new THREE.Fog('#ffffff', 40, 120);
    this.apply(this.current);
  }

  setShadowSize(size) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
  }

  /** Crossfade to a named time of day over `seconds` (0 = immediately). */
  go(key, seconds = 4) {
    if (!TIMES[key]) return;
    this.key = key;
    this.from = this.current; this.to = resolve(TIMES[key]);
    this.t = seconds > 0 ? 0 : 1; this.duration = Math.max(0.001, seconds);
    if (seconds <= 0) { this.current = this.to; this.apply(this.current); this.envAge = 99; }
  }

  get transitioning() { return this.t < 1; }

  update(dt, time) {
    this.uniforms.time.value = time;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const k = this.t * this.t * (3 - 2 * this.t);
      this.current = blend(this.from, this.to, k);
      this.apply(this.current);
    }
    this.envAge += dt;
    if (!this.envTarget || (this.t < 1 && this.envAge > 0.35) || this.envAge > 90) this.refreshEnvironment();
  }

  refreshEnvironment() {
    this.envAge = 0;
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.02, 1, 800);
    this.scene.environment = this.envTarget.texture;
    old?.dispose();
  }

  apply(p) {
    const u = this.uniforms;
    for (const k of ['zenith', 'horizon', 'haze', 'deep', 'cloudLit', 'cloudShade', 'glow']) u[k].value.copy(p[k]);
    u.stars.value = p.stars; u.moon.value = p.moon;
    const dir = new THREE.Vector3(...p.sun).normalize();
    u.sunDir.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(30);
    this.sun.color.copy(p.sunColor); this.sun.intensity = p.sunIntensity;
    this.hemi.color.copy(p.hemiSky); this.hemi.groundColor.copy(p.hemiGround); this.hemi.intensity = p.hemiIntensity;
    this.rim.position.set(-dir.x * 20, 8, -Math.abs(dir.z) * 20 - 10);
    this.rim.color.copy(p.glow); this.rim.intensity = 0.35 + p.stars * 0.25;
    this.scene.fog.color.copy(p.fog);
    this.scene.environmentIntensity = p.env;
    this.renderer.toneMappingExposure = p.exposure;
  }
}
