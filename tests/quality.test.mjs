import test from 'node:test';
import assert from 'node:assert/strict';
import {decideGraphics, GRAPHICS, is3d} from '../src/engine/quality.js';

const computer = {touch: false, shortSide: 1080, cores: 8, memory: 8, saveData: false};

test('phones, tablets and modest computers play on the light stage; capable computers get 3D', () => {
  const cases = [
    ['phone', {...computer, touch: true, shortSide: 390}, '2d'],
    ['tablet', {...computer, touch: true, shortSide: 820, gpu: 'Apple GPU'}, '2d'],
    ['small window on a laptop screen', {...computer, shortSide: 600, gpu: 'Apple M2'}, '2d'],
    ['gaming PC', {...computer, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)'}, '3d'],
    ['Apple silicon', {...computer, gpu: 'Apple M2'}, '3d'],
    ['Iris Xe laptop', {...computer, gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)'}, '3d'],
    ['office laptop, Intel UHD', {...computer, cores: 4, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)'}, '2d'],
    ['old Intel HD', {...computer, gpu: 'Intel(R) HD Graphics 4000'}, '2d'],
    ['software rendering', {...computer, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'}, '2d'],
    ['no WebGL2', {...computer, gpu: ''}, '2d'],
    ['two cores', {...computer, cores: 2, gpu: 'Apple M2'}, '2d'],
    ['little memory', {...computer, memory: 2, gpu: 'Apple M2'}, '2d'],
    ['data saver on', {...computer, saveData: true, gpu: 'Apple M2'}, '2d'],
    ['ARM Chromebook', {...computer, gpu: 'ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)'}, '2d'],
    ['Windows on ARM', {...computer, gpu: 'ANGLE (Qualcomm, Adreno (TM) 690 Direct3D11 vs_5_0 ps_5_0)'}, '2d'],
    ['PowerVR', {...computer, gpu: 'PowerVR Rogue GE8320'}, '2d'],
    ['Intel Mac in Safari', {...computer, gpu: 'Apple GPU on an Intel Mac'}, '2d'],
    ['Apple silicon in Safari', {...computer, gpu: 'Apple GPU'}, '3d'],
    ['AMD Radeon', {...computer, gpu: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0)'}, '3d'],
  ];
  for (const [name, device, expected] of cases) assert.equal(decideGraphics(device), expected, name);
});

test('every graphics setting is automatic, the light stage or a 3D tier', () => {
  assert.deepEqual(GRAPHICS, ['auto', '2d', 'low', 'medium', 'high', 'ultra']);
  assert.equal(is3d('2d'), false);
  for (const tier of ['low', 'medium', 'high', 'ultra']) assert.equal(is3d(tier), true);
});
