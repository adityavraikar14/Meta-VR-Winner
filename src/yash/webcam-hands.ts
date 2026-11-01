/**
 * Development only: drives the hands from a webcam (or a phone used as one)
 * with Google's MediaPipe hand landmarker, so signs can be tried with real
 * fingers before a headset is available. MediaPipe is loaded from a CDN only
 * when this is switched on; nothing is installed and nothing ships in builds.
 *
 * MediaPipe finds 21 points per hand; they are converted to the 25 WebXR
 * joints the rest of the level reads. A single camera only guesses depth, so
 * finger shapes are realistic but hand positions and throw speed are rough.
 */
import { Vector3 } from '@iwsdk/core';
import { HandState, JOINT_COUNT, Side, SIDES } from './hands.js';

/** Pinned, long-stable release (Apache-2.0). */
const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** The camera image is mapped onto an area this wide and tall in front of the player (metres). */
const SPAN_X = 0.7;
const SPAN_Y = 0.5;
/** Image centre sits this far below the eyes. */
const CENTER_DROP = 0.28;
/** Hands are this far ahead when they look REF_SIZE big in the image… */
const BASE_REACH = 0.38;
/** …measured wrist to middle knuckle, as a fraction of the image width. */
const REF_SIZE = 0.11;
/**
 * Metres of reach per unit of apparent size change: bigger in the image = pushed
 * towards the camera. A real 20 cm push at arm's length then reads as about
 * 25 cm, fast enough to throw.
 */
const REACH_GAIN = 5;
const MIN_REACH = 0.2;
const MAX_REACH = 0.65;
/** A hand missing from the camera for longer than this counts as lost. */
const STALE = 0.25;
/**
 * If the hand called "right" sits this far to the left of the "left" one for
 * this many camera frames in a row, the labels are backwards (a mirrored
 * camera): flip them for good.
 */
const CROSSED_BY = 0.06;
const CROSSED_FRAMES = 8;

/** MediaPipe landmark for each WebXR joint; −1 marks a finger metacarpal, which MediaPipe lacks. */
const XR_FROM_MP = [
  0, // wrist
  1, 2, 3, 4, // thumb
  -1, 5, 6, 7, 8, // index
  -1, 9, 10, 11, 12, // middle
  -1, 13, 14, 15, 16, // ring
  -1, 17, 18, 19, 20, // pinky
];

interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface HandLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
  handedness: Array<Array<{ categoryName: string; score: number }>>;
}

interface HandLandmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): HandLandmarkerResult;
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<HandLandmarker>;
  };
}

export interface Camera {
  id: string;
  label: string;
}

