/** Tiny synthesized sound effects, so the game needs no audio files yet. */

let context: AudioContext | null = null;

const MUTE_KEY = 'shadowplay.muted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

/** Silence every sound (remembered between sessions). */
export function setMuted(value: boolean): void {
  if (value) setPurr(0);
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Not remembered; the setting still applies now.
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (context === null) {
    try {
      context = new AudioContext();
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Rising pentatonic chime when a shadow comes alive. */
export function playAwaken(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(ctx, f, now + i * 0.09, 1.2, 0.12);
  });
}

/** Soft low note when a new shape is shown. */
export function playPrompt(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 392, ctx.currentTime, 0.9, 0.06);
}

/** Quick rising chirps, like a tiny giggle. */
export function playGiggle(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.07;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900 + i * 120 + Math.random() * 80, start);
    osc.frequency.exponentialRampToValueAtTime(1500 + i * 150, start + 0.05);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.06, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.08);
  }
}

/** Soft rubbery landing. */
export function playBoing(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
  osc.frequency.exponentialRampToValueAtTime(260, now + 0.25);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.32);
}

/** Airy shimmer as a shadow turns into a creature. */
export function playTransform(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [659.25, 880, 1174.66, 1567.98, 2093].forEach((f, i) => {
    tone(ctx, f, now + i * 0.06, 0.9, 0.05);
  });
}

let purrGain: GainNode | null = null;

/** Continuous purr whose loudness follows `level` (0..1). */
export function setPurr(level: number): void {
  const ctx = audio();
  if (!ctx) return;
  if (purrGain === null) {
    // Low rumble: filtered noise, amplitude-modulated at ~24 Hz.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(tremolo.gain);
    purrGain = ctx.createGain();
    purrGain.gain.value = 0;
    source.connect(filter).connect(tremolo).connect(purrGain).connect(ctx.destination);
    source.start();
    lfo.start();
  }
  purrGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.5, ctx.currentTime, 0.1);
}

/** A short two-note bird chirp, varied a little each time. */
export function playChirp(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = 2200 + Math.random() * 900;
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.11;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * (i ? 1.2 : 1), start);
    osc.frequency.exponentialRampToValueAtTime(base * (i ? 1.5 : 1.35), start + 0.07);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.05, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.1);
  }
}

/** A soft sleepy sigh: a slow falling tone. */
export function playYawn(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(260, now + 0.6);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.75);
}

/** A sweep from one pitch to another with a quick attack and decay. */
function sweep(
  ctx: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  start: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A puppy's double "arf". */
export function playBark(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = 520 + Math.random() * 120;
  sweep(ctx, 'sawtooth', base, base * 0.6, now, 0.09, 0.05);
  sweep(ctx, 'sawtooth', base * 1.1, base * 0.65, now + 0.16, 0.09, 0.045);
}

/** A baby dragon's tiny roar: a rising, wobbly growl. */
export function playRawr(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sawtooth', 160, 420, now, 0.35, 0.05);
  sweep(ctx, 'square', 240, 520, now + 0.03, 0.3, 0.02);
}

/** Glassy tinkle for the butterfly. */
export function playTinkle(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [1760, 2349, 2637].forEach((f, i) => tone(ctx, f, now + i * 0.05, 0.4, 0.035));
}

/** A tiny squeak for the snail. */
export function playSqueak(): void {
  const ctx = audio();
  if (!ctx) return;
  sweep(ctx, 'sine', 1300, 1900, ctx.currentTime, 0.12, 0.05);
}

/** A soft fawn bleat. */
export function playBleat(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const depth = ctx.createGain();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.35);
  vibrato.frequency.value = 18;
  depth.gain.value = 25;
  vibrato.connect(depth).connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  vibrato.start(now);
  osc.stop(now + 0.42);
  vibrato.stop(now + 0.42);
}

/** Soft wooden tick when a menu button is pressed. */
export function playClick(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 880, ctx.currentTime, 0.08, 0.06);
  tone(ctx, 1320, ctx.currentTime + 0.03, 0.1, 0.04);
}

/** Two quiet notes as the hand menu opens. */
export function playMenuOpen(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 587, ctx.currentTime, 0.25, 0.03);
  tone(ctx, 784, ctx.currentTime + 0.06, 0.3, 0.03);
}

