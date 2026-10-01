// Rendering: WebGL2 renderer, quality tiers, adaptive resolution and the post-processing chain
// (MSAA -> optional GTAO -> bloom -> tone mapping -> tilt-shift miniature focus + grade).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';

import {QUALITY, autoQuality} from './quality.js';
export {QUALITY, autoQuality};

const FinishShader = {
  uniforms: {
    tDiffuse: {value: null}, resolution: {value: new THREE.Vector2(1, 1)}, time: {value: 0},
    focus: {value: 0.55}, band: {value: 0.26}, blur: {value: 2.2},
    saturation: {value: 1.05}, contrast: {value: 1.04}, warmth: {value: 0.0}, vignette: {value: 0.25}, tint: {value: new THREE.Color('#ffffff')},
    grain: {value: 0.025}, fade: {value: 0.0},
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time, focus, band, blur, saturation, contrast, warmth, vignette, grain, fade; uniform vec3 tint;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      // Tilt-shift: a sharp horizontal band of focus, softening toward the top and bottom.
      float d = abs(vUv.y - focus);
      float amount = smoothstep(band, band + 0.3, d) * blur;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (amount > 0.05) {
        vec3 acc = col; float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996;
          float r = sqrt(float(i) + 0.5) / sqrt(12.0);
          vec2 o = vec2(cos(a), sin(a)) * r * amount / resolution;
          acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
        }
        col = acc / w;
      }
      // Grade: warmth, tint, saturation and contrast in display space.
      col *= tint;
      col.r *= 1.0 + warmth; col.b *= 1.0 - warmth;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      // Vignette and a whisper of film grain to break up gradients.
      vec2 v = vUv - 0.5; v.x *= resolution.x / resolution.y;
      col *= 1.0 - vignette * smoothstep(0.35, 1.05, length(v));
      col += (rand(vUv * resolution + time) - 0.5) * grain;
      col = mix(col, vec3(0.0), fade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas, {quality = 'high', preserve = false} = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: preserve});
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false; // count every pass of a frame, not just the last
    this.scale = 1; // adaptive resolution multiplier
    this.frameTimes = [];
    this.setQuality(quality);
  }

  setQuality(key) {
    this.qualityKey = QUALITY[key] ? key : 'high';
    this.quality = QUALITY[this.qualityKey];
    this.scale = 1;
    this.renderer.antialias = !this.quality.post;
    this.buildComposer();
  }

  buildComposer() {
    // EffectComposer owns its buffers, but each pass owns additional GPU resources.
    for (const pass of this.composer?.passes || []) pass.dispose?.();
    this.composer?.dispose();
    this.composer = this.finish = this.bloom = this.gtao = null;
    if (!this.quality.post || !this.scene) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {type: THREE.HalfFloatType, samples: this.quality.msaa});
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality.gtao) {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.updateGtaoMaterial({radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1, samples: 12});
      this.gtao.blendIntensity = 0.7;
      composer.addPass(this.gtao);
    } else this.gtao = null;
    if (this.quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.45, 0.88);
      composer.addPass(this.bloom);
    } else this.bloom = null;
    composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    composer.addPass(this.finish);
    this.composer = composer;
    this.applyGrade();
  }

  attach(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.buildComposer();
  }

  setGrade(grade, bloom) { this.grade = grade; this.bloomSettings = bloom; this.applyGrade(); }

  applyGrade() {
    const g = this.grade, u = this.finish?.uniforms;
    if (u && g) {
      u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.warmth.value = g.warmth; u.vignette.value = g.vignette;
      u.tint.value.copy(g.tint?.isColor ? g.tint : new THREE.Color(g.tint));
    }
    if (this.bloom && this.bloomSettings) [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = this.bloomSettings;
  }

  setFocus(y, band = 0.26, blur = 2.2) {
    if (!this.finish) return;
    this.finish.uniforms.focus.value = y; this.finish.uniforms.band.value = band; this.finish.uniforms.blur.value = blur * Math.min(1.5, this.pixelRatio);
  }

  setFade(v) { if (this.finish) this.finish.uniforms.fade.value = v; this.fadeValue = v; }

  get pixelRatio() { return Math.min(devicePixelRatio, this.quality.pixelRatio) * this.scale; }

  resize(width, height) {
    this.width = width; this.height = height;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(width, height);
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.finish.uniforms.resolution.value.set(size.x, size.y);
      this.gtao?.setSize(size.x, size.y);
    }
  }

  /** Watches frame time and lowers internal resolution when the device struggles. */
  adapt(dt) {
    if (document.hidden) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const before = this.scale;
    if (avg > 1 / 40 && this.scale > 0.6) this.scale = Math.max(0.6, this.scale - 0.1);
    else if (avg < 1 / 58 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    if (before !== this.scale && this.width) this.resize(this.width, this.height);
  }

  render(dt, time) {
    this.renderer.info.reset();
    if (this.composer) {
      this.finish.uniforms.time.value = time;
      this.composer.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  info() { return {...this.renderer.info.render, quality: this.qualityKey, scale: this.scale}; }
}
