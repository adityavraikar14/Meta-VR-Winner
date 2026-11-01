import {
  AdditiveBlending,
  type AnimationAction,
  AnimationMixer,
  Box3,
  CanvasTexture,
  Color,
  Group,
  LoopRepeat,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from '@iwsdk/core';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The Shadow Dragon in 3D (European Dragon by Regina Cachoa, CC-BY): it
 * bursts out of the screen and hovers between the screen and you, beating
 * its wings, always turning to face you. The lantern behind you casts its
 * real shadow onto the screen. An ember burns in its chest; fire gathers
 * in its jaws before it breathes. Struck, it flashes and recoils; beaten, it
 * burns away into light.
 */

const DRAGON_URL = 'gltf/dragon.glb';
const PHOENIX_URL = 'gltf/phoenix.glb';
/** Overall length of the dragon in the room, metres. */
const LENGTH = 0.78;
const PHOENIX_LENGTH = 0.32;

/** Loads the dragon, then the phoenix, one at a time, retrying a slow or failed load. */
let loading: Promise<void> | null = null;

/** Dev: time each step of loading the dragon, to find what stalls on a slow device. */
export async function diagnoseDragon(log: (line: string) => void): Promise<void> {
  const t0 = performance.now();
  const ms = () => `${Math.round(performance.now() - t0)} ms`;
  log(`visibility=${document.visibilityState} hasFocus=${document.hasFocus()}`);
  let frames = 0;
  const count = () => {
    frames++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  setTimeout(() => log(`window frames in 2 s: ${frames}`), 2000);
  const buffer = await (await fetch(`${import.meta.env.BASE_URL}${DRAGON_URL}`)).arrayBuffer();
  log(`fetched ${buffer.byteLength} bytes at ${ms()}`);
  // Does createImageBitmap answer at all? (a 1x1 PNG)
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const bitmap = createImageBitmap(new Blob([png], { type: 'image/png' })).then(() => 'resolved', (e) => `rejected ${e}`);
  log(`createImageBitmap: ${await Promise.race([bitmap, new Promise((r) => setTimeout(() => r('no answer in 3 s'), 3000))])}`);
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => {
      parser.textureLoader = new TextureLoader(parser.options.manager);
      return { name: 'shadowplay_image_textures' };
    });
    const gltf = await loader.parseAsync(buffer, `${import.meta.env.BASE_URL}gltf/`);
    log(`parsed with image textures at ${ms()}: ${gltf.animations.length} clips`);
  } catch (error) {
    log(`parse failed at ${ms()}: ${String(error)}`);
  }
}
const loaded: Record<string, GLTF | undefined> = {};
/** For dev info: how the big models are getting on. */
export const dragonLoad = { dragon: 'waiting', phoenix: 'waiting' };

export function preloadDragon(): Promise<void> {
  loading ??= loadDragon();
  return loading;
}

async function loadDragon(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  for (const [url, key] of [[DRAGON_URL, 'dragon3d'], [PHOENIX_URL, 'phoenix']] as const) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const name = key === 'dragon3d' ? 'dragon' : 'phoenix';
      dragonLoad[name] = `loading (try ${attempt + 1})`;
      try {
        // three's own loader: no fixed time limit, so a slow connection still gets there.
        loaded[key] = await new GLTFLoader().loadAsync(`${base}${url}`);
        dragonLoad[name] = 'ready';
        break;
      } catch (error) {
        dragonLoad[name] = `failed (try ${attempt + 1})`;
        console.warn(`Could not load ${key} (try ${attempt + 1})`, error);
        await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
      }
    }
  }
}

function glowSprite(inner: string, outer: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, blending: AdditiveBlending, transparent: true, depthWrite: false }));
  sprite.renderOrder = 8;
  return sprite;
}

/** Scale a model to a length and put its bounding box's centre on the origin, feet on y=0. */
function fit(model: Object3D, length: number): void {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  const size = box.getSize(new Vector3());
  const k = length / Math.max(size.x, size.z);
  model.scale.multiplyScalar(k);
  const c = box.getCenter(new Vector3());
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
}