/** A soft brush scratch while drawing a thread of shadow ink. */
export function playInk(): void {
  const ctx = audio();
  if (!ctx) return;
  const length = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200 + Math.random() * 800;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

/** A burst of shaped noise through one filter: breath, hooves, scrapes. */
function noise(ctx: AudioContext, start: number, duration: number, type: BiquadFilterType, frequency: number, q: number, volume: number): BiquadFilterNode {
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + duration * 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  return filter;
}

/** A horse's snort: a fluttering burst of breath through the nostrils. */
export function playSnort(volume = 0.05): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const filter = noise(ctx, now, 0.38, 'bandpass', 700, 0.9, volume);
  // The lips flutter: wobble the breath's colour.
  const flutter = ctx.createOscillator();
  const depth = ctx.createGain();
  flutter.frequency.value = 32;
  depth.gain.value = 260;
  flutter.connect(depth).connect(filter.frequency);
  flutter.start(now);
  flutter.stop(now + 0.4);
}

/** A soft, low nicker: a throaty call that steps down in pitch. */
export function playNicker(pitch = 1, volume = 1): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const tremolo = ctx.createOscillator();
  const depth = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(210 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(130 * pitch, now + 0.55);
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900 * pitch;
  // The nicker's rapid pulses.
  tremolo.frequency.value = 14;
  depth.gain.value = 0.5;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.045 * volume, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  tremolo.connect(depth).connect(gain.gain);
  osc.connect(lowpass).connect(gain).connect(ctx.destination);
  osc.start(now);
  tremolo.start(now);
  osc.stop(now + 0.62);
  tremolo.stop(now + 0.62);
  noise(ctx, now, 0.25, 'bandpass', 900, 0.8, 0.02 * volume);
}

/** One hoof on wood: a dull knock with a little scuff. */
export function playHoof(volume = 0.03): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sine', 180 + Math.random() * 30, 70, now, 0.07, volume);
  noise(ctx, now, 0.05, 'highpass', 2500, 0.7, volume * 0.4);
}

/** The jungle springing up: a rising rustle of leaves under a warm swelling chord. */
export function playGrow(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const rustle = noise(ctx, now, 1.8, 'bandpass', 900, 0.6, 0.05);
  rustle.frequency.setValueAtTime(500, now);
  rustle.frequency.exponentialRampToValueAtTime(3200, now + 1.6);
  [196, 293.66, 392, 587.33].forEach((f, i) => tone(ctx, f, now + 0.25 + i * 0.16, 2.2, 0.035));
}

/** The ratchet's pawl dropping off one tooth: a small dry tick of iron on iron. */
export function playPawl(volume = 0.03): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  noise(ctx, now, 0.035, 'bandpass', 4200 + Math.random() * 600, 3, volume);
  tone(ctx, 2600 + Math.random() * 200, now, 0.05, volume * 0.25);
}

/** Loaded timber turning on its pegs: a short stick-slip groan. Louder under more load. */
export function playCreak(load = 0.5): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.18 + Math.random() * 0.22;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(38 + Math.random() * 30, now);
  osc.frequency.linearRampToValueAtTime(55 + Math.random() * 40, now + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 700 + Math.random() * 900;
  filter.Q.value = 4;
  const gain = ctx.createGain();
  const volume = 0.012 + 0.03 * Math.min(1, load);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

/** The load trying to run back, caught by the pawl: a heavy wooden clunk. */
export function playClunk(volume = 0.06): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sine', 140, 55, now, 0.16, volume);
  noise(ctx, now, 0.08, 'lowpass', 900, 0.8, volume * 0.6);
}

/** A drop of water falling back into the well. */
export function playDrip(volume = 0.025): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sine', 700 + Math.random() * 300, 1900 + Math.random() * 500, now, 0.06, volume);
}

/**
 * Hammer on hot iron over the anvil: a bright ring built from an anvil's
 * inharmonic partials, damped when the iron is soft and hot.
 */
export function playClang(hot = 1, volume = 0.07): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = 820 + Math.random() * 60;
  // Struck steel bar partials (free-free beam): 1, 2.76, 5.40, 8.93.
  [1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
    const ring = 0.5 * (1 - hot * 0.6) / (1 + i * 0.6) + 0.08;
    tone(ctx, base * ratio, now, ring, volume / (1 + i * 1.4));
  });
  noise(ctx, now, 0.05, 'bandpass', 2500, 1.2, volume * 0.7);
  sweep(ctx, 'sine', 160, 60, now, 0.12, volume * 0.8 * hot);
}

