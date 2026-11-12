import { buildSky, MoodLight, skyOn } from './sky.js';
import {
  CanvasTexture,
  Color,
  createSystem,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  ShadowMaterial,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
  WebGLRenderTarget,
} from '@iwsdk/core';
import {
  MASK_HEIGHT,
  MASK_WIDTH,
  PAPER_HEIGHT,
  PAPER_WIDTH,
  stage,
} from './stage-state.js';
import { devInfo } from './dev-tools.js';
import { webcam } from './webcam.js';
import { HandSkeleton } from './yash/sim-hands.js';

/** WebXR hand joint order: wrist, thumb (4), then index/middle/ring/pinky (5 each). */
const JOINT_COUNT = 25;
const WRIST = 0;
const MIDDLE_METACARPAL = 10;

/** Pairs of joints joined by a shadow-casting cylinder. */
export const FINGER_BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
  [0, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 20], [20, 21], [21, 22], [22, 23], [23, 24],
];
/** Thick bones that fill in the palm between the knuckles and the wrist. */
export const PALM_BONES: ReadonlyArray<readonly [number, number]> = [
  [6, 11], [11, 16], [16, 21],
  [0, 6], [0, 11], [0, 16], [0, 21],
];
const BONE_COUNT = FINGER_BONES.length + PALM_BONES.length;
const PALM_RADIUS = 0.02;
const MIN_JOINT_RADIUS = 0.007;
const FOREARM_LENGTH = 0.28;
const FOREARM_RADIUS = 0.028;

/** Layer that holds only the parts of the hands used for shape matching. */
const MASK_LAYER = 1;
/** Read the mask back every N frames. */
const MASK_INTERVAL = 3;

/** Paper sits this far in front of the eyes, and this far below them. */
const PAPER_DISTANCE = 1.0;
const PAPER_DROP = 0.12;
/**
 * The lantern sits just behind and below the eyes. Low enough that a hand's
 * shadow lands well above the hand in view, high enough that hands held
 * anywhere from chin to chest stay on the paper.
 */
const LANTERN_BACK = 0.1;
const LANTERN_DROP = 0.22;

/** WebXR Hand Input batch queries, missing from the bundled XRFrame types. */
interface XRHandFrame {
  fillPoses(spaces: XRSpace[], baseSpace: XRSpace, transforms: Float32Array): boolean;
  fillJointRadii(spaces: XRJointSpace[], radii: Float32Array): boolean;
}

interface HandRig {
  root: Group;
  joints: InstancedMesh;
  bones: InstancedMesh;
  forearm: Mesh;
  /** Draws this hand into its own mask channel: left red, right green. */
  maskMaterial: MeshBasicMaterial;
  /** Forearms go in blue: solid ground in the shadow world, ignored by matching. */
  forearmMask: MeshBasicMaterial;
  jointSpaces: XRJointSpace[] | null;
  source: XRInputSource | null;
}

/**
 * Builds the paper screen and the lantern, turns tracked hands into invisible
 * shadow casters, and renders the shadow mask the game matches against.
 */
export class ShadowStageSystem extends createSystem({}) {
  private sky!: Mesh;
  private mood!: MoodLight;
  private paper!: Group;
  private lantern!: SpotLight;
  private maskCamera!: PerspectiveCamera;
  private maskTarget!: WebGLRenderTarget;
  private casterMaterial!: MeshBasicMaterial;
  private hands!: HandRig[];
  private poses!: Float32Array;
  private radii!: Float32Array;
  private needsLayout = true;
  private frameCount = 0;
  private readPending = false;
  /** The mask still shows hands that have since left; clear it once they go. */
  private maskStale = false;
  /** Draw calls and triangles of the last full view render (for dev info). */
  private mainCalls = 0;
  private mainTriangles = 0;

  private a = new Vector3();
  private b = new Vector3();
  private mid = new Vector3();
  private dir = new Vector3();
  private scale = new Vector3();
  private quat = new Quaternion();
  private mat = new Matrix4();
  private up = new Vector3(0, 1, 0);
  private headPos = new Vector3();
  private headDir = new Vector3();
  /** Webcam hand joints, before they are written into the poses. */
  private camJoints = new Float32Array(JOINT_COUNT * 3);
  private camQuat = new Quaternion();
  /** Visible stand-ins for webcam hands; the shadow casters themselves draw nothing. */
  private skeletons: HandSkeleton[] = [];
  private clearColor = new Color();

