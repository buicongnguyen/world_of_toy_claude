// Living foliage: instanced grass blades and a wind-sway patch for Blender foliage materials.
import * as THREE from 'three';
import {random} from './tween.js';

export const wind = {time: {value: 0}, strength: {value: 1}};

/** Patch a (cloned) material so vertices sway with the shared wind, more the higher they sit.
 *  `height` is the object-space height at which sway reaches full strength. */
export function windify(material, {height = 3, amount = 0.12, frequency = 1.4} = {}) {
  const m = material.clone();
  const cards = m.name === 'leaves';
  m.onBeforeCompile = shader => {
    shader.uniforms.windTime = wind.time;
    shader.uniforms.windStrength = wind.strength;
    // Leaf cards carry canopy-volume normals authored in Blender: shade both faces from them
    // instead of flipping for the back face, which would paint half the sprigs dark.
    if (cards) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float windTime; uniform float windStrength;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 anchor = vec3(0.0);
          #ifdef USE_INSTANCING
            anchor = instanceMatrix[3].xyz;
          #endif
          vec4 worldAnchor = modelMatrix * vec4(anchor, 1.0);
          float phase = worldAnchor.x * 0.37 + worldAnchor.z * 0.23;
          float k = pow(clamp(position.y / ${height.toFixed(2)}, 0.0, 1.2), 2.0) * ${amount.toFixed(3)} * windStrength;
          transformed.x += (sin(windTime * ${frequency.toFixed(2)} + phase) + 0.4 * sin(windTime * ${(frequency * 2.3).toFixed(2)} + phase * 1.7)) * k;
          transformed.z += cos(windTime * ${(frequency * 0.8).toFixed(2)} + phase * 1.3) * k * 0.6;
        }`);
  };
  m.customProgramCacheKey = () => `wind-${height}-${amount}-${frequency}-${cards}`;
  return m;
}

/** Grass blades scattered over the island top, avoiding the cloth and props. */
export class Grass {
  constructor({count = 6000, inside, avoid, seed = 7, heightScale = 1}) {
    const blade = new THREE.BufferGeometry();
    // a tapered, slightly curved blade: 4 segments
    const seg = 4, verts = [], idx = [], ys = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, w = 0.045 * (1 - t) ** 0.9;
      verts.push(-w, t, 0.03 * t * t, w, t, 0.03 * t * t);
      ys.push(t, t);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(verts.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setAttribute('h', new THREE.Float32BufferAttribute(ys, 1));
    blade.setIndex(idx);

    const material = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide});
    material.onBeforeCompile = shader => {
      shader.uniforms.windTime = wind.time; shader.uniforms.windStrength = wind.strength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float h; varying float vH; uniform float windTime; uniform float windStrength;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = h;
          vec3 base = instanceMatrix[3].xyz;
          float phase = base.x * 0.45 + base.z * 0.31;
          float gust = sin(windTime * 0.6 + base.x * 0.08) * 0.5 + 0.5;
          float bend = (sin(windTime * 2.1 + phase) * 0.6 + gust * 0.8) * windStrength * h * h;
          transformed.x += bend * 0.18; transformed.z += cos(windTime * 1.7 + phase) * 0.06 * h * h * windStrength;`)
        // blades face up for lighting so the lawn reads as a soft surface, not a hedge
        .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vH;`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= mix(0.45, 1.15, vH);`);
    };
    material.customProgramCacheKey = () => 'grass';

    const mesh = new THREE.InstancedMesh(blade, material, count);
    const rand = random(seed), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const palette = ['#4f8c36', '#63a042', '#7cb24d', '#8fbd55', '#5a9438', '#a3c761'].map(h => new THREE.Color(h));
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 8; tries++) {
      const x = (rand() - 0.5) * 2, z = (rand() - 0.5) * 2;
      if (x * x + z * z > 1) continue;
      const wx = x * inside.rx, wz = z * inside.rz;
      if (avoid(wx, wz)) continue;
      // clumps: denser where low-frequency noise is high
      const clump = Math.sin(wx * 0.9) * Math.cos(wz * 1.1) * 0.5 + 0.5;
      if (rand() > 0.35 + clump * 0.65) continue;
      const edge = Math.hypot(x, z);
      p.set(wx, inside.y(wx, wz), wz);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      const h = (0.18 + rand() * 0.28) * heightScale * (1 - Math.max(0, edge - 0.9) * 3);
      s.set(0.8 + rand() * 0.6, Math.max(0.05, h), 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      c.copy(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.9 + rand() * 0.2);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); }
}
