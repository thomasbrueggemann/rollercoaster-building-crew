// Generated sky dome -> PMREM environment map for image-based lighting / reflections.
import * as THREE from 'three';

export function createEnvironment(renderer, size = 128) {
  const sky = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color('#5fa4ec') },
      uHorizon: { value: new THREE.Color('#e4f2ff') },
      uGround: { value: new THREE.Color('#6d8a55') },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform vec3 uZenith, uHorizon, uGround;
      void main(){
        vec3 d = normalize(vP);
        vec3 s = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.45));
        vec3 g = mix(uHorizon * 0.55 + uGround * 0.45, uGround * 0.5, clamp(-d.y * 2.5, 0.0, 1.0));
        vec3 c = d.y > 0.0 ? s : g;
        // soft bright patch (stands in for a sun / softbox so metals get a highlight)
        c += vec3(1.0, 0.9, 0.75) * pow(max(dot(d, normalize(vec3(0.5, 0.55, 0.35))), 0.0), 18.0) * 0.8;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(sky, 0.02, 0.1, 100, { size });
  pmrem.dispose();
  mat.dispose();
  sky.children[0].geometry.dispose();
  return rt.texture;
}
