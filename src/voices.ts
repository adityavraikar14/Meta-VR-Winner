import { audioContext } from './audio.js';

/**
 * The fighters' voices: cries of pain, battle shouts and a last fall, made
 * from a voice model rather than recordings. A buzzing source (the vocal
 * folds) is shaped by three resonances (the formants, which make a vowel),
 * with breath noise, a rough edge (growl) and a shake (tremble) per
 * character. Each cry has its own pitch and vowel contour, and every one is
 * a little different from the last, so a fight never repeats itself.
 */

export type Cry = 'hurt' | 'big' | 'shout' | 'taunt' | 'fall';

interface VoiceSpec {
  /** Speaking pitch, Hz. */
  f0: number;
  /** Formant scale: 1 a man's vocal tract, about 1.17 a woman's, below 1 a huge chest. */
  tract: number;
  breath: number;
  /** Roughness: amplitude wobble at 30–60 Hz. */
  growl: number;
  /** Pitch shake (an old voice). */
  tremble: number;
  volume: number;
}

const VOICES: Record<string, VoiceSpec> = {
  // Morwen: a sharp, cracked woman's voice.
  morwen: { f0: 250, tract: 1.18, breath: 0.32, growl: 0.25, tremble: 0.015, volume: 0.9 },
  // Thorne, the old ember mage: low, shaky and dry.
  thorne: { f0: 108, tract: 0.97, breath: 0.4, growl: 0.32, tremble: 0.045, volume: 1 },
  // Sgt. Vance: a clipped, barking soldier.
  vance: { f0: 126, tract: 1.0, breath: 0.18, growl: 0.18, tremble: 0.005, volume: 1 },
  // Kai: a steady, low swordsman.
  kai: { f0: 132, tract: 1.03, breath: 0.25, growl: 0.1, tremble: 0.005, volume: 0.95 },
  // Rook, the corsair: a gruff baritone.
  rook: { f0: 118, tract: 1.0, breath: 0.22, growl: 0.4, tremble: 0.01, volume: 1 },
  // Vex: a young woman, light and breathy.
  vex: { f0: 290, tract: 1.2, breath: 0.4, growl: 0.05, tremble: 0.01, volume: 0.85 },
  // Mako: a huge chest, a bellow with a rumble under it.
  mako: { f0: 72, tract: 0.84, breath: 0.2, growl: 0.7, tremble: 0.01, volume: 1.15 },
  // Sable: a low, controlled woman's voice.
  sable: { f0: 205, tract: 1.13, breath: 0.28, growl: 0.12, tremble: 0.008, volume: 0.9 },
};

/** Vowels as the first three formants of an adult man's voice, Hz. */
const VOWEL = {
  a: [730, 1090, 2440],
  uh: [640, 1190, 2390],
  o: [570, 840, 2410],
  u: [440, 1020, 2240],
  e: [530, 1840, 2480],
  ae: [660, 1720, 2410],
} as const;
type Vowel = keyof typeof VOWEL;

interface Shape {
  seconds: number;
  /** Pitch at the start, at its peak (a fifth of the way in), and at the end, × the voice's f0. */
  pitch: [number, number, number];
  /** Vowel at the start and the end. */
  vowels: [Vowel, Vowel];
  /** A breathy h before the voice starts, seconds. */
  onset: number;
  /** How hard the voice hits at the start (0 soft, 1 a shout). */
  attack: number;
}

/** Several shapes per cry, picked at random. */
const SHAPES: Record<Cry, Shape[]> = {
  hurt: [
    { seconds: 0.2, pitch: [1.25, 1.35, 0.9], vowels: ['uh', 'uh'], onset: 0, attack: 1 },
    { seconds: 0.28, pitch: [1.3, 1.45, 0.85], vowels: ['a', 'uh'], onset: 0.02, attack: 1 },
    { seconds: 0.24, pitch: [1.2, 1.3, 0.8], vowels: ['o', 'u'], onset: 0.03, attack: 0.8 },
    { seconds: 0.18, pitch: [1.4, 1.45, 1.0], vowels: ['e', 'uh'], onset: 0, attack: 1 },
  ],
  big: [
    { seconds: 0.62, pitch: [1.3, 1.7, 0.75], vowels: ['a', 'uh'], onset: 0.03, attack: 1 },
    { seconds: 0.55, pitch: [1.5, 1.8, 0.85], vowels: ['ae', 'a'], onset: 0, attack: 1 },
    { seconds: 0.7, pitch: [1.2, 1.6, 0.7], vowels: ['a', 'o'], onset: 0.05, attack: 0.9 },
  ],
  shout: [
    { seconds: 0.22, pitch: [1.1, 1.25, 1.0], vowels: ['a', 'a'], onset: 0.06, attack: 1 },
    { seconds: 0.3, pitch: [1.0, 1.3, 1.15], vowels: ['uh', 'a'], onset: 0.05, attack: 1 },
    { seconds: 0.2, pitch: [1.15, 1.2, 0.95], vowels: ['e', 'a'], onset: 0.07, attack: 0.9 },
  ],
  taunt: [
    { seconds: 0.5, pitch: [0.95, 1.05, 0.8], vowels: ['uh', 'u'], onset: 0.08, attack: 0.5 },
    { seconds: 0.65, pitch: [1.0, 1.2, 0.9], vowels: ['a', 'uh'], onset: 0.06, attack: 0.6 },
  ],
  fall: [
    { seconds: 1.3, pitch: [1.5, 1.6, 0.55], vowels: ['a', 'o'], onset: 0.04, attack: 1 },
    { seconds: 1.1, pitch: [1.4, 1.55, 0.5], vowels: ['ae', 'uh'], onset: 0.05, attack: 0.9 },
  ],
};

