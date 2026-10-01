// Graphics choices, kept free of three.js so the light 2D stage never downloads the 3D engine.
// '2d' is the pre-rendered light stage; the tiers below are the 3D cinematic renderer's.
export const QUALITY = {
  low:    {label: 'Low', pixelRatio: 1.0, msaa: 0, post: false, bloom: false, gtao: false, shadow: 1024, grass: 1400, particles: 0.4, physical: false},
  medium: {label: 'Medium', pixelRatio: 1.25, msaa: 0, post: true, bloom: true, gtao: false, shadow: 2048, grass: 3600, particles: 0.7, physical: true},
  high:   {label: 'High', pixelRatio: 1.5, msaa: 4, post: true, bloom: true, gtao: false, shadow: 2048, grass: 7000, particles: 1, physical: true},
  ultra:  {label: 'Ultra', pixelRatio: 2.0, msaa: 4, post: true, bloom: true, gtao: true, shadow: 4096, grass: 11000, particles: 1, physical: true},
};

/** Graphics settings a player can choose: automatic (by device), the light stage, or a 3D tier. */
export const GRAPHICS = ['auto', '2d', 'low', 'medium', 'high', 'ultra'];
export const is3d = value => value !== '2d';

/** The 3D tier for a device that runs 3D. */
export function autoQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  if (coarse) return cores <= 4 || memory <= 3 ? 'low' : 'medium';
  return cores >= 8 && devicePixelRatio <= 2 ? 'high' : 'medium';
}

/** Which renderer a device starts with: the light stage on phones, tablets and modest computers,
 *  3D on capable computers. `device` holds what the browser reports; the answer is '2d' or 3D. */
export function decideGraphics({touch, shortSide, cores, memory, saveData, gpu}) {
  if (touch || shortSide < 700 || saveData) return '2d';
  if (cores < 4 || memory < 4) return '2d';
  // no real GPU (software rasterisers), an entry-level integrated one, a phone-class GPU in a
  // computer (ARM Chromebooks, Windows on ARM), or an Intel Mac behind Safari's "Apple GPU" mask
  if (!gpu || /swiftshader|llvmpipe|softpipe|software|basic render|intel.*\b(u?hd) graphics\b|mali|adreno|powervr|intel mac/i.test(gpu)) return '2d';
  return '3d';
}

/** The GPU the browser would render 3D with (asked the way the 3D renderer asks), or '' when WebGL2
 *  is unavailable or the browser warns that it would be slow. */
function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', {powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true});
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    let name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || 'webgl2');
    // Safari names every Mac GPU "Apple GPU"; only Apple silicon decodes ASTC textures
    if (/^apple gpu$/i.test(name) && !gl.getExtension('WEBGL_compressed_texture_astc')) name = 'Apple GPU on an Intel Mac';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return ''; }
}

/** Resolve a setting to what actually runs: '2d' or a 3D tier. */
export function resolveGraphics(setting) {
  if (setting === '2d' || Object.hasOwn(QUALITY, setting)) return setting;
  // iPadOS asks for desktop sites and reports a Mac, even with a trackpad; a Mac has no touch screen
  const ipad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  const device = {touch: ipad || matchMedia('(pointer: coarse)').matches || !matchMedia('(any-pointer: fine)').matches,
    shortSide: Math.min(screen.width || innerWidth, screen.height || innerHeight), cores: navigator.hardwareConcurrency || 4,
    memory: navigator.deviceMemory || 8, saveData: !!navigator.connection?.saveData};
  // only probe the GPU when everything else already points at a computer
  if (decideGraphics({...device, gpu: 'unknown'}) === '2d') return '2d';
  return decideGraphics({...device, gpu: gpuName()}) === '2d' ? '2d' : autoQuality();
}
