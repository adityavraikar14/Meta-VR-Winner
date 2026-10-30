import {
  CanvasTexture,
  Color,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  VisibilityState,
} from '@iwsdk/core';
import { playAwaken, playPrompt } from './audio.js';
import { installDevTools } from './dev-tools.js';
import {
  createExtension,
  fingersUp,
  readExtension,
  scoreShape,
  type Finger,
  type ShapeScore,
} from './hand-pose.js';
import {
  HINT_DELAY,
  LEVELS,
  MATCH_HOLD,
  MATCH_THRESHOLD,
} from './levels.js';
import {
  copyBounds,
  createBounds,
  decodeCells,
  encodeCells,
  GRID,
  GRID_CELLS,
  type MaskBounds,
  MaskChannel,
  normalizeMask,
} from './matcher.js';
import {
  MASK_HEIGHT,
  MASK_WIDTH,
  PAPER_HEIGHT,
  PAPER_WIDTH,
  stage,
} from './stage-state.js';

type Phase = 'matching' | 'awakening' | 'resting';
type Problem = Finger | 'direction' | 'offPaper' | 'noShadow' | null;

const OUTLINE_SIZE = 0.4;
const SHADOW_OPACITY = 0.88;
const AWAKEN_SHIVER = 0.45;
const AWAKEN_DURATION = 1.8;
/** Time to watch the creature step out and land before the next shape. */
const REST_DURATION = 3.5;

const DIM_OUTLINE = new Color(0x9a7442);
const HOT_OUTLINE = new Color(0xffc34d);

const DEV = import.meta.env.DEV;
const HAND_CHANNELS = [MaskChannel.Left, MaskChannel.Right] as const;

/**
 * Runs the level loop: show a target silhouette, judge the player's hand
 * shape, and when it matches, release the shadow as a living creature.
 */
export class ShadowGameSystem extends createSystem({}) {
  private phase: Phase = 'matching';
  private phaseTime = 0;
  private levelIndex = 0;
  private outlineCells: Uint8Array = new Uint8Array(GRID_CELLS);

  /** The best hand's shadow this frame, for capture and creature placement. */
  private shadow = new Uint8Array(GRID_CELLS);
  private bounds = createBounds();
  private hasShadow = false;
  private candidate = new Uint8Array(GRID_CELLS);
  private candidateBounds = createBounds();
  private handShadow = [false, false];
  private handBounds = [createBounds(), createBounds()];
  private seenMaskVersion = -1;

  private extension = createExtension();
  private shapeScore: ShapeScore = { score: 0, worst: null };
  private handScores = [0, 0];
  private rawScore = 0;
  private score = 0;
  private problem: Problem = null;
  private holdTime = 0;
  private struggleTime = 0;
  private needsRelease = false;

  private outline!: Mesh;
  private outlineMaterial!: MeshBasicMaterial;
  private outlineCanvas!: HTMLCanvasElement;
  private outlineTexture!: CanvasTexture;
  private creature!: Mesh;
  private creatureMaterial!: MeshBasicMaterial;
  private creatureCanvas!: HTMLCanvasElement;
  private creatureTexture!: CanvasTexture;
  private captionCanvas!: HTMLCanvasElement;
  private captionTexture!: CanvasTexture;
  private caption = '';

  private creatureX = 0;
  private creatureY = 0;
  private creatureSize = OUTLINE_SIZE;

