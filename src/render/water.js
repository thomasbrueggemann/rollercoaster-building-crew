// Procedural ocean + flood water shaders (cheap, single pass, no planar reflection).
import * as THREE from 'three';
import { makeWaterNormalTexture } from './textures.js';

const normals = makeWaterNormalTexture(256);

// Shared uniforms (updated from scene.js every frame).
export const waterUniforms = {
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uLightCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uAmbient: { value: 1 },                       // overall brightness (day/night)
  uNight: { value: 0 },
  uStorm: { value: 0 },
  uZenith: { value: new THREE.Color('#5aa7e8') },
  uHorizon: { value: new THREE.Color('#bfe3ff') },
  uDeep: { value: new THREE.Color('#0f4f86') },
  uShallow: { value: new THREE.Color('#2ec4c0') },
  tNormal: { value: normals },
};

const COMMON_VERT = /* glsl */`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const COMMON_FRAG_HEAD = /* glsl */`
varying vec3 vW;
uniform float uTime, uAmbient, uNight, uStorm;
uniform vec3 uLightDir, uLightCol, uZenith, uHorizon, uDeep, uShallow;
uniform sampler2D tNormal;

vec3 viewDirW() { return normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])); }
vec3 skyAt(vec3 r) {
  float t = smoothstep(0.0, 0.9, r.y);
  vec3 c = mix(uHorizon, uZenith, t);
  float s = max(dot(r, uLightDir), 0.0);
  c += uLightCol * (pow(s, 24.0) * 0.25 + pow(s, 400.0) * 4.0);
  return c;
}
// two scrolling ripple layers -> perturbed normal
vec3 rippleNormal(vec2 p, float scale, float speed, float amt) {
  vec2 a = texture2D(tNormal, p * 0.11 * scale + vec2(uTime * 0.020, uTime * 0.013) * speed).rg - 0.5;
  vec2 b = texture2D(tNormal, p * 0.27 * scale - vec2(uTime * 0.016, -uTime * 0.021) * speed).rg - 0.5;
  vec2 c = texture2D(tNormal, p * 0.71 * scale + vec2(-uTime * 0.03, uTime * 0.026) * speed).rg - 0.5;
  vec2 g = (a * 1.0 + b * 0.6 + c * 0.22) * amt;
  return normalize(vec3(-g.x, 1.0, -g.y));
}
`;

export function createSeaMaterial(N) {
  return new THREE.ShaderMaterial({
    uniforms: { ...waterUniforms, uN: { value: N } },
    vertexShader: COMMON_VERT,
    fragmentShader: /* glsl */`
${COMMON_FRAG_HEAD}
uniform float uN;
void main() {
  vec2 p = vW.xz;
  vec3 V = viewDirW();
  float amt = 1.8 + uStorm * 3.0;
  vec3 n = rippleNormal(p, 1.0, 1.0 + uStorm, amt);
  // distance outside the island square
  vec2 q = max(max(-p, p - uN), 0.0);
  float d = length(q);
  float hgt = texture2D(tNormal, p * 0.05 + vec2(uTime * 0.004)).b;

  float nv = max(dot(n, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - nv, 4.0);
  vec3 R = reflect(-V, n);
  vec3 refl = skyAt(vec3(R.x, abs(R.y), R.z));

  // body colour: shallow turquoise near shore -> deep blue offshore
  float sh = exp(-d * 0.28);
  vec3 body = mix(uDeep, uShallow, sh * 0.85);
  body *= 0.85 + 0.3 * hgt;
  vec3 col = mix(body * uAmbient, refl, clamp(fres * 1.6, 0.0, 0.85));
  // sun glints
  float gl = pow(max(dot(R, uLightDir), 0.0), 220.0);
  col += uLightCol * gl * 2.5 * (1.0 - uStorm * 0.6);

  // shoreline foam (animated, noisy)
  float nz = texture2D(tNormal, p * 0.35 + vec2(uTime * 0.02, 0.0)).b;
  float fd = d + (nz - 0.5) * 0.9;
  float surge = 0.5 + 0.5 * sin(uTime * 1.1 - d * 2.5);
  float foam = smoothstep(0.55 + 0.25 * surge, 0.0, fd) * 0.85;
  foam += smoothstep(0.12, 0.0, abs(fd - (0.95 + 0.35 * sin(uTime * 0.6)))) * 0.45 * step(0.0, d - 0.02);
  // whitecaps in storms
  foam += smoothstep(0.78, 0.95, texture2D(tNormal, p * 0.18 - vec2(uTime * 0.03)).b) * uStorm * 0.5;
  foam = clamp(foam, 0.0, 1.0) * step(d, 6.0 + uStorm * 200.0);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * uAmbient), foam);

  // atmospheric haze toward the horizon colour
  float hz = smoothstep(40.0, 150.0, length(p - vec2(uN * 0.5)));
  col = mix(col, uHorizon, hz * 0.75);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}

export function createFloodMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...waterUniforms },
    transparent: true,
    depthWrite: false,
    vertexShader: COMMON_VERT,
    fragmentShader: /* glsl */`
${COMMON_FRAG_HEAD}
void main() {
  vec2 p = vW.xz;
  vec3 V = viewDirW();
  vec3 n = rippleNormal(p, 2.2, 3.0, 4.5);
  float nv = max(dot(n, V), 0.0);
  float fres = 0.05 + 0.95 * pow(1.0 - nv, 4.0);
  vec3 R = reflect(-V, n);
  vec3 refl = skyAt(vec3(R.x, abs(R.y), R.z));
  float swirl = texture2D(tNormal, p * 0.09 + vec2(uTime * 0.03, -uTime * 0.02)).b;
  vec3 mud = mix(vec3(0.20, 0.13, 0.07), vec3(0.36, 0.26, 0.14), swirl);
  vec3 col = mix(mud * uAmbient, refl, clamp(fres * 1.4, 0.0, 0.7));
  float gl = pow(max(dot(R, uLightDir), 0.0), 120.0);
  col += uLightCol * gl * 1.6;
  // foamy debris streaks
  float fo = smoothstep(0.74, 0.9, texture2D(tNormal, p * 0.42 + vec2(uTime * 0.05, uTime * 0.03)).b);
  col = mix(col, vec3(0.7, 0.62, 0.5) * (0.3 + 0.7 * uAmbient), fo * 0.5);
  gl_FragColor = vec4(col, 0.74 + fres * 0.2);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}
