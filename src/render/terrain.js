// Island tile material: world-space grass / sandy rim / soil cliffs, tinted by per-instance colour.
import * as THREE from 'three';
import { makeGrassTexture, makeCliffTexture, makeSandTexture } from './textures.js';

export function createTerrainMaterial(N, aniso = 8) {
  const grass = makeGrassTexture(512), cliff = makeCliffTexture(256), sand = makeSandTexture(256);
  for (const t of [grass, cliff, sand]) t.anisotropy = aniso;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: grass };
    sh.uniforms.tCliff = { value: cliff };
    sh.uniforms.tSand = { value: sand };
    sh.uniforms.uN = { value: N };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vONrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        vONrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vONrm;
        uniform sampler2D tGrass, tCliff, tSand;
        uniform float uN;`)
      .replace('#include <color_fragment>', `
        {
          vec3 tint = vColor.rgb;
          vec2 p = vWPos.xz;
          vec3 res;
          if (vONrm.y > 0.5) {
            vec3 g1 = texture2D(tGrass, p * 0.25).rgb;
            vec3 g2 = texture2D(tGrass, p * 0.043 + 0.37).rgb;
            float macro = texture2D(tGrass, p * 0.012 + 0.2).g;
            vec3 gr = g1 * (0.5 + g2.g * 0.9) * 1.7;
            gr *= mix(vec3(1.12, 1.03, 0.78), vec3(0.93, 1.0, 0.97), smoothstep(0.35, 0.7, macro));
            vec3 grass = gr * tint;
            float edge = min(min(p.x, uN - p.x), min(p.y, uN - p.y));
            float jit = (texture2D(tGrass, p * 0.31).g - 0.5) * 1.3;
            float sm = 1.0 - smoothstep(0.75 + jit, 1.35 + jit, edge);
            vec3 sd = texture2D(tSand, p * 0.4).rgb * 1.05 * mix(vec3(1.0), tint * 1.7, 0.28);
            res = mix(grass, sd, sm);
          } else {
            float h = abs(vONrm.x) > 0.5 ? vWPos.z : vWPos.x;
            vec3 c = texture2D(tCliff, vec2(h * 0.45, vWPos.y * 0.7)).rgb * 1.15;
            float wet = 1.0 - smoothstep(-0.7, -0.35, vWPos.y);
            c *= 1.0 - wet * 0.45;
            float fringe = smoothstep(-0.16, -0.03, vWPos.y);
            c = mix(c, texture2D(tGrass, p * 0.3).rgb * vec3(0.55, 0.9, 0.35), fringe * 0.8);
            res = c;
          }
          diffuseColor.rgb = res;
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}
