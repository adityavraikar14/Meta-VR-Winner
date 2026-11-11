/**
 * The dragon, copied from Aditya's src/fight/dragon3d.ts so this level stays
 * separate from the shadow levels: the same model (European Dragon by Regina
 * Cachoa, CC BY 4.0, credited in CREDITS.md), the same jewelled scales, wings,
 * ember heart and fire in the jaws. Only the size is new: it is a parameter
 * here, because this boss fights from further away.
 */
import {
  AdditiveBlending,
  type AnimationAction,
  type AnimationClip,
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
  Vector3,
} from '@iwsdk/core';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';

const DRAGON_URL = 'gltf/dragon.glb';
/** The length the original's sprite sizes and bob were tuned for, metres. */
const ORIGINAL_LENGTH = 0.78;

let loading: Promise<GLTF | null> | null = null;

/** Loads the model once, retrying a slow or failed load. Null if it can't be loaded. */
export function loadDragon(): Promise<GLTF | null> {
  loading ??= (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${DRAGON_URL}`);
      } catch (error) {
        console.warn(`Could not load the dragon (try ${attempt + 1})`, error);
        await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
      }
    }
    return null;
  })();
  return loading;
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
 * sapphire, emerald, crimson and gold from one end to the other. Its scale
 * texture is a dark grey, so multiplying would leave it near black: instead
 * the texture's brightness is kept only as detail, so every scale still
 * shows in full colour, with a faint glow of its own like a gem.
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
        vec3 c0 = vec3(0.08, 0.32, 1.0);
        vec3 c1 = vec3(0.04, 0.8, 0.38);
        vec3 c2 = vec3(0.95, 0.1, 0.12);
        vec3 c3 = vec3(1.0, 0.68, 0.06);
        float t = vAlong;
        vec3 tint = t < 0.33 ? mix(c0, c1, t / 0.33) : t < 0.66 ? mix(c1, c2, (t - 0.33) / 0.33) : mix(c2, c3, (t - 0.66) / 0.34);
        float scale = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.06, 0.3, 1.8);
        diffuseColor.rgb = tint * 0.6 * scale;
        vec3 gemGlow = tint * scale * 0.07;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gemGlow;');
  };
  material.customProgramCacheKey = () => 'dragon-rainbow';
}

export class DragonModel {
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
  /** Sprites and bobbing scale with the dragon. */
  private readonly size: number;
  private time = 0;
  private hurt = 0;
  /** 0 → 1 as it draws breath. */
  windup = 0;
  /** 0 → 1 as it burns away. */
  defeat = 0;
  private readonly tmp = new Vector3();

  constructor(gltf: GLTF, private readonly length: number) {
    this.size = length / ORIGINAL_LENGTH;
    const model = cloneRig(gltf.scene);
    const clips: AnimationClip[] = gltf.animations;
    this.root.name = 'DragonBoss';
    this.body.add(model);
    this.root.add(this.body);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const own = list.map((m) => {
        const c = (m as MeshStandardMaterial).clone();
        if ((c as MeshStandardMaterial).isMeshStandardMaterial) {
          this.materials.push({ material: c, emissive: c.emissive.clone() });
          // Only the hide: its teeth and eyes keep their own colours.
          if (c.name === 'Low_Poly_Bake') rainbowScales(c as MeshStandardMaterial, box.min.z, box.max.z);
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
    fit(model, length);

    const find = (name: string) => model.getObjectByName(name) ?? null;
    // three.js drops dots from bone names: DEF-neck.004 becomes DEF-neck004.
    this.head = find('DEF-neck004_012');
    this.mouth = find('DEF-Teeth_Top_013') ?? this.head;
    this.chest = find('DEF-Spine003_05') ?? find('DEF-Spine002_04');

    this.heart = glowSprite('rgba(255,240,180,1)', 'rgba(255,90,20,0.75)');
    this.heart.scale.setScalar(0.12 * this.size);
    // The ember glows through its hide: you always see where to aim.
    (this.heart.material as SpriteMaterial).depthTest = false;
    this.heart.renderOrder = 9;
    this.root.add(this.heart);
    this.breath = glowSprite('rgba(255,250,210,1)', 'rgba(255,120,30,0.8)');
    this.root.add(this.breath);
  }

  /** Points in the root's parent space. */
  heartAt(out: Vector3): Vector3 {
    return this.point(this.chest, out);
  }

  mouthAt(out: Vector3): Vector3 {
    return this.point(this.mouth, out);
  }

  private point(bone: Object3D | null, out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    if (!bone) return out.copy(this.root.position).setY(this.root.position.y + this.length * 0.3);
    bone.getWorldPosition(out);
    return this.root.parent ? this.root.parent.worldToLocal(out) : out;
  }

  /** Rough body size, for hits. */
  get radius(): number {
    return this.length * 0.32;
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
    const s = this.size;
    this.body.position.set(0, (Math.sin(this.time * 1.7) * 0.025 + h * 0.03 + this.defeat * 0.25) * s, -h * 0.06 * s);
    this.body.rotation.x = -h * 0.25;

    // Struck: the hide flashes hot. Beaten: it burns away to light.
    const flash = Math.max(h, this.defeat);
    for (const { material, emissive } of this.materials) {
      material.emissive.copy(emissive).lerp(this.flashColor(), flash);
      material.emissiveIntensity = 1 + flash * 1.5;
      material.transparent = this.defeat > 0;
      material.opacity = 1 - this.defeat;
      material.depthWrite = this.defeat < 0.5;
    }

    this.heartAt(this.tmp);
    this.heart.position.copy(this.root.worldToLocal(this.root.parent!.localToWorld(this.tmp)));
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 3.1);
    (this.heart.material as SpriteMaterial).opacity = (pulse + h) * (1 - this.defeat);
    this.heart.scale.setScalar((0.1 + 0.06 * h + 0.04 * this.windup) * s);

    this.mouthAt(this.tmp);
    this.breath.position.copy(this.root.worldToLocal(this.root.parent!.localToWorld(this.tmp)));
    this.breath.visible = this.windup > 0.02;
    (this.breath.material as SpriteMaterial).opacity = this.windup;
    this.breath.scale.setScalar((0.03 + this.windup * 0.12) * s);
  }

  private flashColor(): Color {
    return this.tmpColor.setHex(this.defeat > 0 ? 0xffd38a : 0xff3010);
  }

  private readonly tmpColor = new Color();
}