/** A blow on iron too cold to move: a hard, high tink that rings on. */
export function playTink(volume = 0.05): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = 1500 + Math.random() * 100;
  [1, 2.76, 5.4].forEach((ratio, i) => tone(ctx, base * ratio, now, 1.1 / (1 + i), volume / (1 + i)));
}

/** Air pushed through the bellows' nozzle. */
export function playWhoosh(strength = 0.5): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const filter = noise(ctx, now, 0.45, 'bandpass', 500, 0.8, 0.02 + 0.05 * Math.min(1, strength));
  filter.frequency.setValueAtTime(350, now);
  filter.frequency.exponentialRampToValueAtTime(1100, now + 0.3);
}

/** Red-hot steel plunged into water: a violent hiss that dies to a simmer. */
export function playHiss(volume = 0.08, seconds = 1.6): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  noise(ctx, now, seconds, 'highpass', 3000, 0.7, volume);
  noise(ctx, now, seconds * 0.6, 'bandpass', 900, 1.5, volume * 0.5);
}

/** A pop and crackle from the burning charcoal. */
export function playCrackle(volume = 0.02): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    noise(ctx, now + Math.random() * 0.15, 0.015 + Math.random() * 0.02, 'highpass', 1800 + Math.random() * 2000, 0.8, volume * Math.random());
  }
}

/** The forge catching light: a soft whump and a rush of flame. */
export function playIgnite(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sine', 90, 45, now, 0.5, 0.09);
  const roar = noise(ctx, now, 1.4, 'lowpass', 600, 0.7, 0.07);
  roar.frequency.setValueAtTime(300, now);
  roar.frequency.exponentialRampToValueAtTime(1600, now + 0.6);
}

/** The dragon's roar: a low growl that swells, with breath roaring through it. */
export function playRoar(volume = 0.12): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70, now);
  osc.frequency.linearRampToValueAtTime(95, now + 0.5);
  osc.frequency.linearRampToValueAtTime(55, now + 1.6);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 23;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(osc.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  lfo.start(now);
  osc.stop(now + 1.9);
  lfo.stop(now + 1.9);
  noise(ctx, now, 1.6, 'bandpass', 700, 0.8, volume * 0.5);
}

/** A ball of fire rushing past. */
export function playFireball(volume = 0.06): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const f = noise(ctx, now, 0.9, 'bandpass', 400, 0.9, volume);
  f.frequency.setValueAtTime(300, now);
  f.frequency.exponentialRampToValueAtTime(1400, now + 0.7);
}

/** Something big landing: a thump and a burst. */
export function playBoom(volume = 0.1): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'sine', 120, 35, now, 0.6, volume);
  noise(ctx, now, 0.5, 'lowpass', 1200, 0.7, volume * 0.8);
}

/** One sign made: a bright bell, rising with each step of the sequence. */
export function playSign(step: number): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const f = [523.25, 659.25, 783.99, 1046.5][Math.min(3, step)];
  tone(ctx, f, now, 0.9, 0.06);
  tone(ctx, f * 2, now, 0.5, 0.02);
}

/** Light gathering in the hand: a shimmering swell. */
export function playCharge(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  sweep(ctx, 'triangle', 220, 880, now, 1.2, 0.04);
  [1046.5, 1318.5, 1568].forEach((f, i) => tone(ctx, f, now + 0.2 + i * 0.12, 1.0, 0.025));
}

/** Light thrown: a rising whoosh. */
export function playThrow(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const f = noise(ctx, now, 0.5, 'bandpass', 800, 1.2, 0.07);
  f.frequency.setValueAtTime(600, now);
  f.frequency.exponentialRampToValueAtTime(3000, now + 0.4);
  sweep(ctx, 'sine', 440, 1320, now, 0.4, 0.04);
}

/** A wet slap of ink. */
export function playSplat(volume = 0.08): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  noise(ctx, now, 0.18, 'lowpass', 900, 0.9, volume);
  sweep(ctx, 'sine', 260, 80, now, 0.12, volume * 0.6);
}

// ---------------------------------------------------------------- Ambience

/** Background sound for each world, made from filtered noise and little calls. */
export type AmbienceKind = 'jungle' | 'river' | 'mine' | 'mountain';

