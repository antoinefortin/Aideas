// Analytic sky shared by the sky dome and the water reflections.
import * as THREE from 'three';

export const skyUniforms = {
  uSkyTop: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  uSkyBottom: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSunIntensity: { value: 3 },
  uSunSize: { value: 0.004 },
  uStars: { value: 0 },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunSize;
uniform float uStars;

vec3 skyColor(vec3 d) {
  float y = d.y;
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(clamp(y, 0.0, 1.0), 0.45));
  c = mix(c, uSkyBottom, smoothstep(0.0, -0.3, y));
  float s = max(dot(d, uSunDir), 0.0);
  float glow = pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35;
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s);
  c += uSunColor * (glow * uSunIntensity * 0.3 + disc * 18.0);
  if (uStars > 0.0 && y > 0.0) {
    vec3 q = floor(d * 380.0);
    float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    c += vec3(0.8, 0.85, 1.0) * step(0.9982, h) * uStars * smoothstep(0.0, 0.25, y) * (0.4 + 0.6 * fract(h * 97.0));
  }
  return c;
}
`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `${SKY_GLSL}
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
