// Post-processing pipeline: scene -> (GTAO) -> bloom -> colour grade/vignette -> tone map + sRGB.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// Icons and coin pops live on their own layer so ambient occlusion never touches them
// (GTAO renders every object as solid geometry, which turned the flat sprites into black squares).
export const OVERLAY_LAYER = 1;
function renderOverlay(renderer, scene, camera, target) {
  const bg = scene.background, auto = renderer.autoClear, mask = camera.layers.mask, shadows = renderer.shadowMap.autoUpdate;
  scene.background = null;
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  camera.layers.set(OVERLAY_LAYER);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  camera.layers.mask = mask;
  renderer.shadowMap.autoUpdate = shadows;
  renderer.autoClear = auto;
  scene.background = bg;
}
class OverlayPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    renderOverlay(renderer, this.scene, this.camera, this.renderToScreen ? null : readBuffer);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: 0.28 },
    uSat: { value: 1.08 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uContrast: { value: 1.04 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig, uSat, uContrast; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.18) * uContrast + 0.18;
      col *= uTint;
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
      col *= 1.0 - uVig * smoothstep(0.28, 0.8, length(d));
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export function createPipeline(renderer, scene, camera, level) {
  const cfg = {
    ultra: { dpr: 2, samples: 4, ao: true, bloomScale: 1 },
    high: { dpr: 1.5, samples: 2, ao: false, bloomScale: 0.5 },
    low: { dpr: 1, samples: 0, ao: false, bloomScale: 0 },
  }[level] || { dpr: 1, samples: 0, ao: false, bloomScale: 0 };

  let dprCap = cfg.dpr;
  const api = {
    composer: null, gtao: null, bloom: null, grade: null,
    get dpr() { return Math.min(dprCap, window.devicePixelRatio || 1); },
  };

  const applySize = () => {
    renderer.setPixelRatio(api.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (api.composer) {
      api.composer.setPixelRatio(api.dpr);
      api.composer.setSize(window.innerWidth, window.innerHeight);
    }
  };

  if (level === 'low') {
    api.setSize = applySize;
    api.render = () => { renderer.render(scene, camera); renderOverlay(renderer, scene, camera, null); };
    api.setLook = () => {};
    api.degrade = () => false;
    applySize();
    return api;
  }

  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(api.dpr);
  const rt = new THREE.WebGLRenderTarget(w * api.dpr, h * api.dpr, {
    type: THREE.HalfFloatType, samples: cfg.samples,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(api.dpr);
  api.composer = composer;
  composer.addPass(new RenderPass(scene, camera));

  if (cfg.ao) {
    const gtao = new GTAOPass(scene, camera, w * api.dpr, h * api.dpr);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.95;
    gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.5, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
    api.gtao = gtao;
  }

  const bloomRes = new THREE.Vector2(w * cfg.bloomScale, h * cfg.bloomScale);
  const bloom = new UnrealBloomPass(bloomRes, 0.2, 0.5, 1.0);
  if (cfg.bloomScale < 1) {
    const orig = bloom.setSize.bind(bloom);
    bloom.setSize = (bw, bh) => orig(bw * cfg.bloomScale, bh * cfg.bloomScale);
  }
  composer.addPass(bloom);
  api.bloom = bloom;

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  api.grade = grade;
  composer.addPass(new OverlayPass(scene, camera));
  composer.addPass(new OutputPass());

  applySize();

  api.setSize = applySize;
  const tint = new THREE.Color();
  // day: 0..1 daylight, storm: 0..1
  api.setLook = (day, storm) => {
    const night = 1 - day;
    bloom.strength = (0.12 + night * 0.75) * (1 - storm * 0.3);
    bloom.threshold = 1.1 - night * 0.55;
    bloom.radius = 0.45 + night * 0.25;
    const u = grade.uniforms;
    u.uSat.value = 1.1 - storm * 0.25 - night * 0.1;
    u.uVig.value = 0.22 + night * 0.15;
    tint.setRGB(1.03, 1.0, 0.96).lerp(new THREE.Color(0.86, 0.95, 1.12), night);
    u.uTint.value.copy(tint);
  };
  api.render = (dt) => composer.render(dt);

  // performance back-off: first drop AO, then lower the pixel ratio.
  let stage = 0;
  api.degrade = () => {
    if (stage === 0 && api.gtao) { api.gtao.enabled = false; stage = 1; return true; }
    if (stage <= 1 && dprCap > 1) { dprCap = 1; applySize(); stage = 2; return true; }
    return false;
  };
  return api;
}
