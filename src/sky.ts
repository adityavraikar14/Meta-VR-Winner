import { BackSide, Color, Mesh, type Object3D, ShaderMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

/**
 * What is around the player. Three choices (Settings cycles them, remembered
 * on the device):
 *
 *   mood  (default) Your real room stays visible, washed in the chapter's
 *         colours: green-gold for the jungle, aqua for the river, amber for
 *         the forge, dawn pink for the mountain, ember red for the dragon.
 *         Soft lights drift around you. On a Quest 2, whose passthrough is
 *         black and white, this is what gives the room colour at all.
 *   room  Plain passthrough, nothing added.
 *   sky   A full golden-hour sky dome instead of the room.
 *
 * The wash is a see-through dome: each pixel adds a little colour and a
 * little alpha over the camera image, so the room is tinted, never hidden.
 */

export type Backdrop = 'mood' | 'room' | 'sky';
const ORDER: Backdrop[] = ['mood', 'room', 'sky'];
const KEY = 'shadowplay.backdrop';
const OLD_KEY = 'shadowplay.sky';

let chosen: Backdrop = (() => {
  try {
    const saved = localStorage.getItem(KEY) as Backdrop | null;
    if (saved && ORDER.includes(saved)) return saved;
    // An earlier build's choice of the full sky carries over.
    if (localStorage.getItem(OLD_KEY) === '1') return 'sky';
  } catch {
    // Not remembered: the default.
  }
  return 'mood';
})();

export function backdrop(): Backdrop {
  return chosen;
}

/** Steps to the next backdrop and returns it. */
export function nextBackdrop(): Backdrop {
  chosen = ORDER[(ORDER.indexOf(chosen) + 1) % ORDER.length];
  try {
    localStorage.setItem(KEY, chosen);
  } catch {
    // Not remembered; it still switches now.
  }
  return chosen;
}

export const BACKDROP_NAME: Record<Backdrop, string> = { mood: 'mood light', room: 'your room', sky: 'sky' };

export function skyOn(): boolean {
  return chosen === 'sky';
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

/** Each chapter's mood: the colour overhead, the colour at eye level, the drifting lights. */
const MOODS: Array<[number, number, number]> = [
  [0xfff0a0, 0x7be08a, 0xffe27a], // Light & Shadow: sun through leaves
  [0x9fe8ff, 0x4ac8d8, 0xc8f6ff], // Structures: by the river
  [0xffb86a, 0xff7a4a, 0xffd27a], // Fire & Iron: the forge's glow
  [0xffc8e8, 0x9fb8ff, 0xfff0c8], // Hot Air: mountain dawn
  [0xff8a6a, 0xd8486a, 0xffc928], // The Dragon: embers
];

/**
 * The mood light: a see-through dome that washes your room in the chapter's
 * colours, with a few soft lights drifting around you.
 */
export class MoodLight {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly top = new Color(MOODS[0][0]);
  private readonly mid = new Color(MOODS[0][1]);
  private readonly orb = new Color(MOODS[0][2]);
  private readonly want = { top: new Color(MOODS[0][0]), mid: new Color(MOODS[0][1]), orb: new Color(MOODS[0][2]) };
  private time = 0;

  constructor(parent: Object3D) {
    this.material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: {
        top: { value: this.top },
        mid: { value: this.mid },
        orb: { value: this.orb },
        time: { value: 0 },
        strength: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 orb;
        uniform float time;
        uniform float strength;
        varying vec3 vDir;
        // A soft round light in direction c, of angular size s.
        float light(vec3 d, vec3 c, float s) {
          return smoothstep(1.0 - s, 1.0, dot(d, normalize(c)));
        }
        void main() {
          vec3 d = normalize(vDir);
          float up = smoothstep(-0.35, 0.8, d.y);
          vec3 c = mix(mid, top, up);
          // Strongest around eye level and above; the floor keeps its own look.
          float a = mix(0.12, 0.3, smoothstep(-0.6, 0.25, d.y));
          // Five lights adrift, each on its own slow circle.
          float o = 0.0;
          for (int i = 0; i < 5; i++) {
            float f = float(i);
            float t = time * (0.05 + 0.013 * f) + f * 1.7;
            vec3 at = vec3(cos(t) * (1.0 + 0.2 * f), 0.25 + 0.3 * sin(t * 1.3 + f), sin(t) * (1.0 + 0.2 * f));
            o += light(d, at, 0.02 + 0.012 * f) * (0.5 + 0.5 * sin(time * 0.6 + f * 2.1));
          }
          c = mix(c, orb, clamp(o, 0.0, 1.0) * 0.7);
          a += clamp(o, 0.0, 1.0) * 0.22;
          gl_FragColor = vec4(c, a * strength);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new SphereGeometry(28, 48, 24), this.material);
    this.mesh.name = 'MoodLight';
    this.mesh.renderOrder = -9;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    parent.add(this.mesh);
  }

  /** `world` is the chapter whose mood to move towards. */
  update(dt: number, world: number): void {
    this.time += dt;
    const [top, mid, orb] = MOODS[((world % MOODS.length) + MOODS.length) % MOODS.length];
    this.want.top.setHex(top);
    this.want.mid.setHex(mid);
    this.want.orb.setHex(orb);
    const k = Math.min(1, dt * 1.5);
    this.top.lerp(this.want.top, k);
    this.mid.lerp(this.want.mid, k);
    this.orb.lerp(this.want.orb, k);
    this.material.uniforms.time.value = this.time;
    this.mesh.visible = chosen === 'mood';
  }
}
