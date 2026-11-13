import { isMuted } from './audio.js';

/**
 * The storyteller's voice: an old man telling a tale by the fire, heard
 * only in the prologue (the levels speak through their captions). Every
 * line has an id; if a recorded file for it is listed in RECORDED
 * (public/audio/voice/<id>.mp3), that plays. Otherwise the device's own
 * speech voice reads the text: a male English voice (British first), said
 * slower and lower. Captions always show the same words, so nothing
 * depends on sound.
 */

/** Line ids that have a recorded file in public/audio/voice/. */
const RECORDED = new Set<string>([]);

/** Voice names that are men's (Windows, Apple, Google, Edge and Android voices). */
const MALE = /\bmale\b|george|thomas|ryan|arthur|daniel|oliver|alfie|elliot|guy|davis|tony|christopher|eric|roger|steffan|brian|james|william|david|mark|fred|ralph|aaron|gordon|reed/i;
const FEMALE = /female|woman|libby|sonia|serena|maisie|hazel|susan|zira|jenny|aria|samantha|karen|moira|tessa|kate|victoria|fiona|martha|catherine|emma|natasha|clara/i;

let audio: HTMLAudioElement | null = null;
let speaking = false;
let until = 0;
let chosen: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function isMale(v: SpeechSynthesisVoice): boolean {
  return MALE.test(v.name) && !FEMALE.test(v.name);
}

/** The best storyteller on this device: a man's voice, natural-sounding and British if possible. */
function voice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (chosen) return chosen;
  const voices = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (isMale(v) ? 8 : 0) -
    (FEMALE.test(v.name) ? 8 : 0) +
    (/natural|neural|online/i.test(v.name) ? 4 : 0) +
    (/en-gb/i.test(v.lang) ? 3 : 0) +
    (/george|arthur|thomas|daniel/i.test(v.name) ? 2 : 0) +
    (/google/i.test(v.name) ? 1 : 0);
  chosen = voices.sort((a, b) => score(b) - score(a))[0];
  return chosen;
}

if (typeof window !== 'undefined') synth()?.addEventListener?.('voiceschanged', () => (chosen = null));

/** Roughly how long a line takes to say, in seconds (for pacing scenes), at the storyteller's slow pace. */
export function lineSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return 0.8 + words * 0.46;
}

/** Say a line, cutting off whatever was being said. */
export function narrate(id: string, text: string): void {
  stopNarration();
  until = performance.now() / 1000 + lineSeconds(text);
  if (isMuted()) return;
  if (RECORDED.has(id)) {
    audio = new Audio(`${import.meta.env.BASE_URL}audio/voice/${id}.mp3`);
    audio.volume = 0.95;
    speaking = true;
    audio.onended = () => (speaking = false);
    audio.onerror = () => {
      speaking = false;
      speak(text);
    };
    void audio.play().catch(() => speak(text));
    return;
  }
  speak(text);
}

function speak(text: string): void {
  const s = synth();
  if (!s) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const v = voice();
  if (v) {
    utterance.voice = v;
    utterance.lang = v.lang;
  } else {
    utterance.lang = 'en-GB';
  }
  // Slow and low, an old storyteller; a voice that is not clearly a man's is pitched down further.
  utterance.rate = 0.86;
  utterance.pitch = v && isMale(v) ? 0.8 : 0.55;
  utterance.volume = 1;
  utterance.onend = () => (speaking = false);
  utterance.onerror = () => (speaking = false);
  speaking = true;
  s.speak(utterance);
}

export function stopNarration(): void {
  speaking = false;
  until = 0;
  if (audio) {
    audio.pause();
    audio = null;
  }
  synth()?.cancel();
}

/** True while a line is still being said (or, with no voice, for the time it would take). */
export function narrating(): boolean {
  return speaking || performance.now() / 1000 < until;
}
