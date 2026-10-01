import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AssetLibrary} from '../src/engine/assets.js';

test('scene cleanup frees owned geometry, materials and instances without disposing shared assets',()=>{
 const library=new AssetLibrary(), root=new THREE.Group();
 const sharedGeometry=new THREE.BoxGeometry(), sharedMaterial=new THREE.MeshStandardMaterial();
 library.sharedGeometries.add(sharedGeometry);library.sharedMaterials.add(sharedMaterial);
 const geometry=new THREE.CircleGeometry(), material=new THREE.MeshStandardMaterial();
 const texture=new THREE.Texture();material.map=texture;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));
 const instances=new THREE.InstancedMesh(sharedGeometry,sharedMaterial,2);
 root.add(new THREE.Mesh(sharedGeometry,sharedMaterial),new THREE.Mesh(geometry,[material,sharedMaterial]),new THREE.Mesh(geometry,material),sprite,instances);
 const disposed=new Map();
 for(const resource of [sharedGeometry,sharedMaterial,geometry,material,texture,sprite.geometry,sprite.material,instances]){
  disposed.set(resource,0);resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1));
 }
 library.disposeClone(root);
 for(const resource of [geometry,material,sprite.material,instances])assert.equal(disposed.get(resource),1);
 for(const resource of [sharedGeometry,sharedMaterial,texture,sprite.geometry])assert.equal(disposed.get(resource),0);
});