interface Bed {
  kind: AmbienceKind;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

let bed: Bed | null = null;
let eventIn = 1;
let ambienceKind: AmbienceKind | null = null;

/** A few seconds of noise to loop, coloured: 0 white, 1 pink-ish, 2 brown. */
function noiseLoop(ctx: AudioContext, colour: 0 | 1 | 2): AudioBufferSourceNode {
  const length = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (colour === 0) data[i] = white;
    else if (colour === 1) data[i] = last = last * 0.86 + white * 0.14 * 3;
    else {
      // Brown: a leaky random walk, scaled up afterwards.
      last = (last + white * 0.02) / 1.02;
      data[i] = last * 3.5;
    }
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function startBed(ctx: AudioContext, kind: AmbienceKind): Bed {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  const sources: AudioScheduledSourceNode[] = [];
  const layer = (colour: 0 | 1 | 2, type: BiquadFilterType, frequency: number, q: number, volume: number, wobble = 0) => {
    const src = noiseLoop(ctx, colour);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    if (wobble > 0) {
      // A slow swell, like wind or water coming and going.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = wobble;
      const depth = ctx.createGain();
      depth.gain.value = volume * 0.6;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      sources.push(lfo);
    }
    src.connect(filter).connect(gain).connect(out);
    src.start();
    sources.push(src);
  };
  switch (kind) {
    case 'jungle':
      layer(1, 'lowpass', 500, 0.5, 0.25, 0.07);
      // Insects: a high band of noise pulsing fast.
      layer(0, 'bandpass', 5200, 6, 0.06, 6.5);
      break;
    case 'river':
      layer(1, 'lowpass', 900, 0.6, 0.35, 0.21);
      layer(0, 'bandpass', 2400, 1.5, 0.04, 0.4);
      break;
    case 'mine':
      layer(2, 'lowpass', 180, 0.7, 0.5, 0.05);
      layer(1, 'bandpass', 700, 2, 0.05, 0.09);
      break;
    case 'mountain':
      layer(2, 'lowpass', 120, 0.7, 0.6, 0.04);
      layer(1, 'bandpass', 420, 3, 0.09, 0.11);
      break;
  }
  out.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);
  return { kind, gain: out, sources };
}

function stopBed(ctx: AudioContext, old: Bed): void {
  const now = ctx.currentTime;
  old.gain.gain.cancelScheduledValues(now);
  old.gain.gain.setValueAtTime(old.gain.gain.value, now);
  old.gain.gain.linearRampToValueAtTime(0, now + 1.5);
  for (const s of old.sources) s.stop(now + 1.6);
}

/** Cross-fade to a world's background sound (null: silence). */
export function setAmbience(kind: AmbienceKind | null): void {
  ambienceKind = kind;
  const ctx = audio();
  if (!ctx) {
    if (bed && context) stopBed(context, bed);
    bed = null;
    return;
  }
  if (bed?.kind === kind) return;
  if (bed) stopBed(ctx, bed);
  bed = kind ? startBed(ctx, kind) : null;
}

/** Little events over the bed: birds, frogs, drips, distant rumbles. */
export function tickAmbience(dt: number): void {
  if (muted) {
    if (bed && context) stopBed(context, bed);
    bed = null;
    return;
  }
  if (!bed && ambienceKind) setAmbience(ambienceKind);
  const ctx = audio();
  if (!ctx || !bed) return;
  eventIn -= dt;
  if (eventIn > 0) return;
  const now = ctx.currentTime;
  switch (bed.kind) {
    case 'jungle': {
      eventIn = 1.5 + Math.random() * 4;
      // A bird: two or three quick whistles.
      const base = 1800 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) sweep(ctx, 'sine', base * (1 + Math.random() * 0.2), base * (0.7 + Math.random() * 0.6), now + i * 0.13, 0.1, 0.008);
      break;
    }
    case 'river':
      eventIn = 2 + Math.random() * 5;
      if (Math.random() < 0.5) {
        // A frog.
        for (let i = 0; i < 2; i++) sweep(ctx, 'square', 220, 180, now + i * 0.16, 0.08, 0.006);
      } else {
        sweep(ctx, 'sine', 700 + Math.random() * 400, 1800, now, 0.05, 0.007);
      }
      break;
    case 'mine':
      eventIn = 1 + Math.random() * 3;
      // Water dripping somewhere in the dark.
      sweep(ctx, 'sine', 900 + Math.random() * 500, 2200, now, 0.05, 0.012);
      break;
    case 'mountain':
      eventIn = 4 + Math.random() * 6;
      // Far-off thunder, or the dragon stirring.
      sweep(ctx, 'sine', 70, 35, now, 2.2, 0.04);
      noise(ctx, now, 2, 'lowpass', 300, 0.7, 0.03);
      break;
  }
}
