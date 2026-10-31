/** Tiny synthesized sound effects, so the game needs no audio files yet. */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
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