  init(): void {
    const paper = stage.paper;
    if (!paper) throw new Error('ShadowStageSystem must be registered first');

    this.outlineCanvas = makeCanvas(256, 256);
    this.outlineTexture = makeTexture(this.outlineCanvas);
    this.outlineMaterial = new MeshBasicMaterial({
      map: this.outlineTexture,
      transparent: true,
      depthWrite: false,
      color: DIM_OUTLINE.clone(),
      opacity: 0.45,
    });
    this.outline = new Mesh(new PlaneGeometry(1, 1), this.outlineMaterial);
    this.outline.name = 'TargetOutline';
    this.outline.scale.setScalar(OUTLINE_SIZE);
    this.outline.position.set(0, 0.02, 0.002);
    this.outline.renderOrder = 1;
    paper.add(this.outline);

    this.creatureCanvas = makeCanvas(256, 256);
    this.creatureTexture = makeTexture(this.creatureCanvas);
    this.creatureMaterial = new MeshBasicMaterial({
      map: this.creatureTexture,
      transparent: true,
      depthWrite: false,
      color: 0x140b05,
    });
    this.creature = new Mesh(new PlaneGeometry(1, 1), this.creatureMaterial);
    this.creature.name = 'ShadowCreature';
    this.creature.position.z = 0.005;
    this.creature.renderOrder = 3;
    this.creature.visible = false;
    paper.add(this.creature);

    this.captionCanvas = makeCanvas(1024, 112);
    this.captionTexture = makeTexture(this.captionCanvas);
    const captionMesh = new Mesh(
      new PlaneGeometry(PAPER_WIDTH * 0.9, (PAPER_WIDTH * 0.9 * 112) / 1024),
      new MeshBasicMaterial({ map: this.captionTexture, transparent: true }),
    );
    captionMesh.name = 'Caption';
    captionMesh.position.set(0, PAPER_HEIGHT / 2 + 0.075, 0.002);
    paper.add(captionMesh);

    this.startLevel(0);

    installDevTools({
      capture: () => (this.hasShadow ? encodeCells(this.shadow) : ''),
      maskVersion: () => stage.maskVersion,
      next: () => this.startLevel((this.levelIndex + 1) % LEVELS.length),
      info: () => {
        const right = readExtension(stage.joints[1], createExtension());
        return {
          phase: this.phase,
          level: LEVELS[this.levelIndex].id,
          hands: stage.handCount,
          maskVersion: stage.maskVersion,
          score: Number(this.score.toFixed(3)),
          problem: this.problem,
          right: stage.tracked[1]
            ? {
                ext: Object.fromEntries(
                  Object.entries(right).map(([k, v]) => [k, Number(v.toFixed(2))]),
                ),
                up: Number(fingersUp(stage.joints[1], right).toFixed(2)),
              }
            : null,
          bounds: this.bounds,
        };
      },
    });
  }

  update(delta: number): void {
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(delta, 0.1);
    this.phaseTime += dt;
    this.readShadows();
    this.judgeShape(dt);

    switch (this.phase) {
      case 'matching':
        this.updateMatching(dt);
        break;
      case 'awakening':
        this.updateAwakening();
        break;
      case 'resting':
        if (this.phaseTime >= REST_DURATION) {
          this.startLevel((this.levelIndex + 1) % LEVELS.length);
        }
        break;
    }
  }

