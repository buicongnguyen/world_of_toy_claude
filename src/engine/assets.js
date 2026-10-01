// Loads the Blender-authored GLB libraries (Draco-compressed) with progress, and provides
// cloning/instancing helpers that keep materials shared.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';

const LIBRARIES = ['fruit', 'world', 'friends'];

function dracoPath() {
  const meta = document.querySelector('meta[name="draco-path"]')?.content;
  return new URL(meta || './node_modules/three/examples/jsm/libs/draco/gltf/', document.baseURI).href;
}

/**
 * A short fingerprint of the published libraries (their sizes and mesh counts, from manifest.json), used to version the
 * GLB URLs. The GLBs keep fixed names, so without it a browser that reloads right after a deploy can pair the new code
 * with an older cached library and stop on a prop that library does not have. The manifest itself is always
 * revalidated; if it cannot be read, the plain URLs are used as before.
 */
async function assetVersion(base) {
  try {
    const res = await fetch(new URL('manifest.json', base), {cache: 'no-cache'});
    if (!res.ok) return '';
    const m = await res.json();
    const text = [...Object.entries(m.files || {}).map(([k, v]) => `${k}=${v}`), m.vertices, m.triangles].join('|');
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  } catch { return ''; }
}

export class AssetLibrary {
  constructor() {
    this.meshes = new Map();   // name -> Object3D (static assets)
    this.friends = new Map();  // name -> {root, clips}
    this.materials = new Map();
    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();
  }

  /** onProgress(fraction 0..1) */
  async load(base, onProgress = () => {}) {
    const manager = new THREE.LoadingManager();
    const draco = new DRACOLoader(manager).setDecoderPath(dracoPath());
    draco.preload();
    const loader = new GLTFLoader(manager).setDRACOLoader(draco);
    const progress = Object.fromEntries(LIBRARIES.map(n => [n, 0]));
    const report = () => onProgress(Object.values(progress).reduce((a, b) => a + b, 0) / LIBRARIES.length);
    const version = await assetVersion(base);
    const urlOf = name => { const url = new URL(`${name}.glb`, base); if (version) url.searchParams.set('v', version); return url.href; };
    const results = await Promise.all(LIBRARIES.map(name => loader.loadAsync(urlOf(name), e => {
      if (e.lengthComputable) { progress[name] = e.loaded / e.total * .95; report(); }
    }).then(gltf => { progress[name] = 1; report(); return [name, gltf]; })));
    draco.dispose();
    for (const [name, gltf] of results) {
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          this.sharedGeometries.add(o.geometry);
          for (const m of [o.material].flat()) { this.materials.set(m.name, m); this.sharedMaterials.add(m); }
        }
      });
      if (name === 'friends') {
        for (const root of gltf.scene.children) {
          const clips = new Map(gltf.animations.filter(a => a.name.startsWith(root.name + '_')).map(a => [a.name.slice(root.name.length + 1), a]));
          this.friends.set(root.name, {root, clips});
        }
      } else {
        for (const child of gltf.scene.children) this.meshes.set(child.name, child);
      }
    }
    return this;
  }

  has(name) { return this.meshes.has(name) || this.friends.has(name); }

  /** A fresh copy of a static asset. Geometry and materials are shared. */
  clone(name) {
    const source = this.meshes.get(name);
    if (!source) throw new Error(`Missing Blender asset: ${name}`);
    const copy = source.clone(true);
    copy.traverse(o => { if (o.isMesh) { o.castShadow = source.castShadow ?? true; } });
    return copy;
  }

  /** A skinned character instance with its own skeleton. */
  friend(name) {
    const f = this.friends.get(name);
    if (!f) throw new Error(`Missing Blender character: ${name}`);
    return {root: cloneSkinned(f.root), clips: f.clips};
  }

  /** Every sub-mesh of an asset as {geometry, material, matrix} parts (for instancing). */
  parts(name) {
    const source = this.meshes.get(name);
    const parts = [];
    source.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(source.matrixWorld).invert();
    source.traverse(o => { if (o.isMesh) parts.push({geometry: o.geometry, material: o.material, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)}); });
    return parts;
  }

  /** Instanced copies of an asset: one InstancedMesh per sub-mesh. transforms: Matrix4[] */
  instanced(name, transforms, {castShadow = true, receiveShadow = true, material} = {}) {
    const group = new THREE.Group();
    group.name = `${name}-instances`;
    for (const part of this.parts(name)) {
      const mesh = new THREE.InstancedMesh(part.geometry, material ? material(part.material) : part.material, transforms.length);
      transforms.forEach((m, i) => mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, part.matrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }

  /** Dispose resources added to a clone, preserving the Blender library and shared textures. */
  disposeClone(root) {
    const geometries = new Set(), materials = new Set();
    root.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      // Sprite geometry belongs to Three.js and is shared by all sprites.
      if (o.isMesh && o.geometry && !this.sharedGeometries.has(o.geometry)) geometries.add(o.geometry);
      for (const m of [o.material].flat()) if (m && !this.sharedMaterials.has(m)) materials.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }

  /** Low tiers: swap physical materials for standard ones (drops sheen/clearcoat cost). */
  simplifyMaterials() {
    const swap = new Map();
    const convert = m => {
      if (!m.isMeshPhysicalMaterial) return m;
      if (!swap.has(m)) {
        const s = new THREE.MeshStandardMaterial();
        for (const k of ['name', 'color', 'map', 'normalMap', 'normalScale', 'roughness', 'metalness', 'emissive', 'emissiveMap', 'emissiveIntensity', 'vertexColors', 'side', 'transparent', 'opacity', 'alphaTest', 'alphaMap'])
          if (m[k] !== undefined) s[k] = m[k]?.clone && !m[k].isTexture ? m[k].clone() : m[k];
        swap.set(m, s);
        this.sharedMaterials.add(s);
      }
      return swap.get(m);
    };
    const all = [...this.meshes.values(), ...[...this.friends.values()].map(f => f.root)];
    for (const root of all) root.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material); });
    for (const [k, m] of this.materials) this.materials.set(k, convert(m));
  }
}