  init(): void {
    // A bright sky around you where passthrough is black and white (Quest 2) or absent (desktop).
    this.sky = buildSky(this.scene);
    this.mood = new MoodLight(this.scene);
    // A sharper picture in the headset: render a fifth more pixels each way than the default.
    // (Must be set before the session starts; it costs frame time, so not more than this.)
    this.renderer.xr.setFramebufferScaleFactor(1.2);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.paper = new Group();
    this.paper.name = 'PaperScreen';
    this.buildPaper();
    this.buildLantern();
    stage.paperEntity = this.world.createTransformEntity(this.paper);
    stage.paper = this.paper;

    this.poses = new Float32Array(JOINT_COUNT * 16);
    this.radii = new Float32Array(JOINT_COUNT);
    this.casterMaterial = new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    });
    this.hands = [this.buildHand('left', 0xff0000), this.buildHand('right', 0x00ff00)];
    this.skeletons = [new HandSkeleton(0xffd9a8), new HandSkeleton(0xffd9a8)];
    for (const skeleton of this.skeletons) {
      skeleton.root.visible = false;
      this.player.add(skeleton.root);
    }

    this.maskTarget = new WebGLRenderTarget(MASK_WIDTH, MASK_HEIGHT, {
      depthBuffer: false,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
    });
    this.maskCamera = new PerspectiveCamera();
    this.maskCamera.layers.set(MASK_LAYER);
    this.paper.add(this.maskCamera);
    this.layoutLantern();

    devInfo.render = () => {
      const info = this.renderer.info;
      return {
        calls: this.mainCalls,
        triangles: this.mainTriangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      };
    };
    devInfo.meshes = () => {
      const groups: Record<string, number[]> = {};
      this.scene.traverseVisible((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        let top: Object3D = o;
        while (top.parent && top.parent.parent && top.parent.parent !== this.scene && top.parent.name !== 'PaperScreen') top = top.parent;
        const key = top.name || top.type;
        const g = (groups[key] ??= [0, 0, 0]);
        g[0]++;
        if (mesh.castShadow) g[1]++;
        g[2] += mesh.geometry.index ? mesh.geometry.index.count / 3 : (mesh.geometry.attributes.position?.count ?? 0) / 3;
      });
      return groups;
    };

    this.cleanupFuncs.push(
      this.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Visible) this.needsLayout = true;
      }),
    );
  }

  update(delta: number): void {
    this.sky.visible = skyOn();
    this.mood.update(delta, stage.moodWorld);
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    if (stage.command === 'recenter') {
      stage.command = null;
      this.needsLayout = true;
    }
    if (this.needsLayout) this.layoutPaper();
    // In the fights, webcam hands (dev only) stand in for the headset's.
    const camera = webcam.poll(Math.min(delta, 0.1)) && stage.fight;
    if (camera) this.updateWebcamHands();
    else this.updateHands();
    if (!camera) for (const skeleton of this.skeletons) skeleton.root.visible = false;
    this.frameCount++;
    if (
      !this.readPending &&
      stage.handCount > 0 &&
      this.frameCount % MASK_INTERVAL === 0
    ) {
      this.renderMask();
    } else if (stage.handCount === 0 && this.maskStale && !this.readPending) {
      stage.mask.fill(0);
      stage.maskVersion++;
      this.maskStale = false;
    }
  }

  private buildPaper(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round((512 * PAPER_HEIGHT) / PAPER_WIDTH);
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.45, 20,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.62,
    );
    // A lightbox panel: bright white in the middle, a cool soft falloff to the edges.
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.65, '#f4f7fb');
    glow.addColorStop(1, '#dfe6ef');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    const paperMesh = new Mesh(
      new PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT),
      new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.97 }),
    );
    paperMesh.name = 'PaperSurface';
    this.paper.add(paperMesh);


    // Crisp, deep navy shadows on the white screen.
    const shadowMaterial = new ShadowMaterial({
      color: 0x0b1430,
      opacity: 0.9,
      depthWrite: false,
    });
    const shadowCatcher = new Mesh(
      new PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT),
      shadowMaterial,
    );
    shadowCatcher.name = 'ShadowCatcher';
    shadowCatcher.position.z = 0.003;
    shadowCatcher.receiveShadow = true;
    shadowCatcher.renderOrder = 2;
    this.paper.add(shadowCatcher);
    stage.shadowMaterial = shadowMaterial;
  }

  private buildLantern(): void {
    this.lantern = new SpotLight(0xffd9a0, 1);
    this.lantern.name = 'Lantern';
    this.lantern.castShadow = true;
    this.lantern.penumbra = 0.4;
    // A fine shadow map, so the edge of your hand's shadow is crisp on the screen.
    this.lantern.shadow.mapSize.set(2048, 2048);
    this.lantern.shadow.bias = -0.0005;
    this.lantern.shadow.camera.near = 0.05;
    this.paper.add(this.lantern);
    this.paper.add(this.lantern.target);
  }

  private buildHand(name: string, maskColor: number): HandRig {
    const material = this.casterMaterial;
    const root = new Group();
    root.name = `HandShadow_${name}`;
    root.visible = false;

    const joints = new InstancedMesh(
      new SphereGeometry(1, 10, 8),
      material,
      JOINT_COUNT,
    );
    const bones = new InstancedMesh(
      new CylinderGeometry(1, 1, 1, 10, 1),
      material,
      BONE_COUNT,
    );
    const forearm = new Mesh(
      new CylinderGeometry(FOREARM_RADIUS, FOREARM_RADIUS * 1.15, FOREARM_LENGTH, 12),
      material,
    );
    for (const mesh of [joints, bones, forearm]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      root.add(mesh);
    }
    // The forearm is drawn into its own channel, which matching ignores so
    // the score does not depend on how much arm is in view.
    joints.layers.enable(MASK_LAYER);
    bones.layers.enable(MASK_LAYER);
    forearm.layers.enable(MASK_LAYER);

    this.player.add(root);
    return {
      root,
      joints,
      bones,
      forearm,
      maskMaterial: new MeshBasicMaterial({ color: maskColor }),
      // Drawn first without depth, so the hand always wins where they overlap.
      forearmMask: new MeshBasicMaterial({ color: 0x0000ff, depthTest: false, depthWrite: false }),
      jointSpaces: null,
      source: null,
    };
  }

  /** Places the paper in front of the viewer, facing them. */
  private layoutPaper(): void {
    const inXR = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    const viewer: Object3D = inXR ? this.player.head : this.camera;
    viewer.updateWorldMatrix(true, false);
    viewer.getWorldPosition(this.headPos);
    if (inXR && this.headPos.y < 0.3) return; // No head pose yet.
    viewer.getWorldDirection(this.headDir);
    // Cameras look down -Z; getWorldDirection returns +Z for them.
    this.headDir.negate();
    this.headDir.y = 0;
    if (this.headDir.lengthSq() < 1e-6) this.headDir.set(0, 0, -1);
    this.headDir.normalize();

    this.paper.position
      .copy(this.headPos)
      .addScaledVector(this.headDir, PAPER_DISTANCE);
    this.paper.position.y -= PAPER_DROP;
    this.paper.rotation.set(0, Math.atan2(-this.headDir.x, -this.headDir.z), 0);
    this.paper.updateMatrixWorld(true);
    this.needsLayout = false;
  }

  /** Lantern and mask camera live in paper space, behind the viewer. */
  private layoutLantern(): void {
    const lx = 0;
    const ly = PAPER_DROP - LANTERN_DROP;
    const d = PAPER_DISTANCE + LANTERN_BACK;
    this.lantern.position.set(lx, ly, d);
    stage.lantern = [lx, ly, d];
    this.lantern.target.position.set(0, 0, 0);
    const reachX = PAPER_WIDTH / 2 + Math.abs(lx);
    const reachY = PAPER_HEIGHT / 2 + Math.abs(ly);
    this.lantern.angle = Math.atan(Math.hypot(reachX, reachY) / d) + 0.08;
    this.lantern.shadow.camera.far = d + 0.3;

    // Off-axis frustum whose far plane is exactly the paper rectangle, so each
    // mask pixel maps to a fixed spot on the paper.
    const near = 0.05;
    const k = near / d;
    this.maskCamera.position.set(lx, ly, d);
    this.maskCamera.near = near;
    this.maskCamera.far = d + 0.01;
    this.maskCamera.projectionMatrix.makePerspective(
      (-PAPER_WIDTH / 2 - lx) * k,
      (PAPER_WIDTH / 2 - lx) * k,
      (PAPER_HEIGHT / 2 - ly) * k,
      (-PAPER_HEIGHT / 2 - ly) * k,
      near,
      d + 0.01,
    );
    this.maskCamera.projectionMatrixInverse
      .copy(this.maskCamera.projectionMatrix)
      .invert();
  }

  private updateHands(): void {
    stage.handCount = 0;
    const frame = this.xrFrame;
    const refSpace = this.renderer.xr.getReferenceSpace();
    for (const hand of this.hands) hand.source = null;
    if (frame && refSpace) {
      for (const source of frame.session.inputSources) {
        if (!source.hand) continue;
        const hand = this.hands[source.handedness === 'left' ? 0 : 1];
        if (hand.source !== null) continue;
        hand.source = source;
        if (hand.jointSpaces === null || hand.jointSpaces.length !== JOINT_COUNT) {
          hand.jointSpaces = Array.from(source.hand.values());
        }
        hand.root.visible = this.poseHand(hand, frame, refSpace);
        if (hand.root.visible) {
          stage.handCount++;
          const out = stage.joints[source.handedness === 'left' ? 0 : 1];
          for (let i = 0; i < JOINT_COUNT; i++) {
            out[i * 3] = this.poses[i * 16 + 12];
            out[i * 3 + 1] = this.poses[i * 16 + 13];
            out[i * 3 + 2] = this.poses[i * 16 + 14];
          }
        }
      }
    }
    for (let i = 0; i < this.hands.length; i++) {
      const hand = this.hands[i];
      if (hand.source === null) {
        hand.root.visible = false;
        hand.jointSpaces = null;
      }
      stage.tracked[i] = hand.root.visible;
    }
  }

  /** Webcam hands, placed in front of the eyes in the player's space, in place of tracked ones. */
  private updateWebcamHands(): void {
    stage.handCount = 0;
    // The rigs hang under the player, so the eyes and their facing are taken in its space.
    this.player.head.getWorldPosition(this.headPos);
    this.player.worldToLocal(this.headPos);
    this.player.head.getWorldQuaternion(this.camQuat).premultiply(this.player.getWorldQuaternion(this.quat).invert());
    this.headDir.set(0, 0, -1).applyQuaternion(this.camQuat);
    this.headDir.y = 0;
    if (this.headDir.lengthSq() < 1e-6) this.headDir.set(0, 0, -1);
    this.headDir.normalize();
    for (let i = 0; i < this.hands.length; i++) {
      const hand = this.hands[i];
      hand.source = null;
      hand.jointSpaces = null;
      const seen = webcam.write(i === 0 ? 'left' : 'right', this.headPos, this.headDir, this.camJoints);
      hand.root.visible = seen;
      stage.tracked[i] = seen;
      this.skeletons[i].root.visible = seen;
      if (!seen) continue;
      stage.handCount++;
      stage.joints[i].set(this.camJoints);
      const joints = this.camJoints;
      this.skeletons[i].update({ joint: (j, out) => out.set(joints[j * 3], joints[j * 3 + 1], joints[j * 3 + 2]) });
      this.poses.fill(0);
      for (let j = 0; j < JOINT_COUNT; j++) {
        const o = j * 16;
        this.poses[o] = this.poses[o + 5] = this.poses[o + 10] = this.poses[o + 15] = 1;
        this.poses[o + 12] = this.camJoints[j * 3];
        this.poses[o + 13] = this.camJoints[j * 3 + 1];
        this.poses[o + 14] = this.camJoints[j * 3 + 2];
      }
      this.radii.fill(MIN_JOINT_RADIUS * 1.3);
      this.drawRig(hand);
    }
  }

  private poseHand(
    hand: HandRig,
    frame: XRFrame,
    refSpace: XRReferenceSpace,
  ): boolean {
    const spaces = hand.jointSpaces!;
    const handFrame = frame as unknown as XRHandFrame;
    if (!handFrame.fillPoses(spaces, refSpace, this.poses)) return false;
    if (!handFrame.fillJointRadii(spaces, this.radii)) {
      this.radii.fill(MIN_JOINT_RADIUS);
    }
    this.drawRig(hand);
    return true;
  }

  /** Places a hand's joints, bones and forearm from the current poses and radii. */
  private drawRig(hand: HandRig): void {
    for (let i = 0; i < JOINT_COUNT; i++) {
      const r = Math.max(this.radii[i], MIN_JOINT_RADIUS);
      this.jointPosition(i, this.a);
      this.mat.makeScale(r, r, r).setPosition(this.a);
      hand.joints.setMatrixAt(i, this.mat);
    }
    let index = 0;
    for (const [from, to] of FINGER_BONES) {
      const r = Math.max(Math.min(this.radii[from], this.radii[to]), MIN_JOINT_RADIUS);
      this.setBone(hand.bones, index++, from, to, r);
    }
    for (const [from, to] of PALM_BONES) {
      this.setBone(hand.bones, index++, from, to, PALM_RADIUS);
    }
    hand.joints.instanceMatrix.needsUpdate = true;
    hand.bones.instanceMatrix.needsUpdate = true;

    // Forearm extends from the wrist, away from the fingers.
    this.jointPosition(WRIST, this.a);
    this.jointPosition(MIDDLE_METACARPAL, this.b);
    this.dir.subVectors(this.a, this.b).normalize();
    hand.forearm.position.copy(this.a).addScaledVector(this.dir, FOREARM_LENGTH / 2);
    hand.forearm.quaternion.setFromUnitVectors(this.up, this.dir);
  }

  private jointPosition(joint: number, out: Vector3): Vector3 {
    const o = joint * 16;
    return out.set(this.poses[o + 12], this.poses[o + 13], this.poses[o + 14]);
  }

  private setBone(
    mesh: InstancedMesh,
    index: number,
    from: number,
    to: number,
    radius: number,
  ): void {
    this.jointPosition(from, this.a);
    this.jointPosition(to, this.b);
    this.dir.subVectors(this.b, this.a);
    const length = this.dir.length();
    if (length < 1e-5) {
      this.mat.makeScale(0, 0, 0);
    } else {
      this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.quat.setFromUnitVectors(this.up, this.dir.divideScalar(length));
      this.scale.set(radius, length, radius);
      this.mat.compose(this.mid, this.quat, this.scale);
    }
    mesh.setMatrixAt(index, this.mat);
  }

  /** Renders the hands, red/green on black, from the lantern onto the paper. */
  private renderMask(): void {
    const renderer = this.renderer;
    const scene = this.scene;
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    renderer.getClearColor(this.clearColor);
    const previousAlpha = renderer.getClearAlpha();
    const xrEnabled = renderer.xr.enabled;
    const previousShadowAuto = renderer.shadowMap.autoUpdate;

    this.maskCamera.updateMatrixWorld();
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    scene.overrideMaterial = null;
    scene.background = null;
    for (const hand of this.hands) {
      hand.joints.material = hand.maskMaterial;
      hand.bones.material = hand.maskMaterial;
      hand.forearm.material = hand.forearmMask;
      hand.forearm.renderOrder = -1;
    }
    // Keep the main view's numbers before this small pass overwrites them.
    this.mainCalls = renderer.info.render.calls;
    this.mainTriangles = renderer.info.render.triangles;
    renderer.setRenderTarget(this.maskTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(scene, this.maskCamera);

    for (const hand of this.hands) {
      hand.joints.material = this.casterMaterial;
      hand.bones.material = this.casterMaterial;
      hand.forearm.material = this.casterMaterial;
      hand.forearm.renderOrder = 0;
    }
    renderer.setClearColor(this.clearColor, previousAlpha);
    renderer.setRenderTarget(previousTarget);
    scene.background = previousBackground;
    scene.overrideMaterial = previousOverride;
    renderer.shadowMap.autoUpdate = previousShadowAuto;
    renderer.xr.enabled = xrEnabled;

    this.readPending = true;
    this.maskStale = true;
    renderer
      .readRenderTargetPixelsAsync(
        this.maskTarget,
        0,
        0,
        MASK_WIDTH,
        MASK_HEIGHT,
        stage.mask,
      )
      .then(() => {
        stage.maskVersion++;
      })
      .catch(() => {})
      .finally(() => {
        this.readPending = false;
      });
  }
}