  private startLevel(index: number): void {
    this.levelIndex = index;
    this.outlineCells = decodeCells(LEVELS[index].outline);
    drawSilhouette(this.outlineCanvas, this.outlineCells, 10, 0.75);
    this.outlineTexture.needsUpdate = true;
    drawSilhouette(this.creatureCanvas, this.outlineCells, 3, 1);
    this.creatureTexture.needsUpdate = true;

    this.outline.visible = true;
    this.creature.visible = false;
    this.score = 0;
    this.holdTime = 0;
    this.struggleTime = 0;
    this.setPhase('matching');
    if (stage.shadowMaterial) stage.shadowMaterial.opacity = SHADOW_OPACITY;
    playPrompt();
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Updates each hand's shadow bounds when a new mask arrives. */
  private readShadows(): void {
    if (stage.maskVersion === this.seenMaskVersion) return;
    this.seenMaskVersion = stage.maskVersion;
    for (const channel of HAND_CHANNELS) {
      this.handShadow[channel] = normalizeMask(
        stage.mask,
        MASK_WIDTH,
        MASK_HEIGHT,
        channel,
        this.candidate,
        this.candidateBounds,
      );
      copyBounds(this.candidateBounds, this.handBounds[channel]);
      if (this.handShadow[channel] && channel === this.bestHand()) {
        this.shadow.set(this.candidate);
      }
    }
  }

  private bestHand(): number {
    return this.handScores[0] >= this.handScores[1] ? 0 : 1;
  }

  /** Scores both hands against the level's shape; the better one counts. */
  private judgeShape(dt: number): void {
    const rule = LEVELS[this.levelIndex].shape;
    let best = -1;
    this.problem = stage.handCount === 0 ? null : 'noShadow';
    for (let hand = 0; hand < 2; hand++) {
      this.handScores[hand] = 0;
      if (!stage.tracked[hand]) continue;
      if (!this.handShadow[hand]) continue;
      if (touchesEdge(this.handBounds[hand])) {
        if (best < 0) this.problem = 'offPaper';
        continue;
      }
      readExtension(stage.joints[hand], this.extension);
      scoreShape(rule, stage.joints[hand], this.extension, this.shapeScore);
      this.handScores[hand] = this.shapeScore.score;
      if (best < 0 || this.shapeScore.score > this.handScores[best]) {
        best = hand;
        this.problem = this.shapeScore.worst;
      }
    }
    this.hasShadow = best >= 0;
    if (best >= 0) copyBounds(this.handBounds[best], this.bounds);
    this.rawScore = best >= 0 ? this.handScores[best] : 0;
    this.score += (this.rawScore - this.score) * Math.min(1, dt * 10);
  }

  private updateMatching(dt: number): void {
    const level = LEVELS[this.levelIndex];
    const warmth = Math.min(1, Math.max(0, (this.score - 0.2) / (MATCH_THRESHOLD - 0.2)));
    this.outlineMaterial.color.copy(DIM_OUTLINE).lerp(HOT_OUTLINE, warmth);
    this.outlineMaterial.opacity = 0.35 + 0.55 * warmth;
    const pulse = 1 + Math.sin(this.phaseTime * 6) * 0.02 * warmth;
    this.outline.scale.setScalar(OUTLINE_SIZE * pulse);

    // After a creature is freed, the hand must relax before the next shape
    // counts, so holding a pose does not spawn creature after creature.
    if (this.needsRelease && (stage.handCount === 0 || this.rawScore < 0.3)) {
      this.needsRelease = false;
    }

    this.struggleTime = stage.handCount > 0 && this.score < MATCH_THRESHOLD
      ? this.struggleTime + dt
      : 0;
    let text = `Make a ${level.name}`;
    if (this.needsRelease) {
      text = 'Relax your hand for the next shape';
    } else if (stage.handCount === 0 || this.problem === 'noShadow') {
      text = 'Raise your hand into the lantern light';
    } else if (this.problem === 'offPaper') {
      text = 'Bring your shadow fully onto the paper';
    } else if (this.struggleTime > HINT_DELAY && this.problem) {
      text = hintFor(this.problem, level.shape.fingers);
    }
    if (DEV) text += `  ·  ${Math.round(this.score * 100)}%`;
    this.setCaption(text);

    const matched = this.score >= MATCH_THRESHOLD && this.hasShadow && !this.needsRelease;
    this.holdTime = matched ? this.holdTime + dt : 0;
    if (this.holdTime >= MATCH_HOLD) this.awaken();
  }

  /** The matched shadow peels off the hand and becomes a creature. */
  private awaken(): void {
    const b = this.bounds;
    const bw = ((b.maxX - b.minX + 1) / MASK_WIDTH) * PAPER_WIDTH;
    const bh = ((b.maxY - b.minY + 1) / MASK_HEIGHT) * PAPER_HEIGHT;
    this.creatureSize = Math.max(bw, bh);
    this.creatureX = (((b.minX + b.maxX + 1) / 2) / MASK_WIDTH - 0.5) * PAPER_WIDTH;
    this.creatureY = (((b.minY + b.maxY + 1) / 2) / MASK_HEIGHT - 0.5) * PAPER_HEIGHT;
    this.creature.position.x = this.creatureX;
    this.creature.position.y = this.creatureY;
    this.creature.scale.setScalar(this.creatureSize);
    this.creatureMaterial.opacity = 1;
    this.creature.visible = true;
    this.outline.visible = false;
    this.needsRelease = true;
    this.setCaption(`The ${LEVELS[this.levelIndex].name} is free!`);
    this.setPhase('awakening');
    playAwaken();
  }

  private updateAwakening(): void {
    const t = this.phaseTime;
    const size = this.creatureSize;
    const shadowMaterial = stage.shadowMaterial;

    if (t < AWAKEN_SHIVER) {
      // Shiver in place while the hand shadow lets go.
      const k = t / AWAKEN_SHIVER;
      this.creature.position.x = this.creatureX + Math.sin(t * 90) * 0.006 * k;
      this.creature.position.y = this.creatureY;
      if (shadowMaterial) shadowMaterial.opacity = SHADOW_OPACITY * (1 - 0.8 * k);
    } else {
      // A few lively moves on the paper before stepping out into the room.
      const m = (t - AWAKEN_SHIVER) / (AWAKEN_DURATION - AWAKEN_SHIVER);
      const x = this.creatureX + Math.sin(m * Math.PI) * 0.05;
      let y = this.creatureY;
      let sx = 1;
      let sy = 1;
      switch (LEVELS[this.levelIndex].motion) {
        case 'hop': {
          const hop = Math.abs(Math.sin(m * Math.PI * 3.5));
          y += hop * 0.12;
          sy = 0.88 + hop * 0.2;
          sx = 1.08 - hop * 0.12;
          break;
        }
        case 'fly':
          y += m * 0.25 + Math.sin(m * Math.PI * 6) * 0.03;
          sy = 1 + Math.sin(m * Math.PI * 16) * 0.12;
          break;
        case 'crawl':
          sx = 1 + Math.sin(m * Math.PI * 10) * 0.06;
          break;
      }
      this.creature.position.set(x, y, this.creature.position.z);
      this.creature.scale.set(size * sx, size * sy, 1);
    }

    if (t >= AWAKEN_DURATION) {
      // The flat shadow hands over to its 3D self, which emerges from this spot.
      this.creature.visible = false;
      stage.spawns.push({
        kind: LEVELS[this.levelIndex].id,
        x: this.creature.position.x,
        y: this.creature.position.y,
      });
      if (shadowMaterial) shadowMaterial.opacity = SHADOW_OPACITY;
      this.setPhase('resting');
    }
  }

  private setCaption(text: string): void {
    if (text === this.caption) return;
    this.caption = text;
    const canvas = this.captionCanvas;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(40, 22, 10, 0.82)';
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 40);
    ctx.fill();
    ctx.fillStyle = '#ffe2a8';
    ctx.font = '600 48px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 60);
    this.captionTexture.needsUpdate = true;
  }
}

