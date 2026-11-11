import { BackSide, Mesh, type Object3D, ShaderMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

/**
 * A bright sky around the player: a golden-hour gradient dome with a low sun.
 *
 * Mixed reality is the default on headsets with colour passthrough (Quest 3,
 * Quest Pro): your real room stays visible around the table. On Quest 2,
 * whose passthrough is black and white, and in a desktop browser, the sky is
 * on, so the world reads bright and warm instead of grey. Settings → Sky
 * switches it either way, remembered on the device.
 */

const KEY = 'shadowplay.sky';

function defaultOn(): boolean {
  // The desktop emulator reports itself as a Quest 3 but shows no real room: sky on there.
  if ((window as unknown as { IWER_DEVICE?: unknown }).IWER_DEVICE) return true;
  return !/Quest 3|Quest Pro/i.test(navigator.userAgent);
}

/** The player's own choice, once made (null: follow the device's default). */
let chosen: boolean | null = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? null : saved === '1';
  } catch {
    return null;
  }
})();

export function skyOn(): boolean {
  return chosen ?? defaultOn();
}

export function setSky(value: boolean): void {
  chosen = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // Not remembered; it still switches now.
  }
}

const SUN = new Vector3(0.45, 0.22, -0.86).normalize();

/** The dome, drawn behind everything; it follows nothing (the player sits still). */
export function buildSky(parent: Object3D): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { sun: { value: SUN } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 zenith = vec3(0.36, 0.63, 0.98);
        vec3 horizon = vec3(1.0, 0.88, 0.72);
        vec3 ground = vec3(0.62, 0.78, 0.52);
        vec3 c = d.y >= 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon, ground, pow(-d.y, 0.45));
        float s = max(dot(d, sun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 90.0) * 0.9 + pow(s, 8.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(30, 48, 24), material);
  dome.name = 'SkyDome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.visible = skyOn();
  parent.add(dome);
  return dome;
}
