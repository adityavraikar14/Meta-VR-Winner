import { type Feeling, petVoice } from '../pet-voices.js';

/**
 * How a pet feels about you, built up from how you treat it. Stroking it
 * slowly earns trust; a gentle toss is a game; a hard throw or a hard
 * landing hurts and frightens it; poking it again and again makes it cross.
 * It answers each time in its own voice, and a frightened pet trembles and
 * keeps its distance until it is stroked calm again.
 */
export class PetMood {
  /** 0 wary of you … 1 loves you. */
  trust = 0.55;
  /** Fades over seconds. */
  fear = 0;
  annoyed = 0;
  /** The last thing that happened, said in words for the Pets card. */
  last = '';
  private pokes: number[] = [];
  private sinceVoice = 0;
  private strokedFor = 0;

  constructor(public kind: string) {}

  tick(dt: number): void {
    this.fear = Math.max(0, this.fear - dt * 0.09);
    this.annoyed = Math.max(0, this.annoyed - dt * 0.12);
    this.sinceVoice += dt;
  }

  private say(feeling: Feeling, line: string): void {
    petVoice(this.kind, feeling);
    this.sinceVoice = 0;
    this.last = line;
  }

  /** A slow hand along its back. */
  stroke(dt: number): void {
    this.strokedFor += dt;
    this.trust = Math.min(1, this.trust + dt * 0.06);
    this.fear = Math.max(0, this.fear - dt * 0.35);
    this.annoyed = Math.max(0, this.annoyed - dt * 0.4);
    if (this.sinceVoice > 2.4) {
      if (this.fear > 0.3) this.say('sad', 'It is still shaken, but your hand calms it');
      else this.say(this.strokedFor > 4 ? 'content' : 'happy', this.trust > 0.8 ? 'It leans into your hand: it loves this' : 'It likes being stroked');
    }
  }

  strokeEnd(): void {
    this.strokedFor = 0;
  }

  /** A quick jab with a fingertip. */
  poke(): void {
    const now = performance.now() / 1000;
    this.pokes = this.pokes.filter((t) => now - t < 3.5);
    this.pokes.push(now);
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.annoyed = 1;
      this.trust = Math.max(0, this.trust - 0.06);
      this.say('annoyed', 'Too many pokes: it is cross with you');
    } else if (this.fear > 0.4) this.say('scared', 'It flinches: it is still frightened');
    else this.say(this.trust > 0.5 ? 'happy' : 'annoyed', this.trust > 0.5 ? 'A playful poke: it does not mind' : 'It does not like that');
  }

  /** Picked up. */
  lifted(): void {
    if (this.fear > 0.4 || this.trust < 0.3) this.say('scared', 'It struggles: it does not trust you yet');
    else this.say('excited', 'Up it goes!');
  }

  /** Let go at this speed (m/s). */
  released(speed: number): void {
    if (speed > 1.8) {
      this.fear = Math.min(1, this.fear + 0.6);
      this.trust = Math.max(0, this.trust - 0.15);
      this.say('scared', 'Thrown hard! It is frightened');
    } else if (speed > 0.5) {
      this.trust = Math.min(1, this.trust + 0.03);
      this.say('excited', 'A gentle toss: it loves the game');
    }
  }

  /** Hit the ground this hard (m/s downward). */
  landed(impact: number): void {
    if (impact > 2.4) {
      this.fear = Math.min(1, this.fear + 0.4);
      this.trust = Math.max(0, this.trust - 0.1);
      this.say('hurt', 'Ouch! That landing hurt');
    } else if (impact > 1.2 && this.fear < 0.3) this.say('happy', 'It lands on its feet');
  }

  /** Sitting on your open palm. */
  onPalm(): void {
    this.trust = Math.min(1, this.trust + 0.04);
    this.say(this.fear > 0.4 ? 'sad' : 'content', 'It settles on your palm');
  }

  /** Left alone a while: a sad little call, now and then. */
  lonely(): void {
    if (this.sinceVoice > 14 && this.trust > 0.6) this.say('sad', 'It wants your attention');
  }

  /** One word for how it feels now. */
  get feeling(): string {
    if (this.fear > 0.45) return 'Frightened';
    if (this.annoyed > 0.5) return 'Cross';
    if (this.trust > 0.85) return 'Loves you';
    if (this.trust > 0.6) return 'Happy';
    if (this.trust > 0.35) return 'Calm';
    return 'Wary';
  }

  /** Trembling, 0 … 1: a frightened pet shakes. */
  get tremble(): number {
    return Math.max(0, this.fear - 0.25) / 0.75;
  }
}

/** The one pet on the stage now, for the Pets card. */
export const petNow: { mood: PetMood | null } = { mood: null };