const glottal = new WeakMap<BaseAudioContext, PeriodicWave>();
let noise: AudioBuffer | null = null;
const last: Record<string, number> = {};

/** The buzz of the vocal folds: every harmonic, falling off at about 12 dB an octave. */
function folds(ctx: BaseAudioContext): PeriodicWave {
  const known = glottal.get(ctx);
  if (known) return known;
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.6);
  const wave = ctx.createPeriodicWave(real, imag);
  glottal.set(ctx, wave);
  return wave;
}

function breathNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/**
 * A fighter cries out. `who` is a rival's id (unknown ids use a middle
 * voice). Cries from one fighter never overlap: a new hurt waits for the
 * last to end, except a fall, which always plays.
 */
export function cry(who: string, kind: Cry, volume = 1, into?: BaseAudioContext): void {
  const ctx = into ?? audioContext();
  if (!ctx) return;
  const voice = VOICES[who] ?? VOICES.rook;
  const options = SHAPES[kind];
  const shape = options[Math.floor(Math.random() * options.length)];
  const now = ctx.currentTime;
  if (!into) {
    if (kind !== 'fall' && (last[who] ?? 0) > now) return;
    last[who] = now + shape.seconds * 0.8;
  }

  const t0 = now + 0.01;
  const voiced = t0 + shape.onset;
  const end = voiced + shape.seconds;
  const jitter = 0.93 + Math.random() * 0.14;
  const f0 = voice.f0 * jitter;

  // The source: buzz plus breath.
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(folds(ctx));
  const [p0, p1, p2] = shape.pitch;
  osc.frequency.setValueAtTime(f0 * p0, voiced);
  osc.frequency.linearRampToValueAtTime(f0 * p1, voiced + shape.seconds * 0.2);
  osc.frequency.exponentialRampToValueAtTime(f0 * p2, end);
  const shake = ctx.createOscillator();
  shake.frequency.value = 5 + Math.random() * 3;
  const shakeDepth = ctx.createGain();
  shakeDepth.gain.value = f0 * (voice.tremble + 0.01);
  shake.connect(shakeDepth).connect(osc.frequency);

  const buzz = ctx.createGain();
  buzz.gain.setValueAtTime(0, t0);
  buzz.gain.setValueAtTime(0, voiced);
  buzz.gain.linearRampToValueAtTime(1, voiced + 0.015 + (1 - shape.attack) * 0.06);
  buzz.gain.setValueAtTime(1, voiced + shape.seconds * 0.55);
  buzz.gain.exponentialRampToValueAtTime(0.001, end);
  osc.connect(buzz);

  const air = ctx.createBufferSource();
  air.buffer = breathNoise(ctx);
  const airGain = ctx.createGain();
  // The h before the voice, then breath under it, and a breathy tail.
  airGain.gain.setValueAtTime(0, t0);
  airGain.gain.linearRampToValueAtTime(shape.onset > 0 ? 0.5 : voice.breath * 0.4, t0 + Math.max(0.01, shape.onset * 0.6));
  airGain.gain.linearRampToValueAtTime(voice.breath * 0.35, voiced + 0.02);
  airGain.gain.setValueAtTime(voice.breath * 0.35, end - shape.seconds * 0.3);
  airGain.gain.linearRampToValueAtTime(voice.breath * 0.5, end);
  airGain.gain.exponentialRampToValueAtTime(0.001, end + 0.12);
  air.connect(airGain);

  // The vocal tract: three formant resonances gliding between two vowels.
  const tract = ctx.createGain();
  const [va, vb] = shape.vowels;
  const weights = [1, 0.55, 0.28];
  const widths = [90, 110, 150];
  for (let i = 0; i < 3; i++) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    const fa = VOWEL[va][i] * voice.tract;
    const fb = VOWEL[vb][i] * voice.tract;
    band.frequency.setValueAtTime(fa, voiced);
    band.frequency.linearRampToValueAtTime(fb, end);
    band.Q.value = fa / widths[i];
    const level = ctx.createGain();
    level.gain.value = weights[i] * 9;
    buzz.connect(band);
    airGain.connect(band);
    band.connect(level).connect(tract);
  }
  // A little of the raw buzz keeps the low end, so it reads as a body, not a whistle.
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 900 * voice.tract;
  const bodyLevel = ctx.createGain();
  bodyLevel.gain.value = 0.35;
  buzz.connect(body).connect(bodyLevel).connect(tract);

  // Growl: the voice's loudness wobbles at a low rate.
  const rough = ctx.createGain();
  rough.gain.value = 1 - voice.growl * 0.5;
  if (voice.growl > 0) {
    const wobble = ctx.createOscillator();
    wobble.type = 'triangle';
    wobble.frequency.value = 32 + Math.random() * 26;
    const depth = ctx.createGain();
    depth.gain.value = voice.growl * 0.5;
    wobble.connect(depth).connect(rough.gain);
    wobble.start(t0);
    wobble.stop(end + 0.2);
  }
  tract.connect(rough);

  // Out, through a gentle limiter so the loudest cries never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 6;
  const out = ctx.createGain();
  const loud = kind === 'big' || kind === 'fall' ? 1 : kind === 'taunt' ? 0.6 : 0.8;
  out.gain.value = 0.22 * voice.volume * loud * volume;
  rough.connect(limiter).connect(out).connect(ctx.destination);

  osc.start(t0);
  shake.start(t0);
  air.start(t0, Math.random());
  osc.stop(end + 0.2);
  shake.stop(end + 0.2);
  air.stop(end + 0.2);
}