/**
 * Paint the dragon's scales in a sweep of colour, like a jewelled dragon:
 * sapphire at the head, emerald, crimson along the body, gold at the tail,
 * multiplied over its scale texture so every scale still shows.
 */
function rainbowScales(material: MeshStandardMaterial, minZ: number, maxZ: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSpan = { value: new Vector3(minZ, maxZ, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAlong;\nuniform vec3 uSpan;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = clamp((position.z - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlong;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 c0 = vec3(0.15, 0.45, 1.0);
        vec3 c1 = vec3(0.1, 0.85, 0.45);
        vec3 c2 = vec3(1.0, 0.18, 0.12);
        vec3 c3 = vec3(1.0, 0.72, 0.1);
        float t = vAlong;
        vec3 tint = t < 0.33 ? mix(c0, c1, t / 0.33) : t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34);
        diffuseColor.rgb *= tint * 2.1;`,
      );
  };
  material.customProgramCacheKey = () => 'dragon-rainbow';
}

export class Dragon3D {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly mixer: AnimationMixer;
  private readonly fly: AnimationAction | null;
  private readonly head: Object3D | null;
  private readonly mouth: Object3D | null;
  private readonly chest: Object3D | null;
  private readonly heart: Sprite;
  private readonly breath: Sprite;
  private readonly materials: Array<{ material: MeshStandardMaterial; emissive: Color }> = [];
  private time = 0;
  private hurt = 0;
  /** 0 → 1 as it draws breath. */
  windup = 0;
  /** 0 → 1 as it burns away. */
  defeat = 0;
  private readonly tmp = new Vector3();

  /** Null until the model has loaded. */
  static create(): Dragon3D | null {
    const gltf = loaded.dragon3d;
    return gltf ? new Dragon3D(cloneRig(gltf.scene), gltf.animations) : null;
  }

  private constructor(model: Object3D, clips: import('@iwsdk/core').AnimationClip[]) {
    this.root.name = 'Dragon3D';
    this.body.add(model);
    this.root.add(this.body);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      // Its shadow falls on the screen, cast by the lantern behind you.
      mesh.castShadow = true;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const own = list.map((m) => {
        const c = (m as MeshStandardMaterial).clone();
        if ((c as MeshStandardMaterial).isMeshStandardMaterial) {
          this.materials.push({ material: c, emissive: c.emissive.clone() });
          rainbowScales(c as MeshStandardMaterial, box.min.z, box.max.z);
        }
        return c as Material;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    this.mixer = new AnimationMixer(model);
    const clip = clips.find((c) => c.name === 'Fly') ?? clips[0];
    this.fly = clip ? this.mixer.clipAction(clip) : null;
    this.fly?.setLoop(LoopRepeat, Infinity).play();
    // Size it in its flying pose: the clip moves the body well away from the rest pose.
    this.mixer.update(0);
    fit(model, LENGTH);

    const find = (name: string) => model.getObjectByName(name) ?? null;
    // three.js drops dots from bone names: DEF-neck.004 becomes DEF-neck004.
    this.head = find('DEF-neck004_012');
    this.mouth = find('DEF-Teeth_Top_013') ?? this.head;
    this.chest = find('DEF-Spine003_05') ?? find('DEF-Spine002_04');

    this.heart = glowSprite('rgba(255,240,180,1)', 'rgba(255,90,20,0.75)');
    this.heart.scale.setScalar(0.12);
    // The ember glows through its hide: you always see where to aim.
    (this.heart.material as SpriteMaterial).depthTest = false;
    this.heart.renderOrder = 9;
    this.root.add(this.heart);
    this.breath = glowSprite('rgba(255,250,210,1)', 'rgba(255,120,30,0.8)');
    this.root.add(this.breath);
  }

  /** Points in the root's parent space. */
  headAt(out: Vector3): Vector3 {
    return this.point(this.head, out);
  }

  heartAt(out: Vector3): Vector3 {
    return this.point(this.chest, out);
  }

  mouthAt(out: Vector3): Vector3 {
    return this.point(this.mouth, out);
  }

  private point(bone: Object3D | null, out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    if (!bone) return out.copy(this.root.position).setY(this.root.position.y + LENGTH * 0.3);
    bone.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  /** Rough body size, for hits that miss the weak points. */
  get radius(): number {
    return LENGTH * 0.32;
  }

  flinch(): void {
    this.hurt = 0.7;
  }

  /** `face` is where to turn towards (the player's head), in the parent's space. */
  update(dt: number, face: Vector3): void {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    const h = this.hurt / 0.7;
    this.mixer.update(dt * (1 + this.windup * 0.4));

    // Turn to face you, gently; recoil backwards and up when struck.
    const want = Math.atan2(face.x - this.root.position.x, face.z - this.root.position.z);
    let delta = want - this.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.root.rotation.y += delta * Math.min(1, dt * 2);
    this.body.position.set(0, Math.sin(this.time * 1.7) * 0.025 + h * 0.03 + this.defeat * 0.25, -h * 0.06);
    this.body.rotation.x = -h * 0.25;

    // Struck: the hide flashes hot. Beaten: it burns away to light.
    const flash = Math.max(h, this.defeat);
    for (const { material, emissive } of this.materials) {
      material.emissive.copy(emissive).lerp(new Color(this.defeat > 0 ? 0xffd38a : 0xff3010), flash);
      material.emissiveIntensity = 1 + flash * 1.5;
      if (this.defeat > 0) {
        material.transparent = true;
        material.opacity = 1 - this.defeat;
        material.depthWrite = this.defeat < 0.5;
      }
    }

    this.heartAt(this.tmp);
    this.heart.position.copy(this.root.worldToLocal(this.root.parent!.localToWorld(this.tmp)));
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 3.1);
    (this.heart.material as SpriteMaterial).opacity = (pulse + h) * (1 - this.defeat);
    this.heart.scale.setScalar(0.1 + 0.06 * h + 0.04 * this.windup);

    this.mouthAt(this.tmp);
    this.breath.position.copy(this.root.worldToLocal(this.root.parent!.localToWorld(this.tmp)));
    this.breath.visible = this.windup > 0.02;
    (this.breath.material as SpriteMaterial).opacity = this.windup;
    this.breath.scale.setScalar(0.03 + this.windup * 0.12);
  }
}

/** The phoenix, the Great Lantern's spirit, freed when the dragon falls. */
export class Phoenix {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly glow: Sprite;
  private time = 0;

  static create(): Phoenix | null {
    const gltf = loaded.phoenix;
    return gltf ? new Phoenix(cloneRig(gltf.scene), gltf.animations) : null;
  }

  private constructor(model: Object3D, clips: import('@iwsdk/core').AnimationClip[]) {
    this.root.name = 'Phoenix';
    fit(model, PHOENIX_LENGTH);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        mesh.castShadow = true;
      }
    });
    this.root.add(model);
    this.mixer = new AnimationMixer(model);
    if (clips[0]) this.mixer.clipAction(clips[0]).setLoop(LoopRepeat, Infinity).play();
    this.glow = glowSprite('rgba(255,250,220,0.9)', 'rgba(255,170,60,0.45)');
    this.glow.scale.setScalar(0.5);
    this.glow.position.y = PHOENIX_LENGTH * 0.25;
    this.root.add(this.glow);
  }

  /** Rises from `from`, circling up and round in front of you. */
  update(dt: number, from: Vector3, face: Vector3): void {
    this.time += dt;
    const t = this.time;
    const rise = Math.min(1, t / 3);
    const a = t * 1.1;
    this.root.position.set(
      from.x + Math.sin(a) * 0.22 * rise,
      from.y + rise * 0.18 + Math.sin(t * 2.3) * 0.02,
      from.z + Math.cos(a) * 0.12 * rise,
    );
    // Fly along the circle, banking a little.
    const ahead = Math.atan2(Math.cos(a) * 0.22, -Math.sin(a) * 0.12);
    this.root.rotation.set(0, t > 3 ? Math.atan2(face.x - this.root.position.x, face.z - this.root.position.z) : ahead, Math.sin(a) * 0.25);
    this.root.scale.setScalar(Math.min(1, t / 1.2));
    (this.glow.material as SpriteMaterial).opacity = 0.6 + 0.3 * Math.sin(t * 4);
    this.mixer.update(dt);
  }
}