export class WebcamHands {
  /** 'off', 'starting camera', 'loading hand model', 'running', or an error message. */
  status = 'off';
  /**
   * MediaPipe labels hands as if the image were mirrored like a selfie. A raw
   * webcam image isn't, so its labels come out swapped; this swaps them back.
   */
  swap = true;
  readonly video: HTMLVideoElement;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private lastFrameTime = -1;
  /** Joints per side in the player's frame (right, up, forward), relative to the eyes. */
  private joints: Record<Side, Float32Array> = {
    left: new Float32Array(JOINT_COUNT * 3),
    right: new Float32Array(JOINT_COUNT * 3),
  };
  private seenAt: Record<Side, number> = { left: -Infinity, right: -Infinity };
  private clock = 0;
  private crossedFrames = 0;
  /** Times the left/right labels were flipped automatically. */
  autoSwaps = 0;
  private right = new Vector3();
  private up = new Vector3(0, 1, 0);
  private p = new Vector3();

  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
  }

  get active(): boolean {
    return this.status === 'running';
  }

  get on(): boolean {
    return this.status !== 'off' && !this.status.startsWith('error');
  }

  async start(deviceId?: string): Promise<void> {
    this.stopCamera();
    try {
      this.status = 'starting camera';
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { width: 640, height: 480 },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      if (!this.landmarker) {
        this.status = 'loading hand model';
        const vision = (await import(/* @vite-ignore */ `${MEDIAPIPE}/vision_bundle.mjs`)) as VisionModule;
        const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      }
      if (this.stream) this.status = 'running';
    } catch (error) {
      this.stopCamera();
      this.status = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  stop(): void {
    this.stopCamera();
    this.status = 'off';
  }

  /** Cameras the browser can see; labels appear once camera permission is granted. */
  async cameras(): Promise<Camera[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  }

  /** Reads the newest camera frame, if there is one, writes the hands it saw and marks them in `seen`. */
  apply(
    dt: number,
    time: number,
    head: Vector3,
    forward: Vector3,
    hands: Record<Side, HandState>,
    seen: Record<Side, boolean>,
  ): void {
    this.clock += dt;
    if (!this.active || !this.landmarker) return;
    this.detect();
    this.right.set(-forward.z, 0, forward.x);
    for (const side of SIDES) {
      if (this.clock - this.seenAt[side] > STALE) continue;
      const hand = hands[side];
      const src = this.joints[side];
      for (let i = 0; i < JOINT_COUNT; i++) {
        this.p
          .copy(head)
          .addScaledVector(this.right, src[i * 3])
          .addScaledVector(this.up, src[i * 3 + 1])
          .addScaledVector(forward, src[i * 3 + 2]);
        hand.joints[i * 3] = this.p.x;
        hand.joints[i * 3 + 1] = this.p.y;
        hand.joints[i * 3 + 2] = this.p.z;
      }
      hand.tracked = true;
      hand.lostFor = 0;
      hand.update(time);
      seen[side] = true;
    }
  }

  /** Hands seen on the latest camera frame, for the status line. */
  visible(): string {
    const fresh = (side: Side) => this.clock - this.seenAt[side] <= STALE;
    return `${fresh('left') ? 'L' : '–'} ${fresh('right') ? 'R' : '–'}`;
  }

  private detect(): void {
    const video = this.video;
    if (!this.landmarker || video.readyState < 2 || video.currentTime === this.lastFrameTime) return;
    this.lastFrameTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, performance.now());
    const aspect = video.videoHeight / (video.videoWidth || 1);
    const sideOf = (i: number): Side => {
      const label: Side = result.handedness[i]?.[0]?.categoryName === 'Left' ? 'left' : 'right';
      return this.swap ? (label === 'left' ? 'right' : 'left') : label;
    };

    // Two hands seen: if "right" keeps turning up on the player's left, the labels are backwards.
    if (result.landmarks.length === 2 && sideOf(0) !== sideOf(1)) {
      const r = sideOf(0) === 'right' ? 0 : 1;
      // Camera x grows towards the player's left (see convert), so a smaller x is further right.
      const crossed = result.landmarks[r][0].x - result.landmarks[1 - r][0].x > CROSSED_BY;
      this.crossedFrames = crossed ? this.crossedFrames + 1 : 0;
      if (this.crossedFrames >= CROSSED_FRAMES) {
        this.swap = !this.swap;
        this.autoSwaps++;
        this.crossedFrames = 0;
      }
    }

    const taken: Record<Side, boolean> = { left: false, right: false };
    result.landmarks.forEach((image, i) => {
      const side = sideOf(i);
      if (taken[side]) return;
      taken[side] = true;
      this.convert(image, result.worldLandmarks[i], aspect, this.joints[side]);
      this.seenAt[side] = this.clock;
    });
  }

  /**
   * Places one hand in front of the player. The camera faces the player, so
   * its right is the player's left, its down is down and its depth points
   * back at the player: (x, y, z) → (−x, −y, −z) in (right, up, forward).
   */
  private convert(image: Landmark[], world: Landmark[], aspect: number, out: Float32Array): void {
    const palmX = image[0].x + (image[9].x - image[0].x) * 0.6;
    const palmY = image[0].y + (image[9].y - image[0].y) * 0.6;
    const size = Math.hypot(image[9].x - image[0].x, (image[9].y - image[0].y) * aspect);
    const right = -(palmX - 0.5) * SPAN_X;
    const up = -(palmY - 0.5) * SPAN_Y - CENTER_DROP;
    const reach = Math.min(MAX_REACH, Math.max(MIN_REACH, BASE_REACH + (size - REF_SIZE) * REACH_GAIN));

    // World landmarks are in metres around the hand; centre them on the palm.
    const cx = world[0].x + (world[9].x - world[0].x) * 0.6;
    const cy = world[0].y + (world[9].y - world[0].y) * 0.6;
    const cz = world[0].z + (world[9].z - world[0].z) * 0.6;
    for (let j = 0; j < JOINT_COUNT; j++) {
      const m = XR_FROM_MP[j];
      let x: number;
      let y: number;
      let z: number;
      if (m >= 0) {
        x = world[m].x;
        y = world[m].y;
        z = world[m].z;
      } else {
        // Metacarpal joint: a third of the way from the wrist to the finger's knuckle.
        const knuckle = world[XR_FROM_MP[j + 1]];
        x = world[0].x + (knuckle.x - world[0].x) * 0.3;
        y = world[0].y + (knuckle.y - world[0].y) * 0.3;
        z = world[0].z + (knuckle.z - world[0].z) * 0.3;
      }
      out[j * 3] = right - (x - cx);
      out[j * 3 + 1] = up - (y - cy);
      out[j * 3 + 2] = reach - (z - cz);
    }
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastFrameTime = -1;
    this.seenAt.left = this.seenAt.right = -Infinity;
  }
}