/** A shadow cut off by the paper edge cannot be judged fairly. */
function touchesEdge(b: MaskBounds): boolean {
  return b.minX <= 0 || b.minY <= 0 || b.maxX >= MASK_WIDTH - 1 || b.maxY >= MASK_HEIGHT - 1;
}

function hintFor(problem: Exclude<Problem, null>, wants: Record<Finger, string>): string {
  if (problem === 'direction') return 'Point your fingers up';
  if (problem === 'offPaper' || problem === 'noShadow') return 'Raise your hand into the lantern light';
  const verb = wants[problem] === 'out' ? 'Stretch' : 'Fold';
  return problem === 'thumb' ? `${verb} your thumb` : `${verb} your ${problem} finger`;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Draws a cell map as a soft-edged white silhouette filling the canvas. */
function drawSilhouette(
  canvas: HTMLCanvasElement,
  cells: Uint8Array,
  blur: number,
  alpha: number,
): void {
  const small = makeCanvas(GRID, GRID);
  const sctx = small.getContext('2d')!;
  const image = sctx.createImageData(GRID, GRID);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      // Cell rows start at the bottom; canvas rows start at the top.
      const o = ((GRID - 1 - gy) * GRID + gx) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 255;
      image.data[o + 2] = 255;
      image.data[o + 3] = cells[gy * GRID + gx] ? 255 : 0;
    }
  }
  sctx.putImageData(image, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = alpha;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}


function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
