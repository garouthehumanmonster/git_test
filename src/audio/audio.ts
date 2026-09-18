/**
 * Audio.ts — upgraded chiptune engine. Three per-age adaptive arrangements
 * (stone / medieval / modern) with bass + chord pad + lead + arpeggio + drums.
 * Tempo/intensity shifts by game state and base-HP tension. All synthesized
 * with Web Audio — zero external assets.
 */

import {
  MUSIC_PATTERNS, BAR_STEPS, PHRASE_BARS, pitchClassOf, triadIntervals,
  type AgeKey,
} from './patterns';

type MusicState = 'menu' | 'playing' | 'win' | 'lose';

// Re-exported so existing `import { AgeKey } from '../audio/audio'` keeps working.
export type { AgeKey };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private bassGain!: GainNode;
  private padGain!: GainNode;
  private leadGain!: GainNode;
  private arpGain!: GainNode;
  private drumGain!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private voiceHighPass!: BiquadFilterNode;
  private voiceLowPass!: BiquadFilterNode;
  private voiceBitCrusher!: WaveShaperNode;
  private voiceDryGain!: GainNode;
  private voiceReverb!: ConvolverNode;
  private voiceWetGain!: GainNode;
  private voiceSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private musicStarted = false;
  private nextStepTime = 0;
  private step = 0;
  private musicState: MusicState = 'menu';
  private musicAge: AgeKey = 'stone';
  private voiceAge: AgeKey = 'stone';
  private muted = false;
  private musicMuted = false;
  private tension = 0; // 0..1, drives filter + lead intensity when base is low

  private readonly patterns = MUSIC_PATTERNS;

  async init(): Promise<void> {
    if (this.ctx) return;
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    // Some embedded browsers expose no Web Audio API. Audio is optional; the
    // game must remain playable instead of throwing during the first input.
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.65;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;

    // Separate stems so we can duck/eq per voice.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicMuted ? 0 : 0.32;
    this.bassGain = this.ctx.createGain(); this.bassGain.gain.value = 0.55;
    this.padGain = this.ctx.createGain(); this.padGain.gain.value = 0.12;
    this.leadGain = this.ctx.createGain(); this.leadGain.gain.value = 0.34;
    this.arpGain = this.ctx.createGain(); this.arpGain.gain.value = 0.22;
    this.drumGain = this.ctx.createGain(); this.drumGain.gain.value = 0.45;
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.5;

    // Radio-comm voice bus: a 300Hz high-pass and 3.4kHz low-pass recreate
    // a narrow arcade speaker, while the 12-bit waveshaper adds deliberate
    // digital grain instead of a clean synthetic voice.
    this.voiceHighPass = this.ctx.createBiquadFilter();
    this.voiceHighPass.type = 'highpass';
    this.voiceHighPass.frequency.value = 300;
    this.voiceLowPass = this.ctx.createBiquadFilter();
    this.voiceLowPass.type = 'lowpass';
    this.voiceLowPass.frequency.value = 3400;
    this.voiceBitCrusher = this.ctx.createWaveShaper();
    this.voiceBitCrusher.curve = this.makeBitCrusherCurve(12);
    this.voiceBitCrusher.oversample = 'none';
    this.voiceDryGain = this.ctx.createGain(); this.voiceDryGain.gain.value = 0.78;
    this.voiceReverb = this.ctx.createConvolver();
    this.voiceReverb.buffer = this.makeVoiceImpulse(this.voiceAge);
    this.voiceWetGain = this.ctx.createGain(); this.voiceWetGain.gain.value = 0.22;
    this.voiceHighPass.connect(this.voiceLowPass);
    this.voiceLowPass.connect(this.voiceBitCrusher);
    this.voiceBitCrusher.connect(this.voiceDryGain);
    this.voiceBitCrusher.connect(this.voiceReverb);
    this.voiceReverb.connect(this.voiceWetGain);

    // Low-pass filter on the pad/arp for a slightly softer pad.
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 1800;

    this.bassGain.connect(this.musicGain);
    this.padGain.connect(padFilter); padFilter.connect(this.musicGain);
    this.leadGain.connect(this.musicGain);
    this.arpGain.connect(this.musicGain);
    this.drumGain.connect(this.musicGain);
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.voiceDryGain.connect(this.masterGain);
    this.voiceWetGain.connect(this.masterGain);
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.65;
  }
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }
  isMuted(): boolean { return this.muted; }

  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    if (this.musicGain) this.musicGain.gain.value = this.musicMuted ? 0 : 0.32;
    return this.musicMuted;
  }
  musicIsMuted(): boolean { return this.musicMuted; }

  setMusicAge(age: AgeKey): void {
    this.musicAge = age;
  }

  setVoiceAge(age: AgeKey): void {
    this.voiceAge = age;
    if (this.ctx && this.voiceReverb) this.voiceReverb.buffer = this.makeVoiceImpulse(age);
  }

  /** Play an announcer through the arcade radio processing chain. */
  playVoice(element: HTMLAudioElement): Promise<void> {
    if (!this.ctx || !this.voiceHighPass) return element.play();
    let source = this.voiceSources.get(element);
    if (!source) {
      source = this.ctx.createMediaElementSource(element);
      source.connect(this.voiceHighPass);
      this.voiceSources.set(element, source);
    }
    return element.play();
  }

  /** Set tension 0..1 — driven by how low the player tower HP is. */
  setTension(t: number): void {
    this.tension = Math.max(0, Math.min(1, t));
  }

  // ---------------------------------------------------------------
  // SFX
  // ---------------------------------------------------------------

  sfxSpawn(age: AgeKey = 'stone'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (age === 'modern') {
      this.playToneAt(t, { type: 'sine', freqStart: 900, freqEnd: 1800, dur: 0.08, vol: 0.18, attack: 0.002, decay: 0.07, dest: this.sfxGain });
      this.playToneAt(t + 0.04, { type: 'square', freqStart: 1200, freqEnd: 2400, dur: 0.09, vol: 0.15, attack: 0.002, decay: 0.08, dest: this.sfxGain });
    } else if (age === 'medieval') {
      this.playToneAt(t, { type: 'sawtooth', freqStart: 392, freqEnd: 523, dur: 0.18, vol: 0.24, attack: 0.01, decay: 0.16, dest: this.sfxGain });
      this.playToneAt(t + 0.05, { type: 'triangle', freqStart: 523, freqEnd: 659, dur: 0.22, vol: 0.22, attack: 0.01, decay: 0.19, dest: this.sfxGain });
    } else {
      this.playToneAt(t, { type: 'sine', freqStart: 120, freqEnd: 50, dur: 0.15, vol: 0.32, attack: 0.002, decay: 0.14, dest: this.sfxGain });
      this.playToneAt(t + 0.03, { type: 'sawtooth', freqStart: 220, freqEnd: 330, dur: 0.18, vol: 0.2, attack: 0.02, decay: 0.15, dest: this.sfxGain });
    }
  }

  sfxMeleeHit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'sine', freqStart: 180, freqEnd: 35, dur: 0.10, vol: 0.42, attack: 0.001, decay: 0.09, dest: this.sfxGain });
    this.playToneAt(t, { type: 'triangle', freqStart: 850, freqEnd: 420, dur: 0.05, vol: 0.22, attack: 0.001, decay: 0.04, dest: this.sfxGain });
    this.playNoiseAt(t, 0.08, 3200, 240, 0.28);
  }

  sfxCrit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'sine', freqStart: 280, freqEnd: 28, dur: 0.28, vol: 0.55, attack: 0.001, decay: 0.26, dest: this.sfxGain });
    this.playToneAt(t, { type: 'sawtooth', freqStart: 1400, freqEnd: 420, dur: 0.14, vol: 0.32, attack: 0.001, decay: 0.12, dest: this.sfxGain });
    this.playToneAt(t + 0.02, { type: 'triangle', freqStart: 2200, freqEnd: 1100, dur: 0.2, vol: 0.28, attack: 0.002, decay: 0.18, dest: this.sfxGain });
    this.playNoiseAt(t, 0.18, 5500, 400, 0.35);
  }

  sfxDeath(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'sawtooth', freqStart: 140, freqEnd: 32, dur: 0.28, vol: 0.3, attack: 0.002, decay: 0.26, dest: this.sfxGain });
    this.playNoiseAt(t, 0.18, 1200, 150, 0.22);
  }

  sfxUpgrade(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'triangle', freqStart: 1175, freqEnd: 1175, dur: 0.25, vol: 0.3, attack: 0.001, decay: 0.24, dest: this.sfxGain });
    this.playToneAt(t, { type: 'sine', freqStart: 1760, freqEnd: 1760, dur: 0.2, vol: 0.2, attack: 0.001, decay: 0.19, dest: this.sfxGain });
    const chord = [440, 554, 659, 880];
    chord.forEach((f, i) => {
      this.playToneAt(t + 0.06 + i * 0.04, { type: 'triangle', freqStart: f, freqEnd: f * 1.02, dur: 0.35, vol: 0.18, attack: 0.01, decay: 0.3, dest: this.sfxGain });
    });
  }

  sfxChronoSurge(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.55);
    this.playToneAt(t + 0.1, { type: 'sine', freqStart: 90, freqEnd: 30, dur: 0.6, vol: 0.4, attack: 0.01, decay: 0.55, dest: this.sfxGain });
  }

  sfxWarCry(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'sawtooth', freqStart: 220, freqEnd: 277, dur: 0.45, vol: 0.28, attack: 0.03, decay: 0.4, dest: this.sfxGain });
    this.playToneAt(t, { type: 'sawtooth', freqStart: 223, freqEnd: 280, dur: 0.45, vol: 0.28, attack: 0.03, decay: 0.4, dest: this.sfxGain });
    this.playToneAt(t + 0.08, { type: 'square', freqStart: 330, freqEnd: 440, dur: 0.5, vol: 0.22, attack: 0.04, decay: 0.42, dest: this.sfxGain });
    this.playNoiseAt(t + 0.05, 0.35, 1800, 400, 0.2);
  }

  sfxArrow(age: AgeKey = 'stone'): void {
    if (!this.ctx) return;
    const start = age === 'modern' ? 1600 : age === 'medieval' ? 1100 : 800;
    const end = age === 'modern' ? 380 : age === 'medieval' ? 320 : 260;
    const dur = age === 'modern' ? 0.1 : 0.16;
    this.playTone({ type: age === 'modern' ? 'square' : 'sawtooth', freqStart: start, freqEnd: end, dur, vol: 0.18, attack: 0.002, decay: dur, dest: this.sfxGain });
  }

  /**
   * Base-defence turret. Each age fires a different machine, so each age gets
   * its own signature instead of borrowing the bow shot.
   */
  sfxTurret(age: AgeKey = 'stone'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (age === 'modern') {
      // Twin MG: heavy chamber boom under rapid explosive cracks.
      this.playToneAt(t, { type: 'sine', freqStart: 160, freqEnd: 32, dur: 0.16, vol: 0.38, attack: 0.001, decay: 0.15, dest: this.sfxGain });
      this.playToneAt(t, { type: 'square', freqStart: 240, freqEnd: 70, dur: 0.09, vol: 0.22, attack: 0.001, decay: 0.08, dest: this.sfxGain });
      for (let i = 0; i < 3; i++) this.playNoiseAt(t + i * 0.05, 0.05, 5800, 1200, 0.22);
    } else if (age === 'medieval') {
      // Ballista: violent torsion snap, then massive structural bolt impact.
      this.playNoiseAt(t, 0.08, 3000, 600, 0.28);
      this.playToneAt(t + 0.01, { type: 'sine', freqStart: 180, freqEnd: 38, dur: 0.24, vol: 0.42, attack: 0.001, decay: 0.22, dest: this.sfxGain });
      this.playToneAt(t + 0.02, { type: 'triangle', freqStart: 280, freqEnd: 80, dur: 0.22, vol: 0.30, attack: 0.001, decay: 0.2, dest: this.sfxGain });
      this.playNoiseAt(t + 0.02, 0.16, 1200, 180, 0.24);
    } else {
      // Sling: whip crack, then heavy stone release and thud.
      this.playNoiseAt(t, 0.06, 3600, 800, 0.28);
      this.playToneAt(t, { type: 'sine', freqStart: 220, freqEnd: 42, dur: 0.18, vol: 0.36, attack: 0.001, decay: 0.16, dest: this.sfxGain });
      this.playToneAt(t, { type: 'triangle', freqStart: 480, freqEnd: 120, dur: 0.14, vol: 0.24, attack: 0.001, decay: 0.12, dest: this.sfxGain });
    }
  }

  /** Superweapon impact: meteor, fire-arrow volley or airstrike. */
  sfxStrike(kind: 'meteor' | 'volley' | 'airstrike'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'volley') {
      // Arrows saturating a zone: a rolling crackle under a descending drone.
      for (let i = 0; i < 8; i++) this.playNoiseAt(t + i * 0.06, 0.12, 3400 - i * 200, 700, 0.18);
      this.playToneAt(t, { type: 'sawtooth', freqStart: 320, freqEnd: 110, dur: 0.6, vol: 0.18, attack: 0.03, decay: 0.55, dest: this.sfxGain });
      this.playToneAt(t + 0.3, { type: 'sine', freqStart: 120, freqEnd: 30, dur: 0.5, vol: 0.35, attack: 0.01, decay: 0.45, dest: this.sfxGain });
    } else if (kind === 'airstrike') {
      // Falling whistle, then a massive carpet bombing shockwave.
      this.playToneAt(t, { type: 'sine', freqStart: 2100, freqEnd: 180, dur: 0.45, vol: 0.22, attack: 0.02, decay: 0.43, dest: this.sfxGain });
      for (let i = 0; i < 4; i++) this.playNoiseAt(t + 0.42 + i * 0.11, 0.42, 2400, 120, 0.36);
      this.playToneAt(t + 0.42, { type: 'sine', freqStart: 180, freqEnd: 24, dur: 0.9, vol: 0.55, attack: 0.001, decay: 0.85, dest: this.sfxGain });
    } else {
      // Meteor: atmospheric entry roar, then massive cataclysmic sub-blast.
      this.playToneAt(t, { type: 'sawtooth', freqStart: 70, freqEnd: 340, dur: 0.45, vol: 0.24, attack: 0.1, decay: 0.4, dest: this.sfxGain });
      this.playNoiseAt(t + 0.42, 0.9, 3200, 80, 0.45);
      this.playToneAt(t + 0.42, { type: 'sine', freqStart: 160, freqEnd: 20, dur: 1.1, vol: 0.6, attack: 0.001, decay: 1.0, dest: this.sfxGain });
    }
  }

  /** Timeline collapse: three alarm blips over a long descending drone. */
  sfxCollapse(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.playToneAt(t + i * 0.3, { type: 'square', freqStart: 900, freqEnd: 600, dur: 0.26, vol: 0.15, attack: 0.008, decay: 0.24, dest: this.sfxGain });
    }
    this.playToneAt(t, { type: 'sawtooth', freqStart: 170, freqEnd: 38, dur: 1.1, vol: 0.2, attack: 0.06, decay: 1.0, dest: this.sfxGain });
  }

  sfxGold(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'triangle', freqStart: 1760, freqEnd: 1760, dur: 0.12, vol: 0.22, attack: 0.001, decay: 0.11, dest: this.sfxGain });
    this.playToneAt(t + 0.04, { type: 'triangle', freqStart: 2637, freqEnd: 2637, dur: 0.16, vol: 0.24, attack: 0.001, decay: 0.15, dest: this.sfxGain });
    this.playToneAt(t + 0.08, { type: 'sine', freqStart: 3520, freqEnd: 3520, dur: 0.14, vol: 0.16, attack: 0.001, decay: 0.13, dest: this.sfxGain });
  }

  sfxEvolve(): void {
    if (!this.ctx) return;
    const notes = [392, 523, 659, 784, 1046, 1318];
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      this.playToneAt(t0 + i * 0.06, { type: 'triangle', freqStart: f, freqEnd: f * 1.06, dur: 0.2, vol: 0.25, attack: 0.005, decay: 0.16, dest: this.sfxGain });
    });
  }

  sfxBaseHit(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    // Sub boom
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.4);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.35, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g); g.connect(this.sfxGain);
    sub.connect(sg); sg.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.4);
    sub.start(t); sub.stop(t + 0.5);
  }

  sfxVictory(): void {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1046, 1318];
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      this.playToneAt(t0 + i * 0.11, { type: 'square', freqStart: f, freqEnd: f, dur: 0.25, vol: 0.28, attack: 0.005, decay: 0.22, dest: this.sfxGain });
    });
  }

  sfxDefeat(): void {
    if (!this.ctx) return;
    const notes = [523, 440, 330, 262, 220];
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      this.playToneAt(t0 + i * 0.14, { type: 'sawtooth', freqStart: f, freqEnd: f * 0.92, dur: 0.26, vol: 0.26, attack: 0.005, decay: 0.25, dest: this.sfxGain });
    });
  }

  sfxClick(): void {
    if (!this.ctx) return;
    this.playTone({ type: 'square', freqStart: 880, freqEnd: 660, dur: 0.04, vol: 0.14, attack: 0.002, decay: 0.04, dest: this.sfxGain });
  }

  sfxError(): void {
    if (!this.ctx) return;
    this.playTone({ type: 'square', freqStart: 220, freqEnd: 150, dur: 0.12, vol: 0.2, attack: 0.002, decay: 0.1, dest: this.sfxGain });
  }

  // ---------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.scheduler();
  }

  setMusicState(s: MusicState): void {
    this.musicState = s;
    if (!this.ctx || !this.musicStarted) return;
    const t = this.ctx.currentTime;
    if (s === 'win' || s === 'lose') {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(0.12, t, 0.3);
      this.leadGain.gain.setTargetAtTime(0.15, t, 0.3);
    } else {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(this.musicMuted ? 0 : 0.32, t, 0.2);
      this.leadGain.gain.setTargetAtTime(0.34, t, 0.2);
    }
  }

  private scheduler(): void {
    if (!this.ctx) return;
    const lookahead = 0.1;
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.nextStepTime);
      this.nextStepTime += this.stepDuration();
      this.step = (this.step + 1) % 128;
    }
    window.setTimeout(() => this.scheduler(), 50);
  }

  private stepDuration(): number {
    const pat = this.patterns[this.musicAge];
    let bpm = pat.bpm;
    if (this.musicState === 'menu') bpm *= 0.88;
    if (this.musicState === 'win') bpm = 150;
    if (this.musicState === 'lose') bpm = 70;
    bpm *= 1 + this.tension * 0.08; // slight accel on tension
    return 60 / bpm / 4;
  }

  private scheduleStep(t: number): void {
    const pat = this.patterns[this.musicAge];
    const idx = this.step % BAR_STEPS;
    const bar = Math.floor(this.step / BAR_STEPS) % PHRASE_BARS;

    if (this.musicState === 'win' || this.musicState === 'lose') {
      if (idx === 0) this.playBass(t, this.musicState === 'win' ? 'C3' : 'C2', pat.waveBass, 0.3);
      if (idx % 4 === 0) this.playKick(t, 0.28);
      if (idx === 4 || idx === 12) this.playHat(t, 0.06);
      return;
    }

    // Pad: long sustained chord on downbeats (very subtle, fills space)
    if (idx === 0 || idx === 8) {
      const chord = pat.bass[bar % pat.bass.length]![idx]!;
      if (chord && chord !== 'r') this.playPad(t, chord, pat.wavePad);
    }

    // Bass
    const bRow = pat.bass[bar % pat.bass.length]!;
    const b = bRow[idx];
    if (b && b !== 'r') this.playBass(t, b, pat.waveBass, 0.35 + this.tension * 0.1);

    // Lead — louder/earlier during tension
    const lRow = pat.lead[bar % pat.lead.length]!;
    const l = lRow[idx];
    if (l && l !== 'r') this.playLead(t, l, pat.waveLead, 0.16 + this.tension * 0.08);

    // Arp (medieval/modern only — stone stays empty for primal feel)
    if (this.musicAge !== 'stone') {
      const aRow = pat.arp[bar % pat.arp.length]!;
      const a = aRow[idx];
      if (a && a !== 'r') this.playArp(t, a, 0.14);
    }

    // Drums
    const dRow = pat.drums[bar % pat.drums.length]!;
    const d = dRow[idx];
    const drumK = 0.35 + this.tension * 0.1;
    if (d === 'K') this.playKick(t, drumK);
    else if (d === 'S') this.playSnare(t, 0.22 + this.tension * 0.05);
    else if (d === 'H') this.playHat(t, 0.08);
  }

  // ---------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------

  private playBass(t: number, note: string, type: OscillatorType, vol: number): void {
    const f = noteToFreq(note);
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g); g.connect(this.bassGain);
    osc.start(t); osc.stop(t + 0.28);
  }

  private playPad(t: number, bassNote: string, type: OscillatorType): void {
    // A sustained diatonic triad under the bass, taken from the age's own scale
    // so the pad follows the harmony instead of droning a hollow root+fifth.
    const root = noteToFreq(bassNote);
    const pc = pitchClassOf(bassNote);
    const ratios = pc === null ? [1, 1.5, 2] : triadIntervals(pc, this.patterns[this.musicAge].scale);
    const freqs = ratios.map((r) => root * r);
    for (const f of freqs) {
      const osc = this.ctx!.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.25);
      g.gain.linearRampToValueAtTime(0, t + 1.1);
      osc.connect(g); g.connect(this.padGain);
      osc.start(t); osc.stop(t + 1.2);
    }
  }

  private playLead(t: number, note: string, type: OscillatorType, vol: number): void {
    const f = noteToFreq(note);
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.995, t + 0.18);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g); g.connect(this.leadGain);
    osc.start(t); osc.stop(t + 0.22);
  }

  private playArp(t: number, note: string, vol: number): void {
    const f = noteToFreq(note);
    const osc = this.ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g); g.connect(this.arpGain);
    osc.start(t); osc.stop(t + 0.14);
  }

  private playKick(t: number, vol: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    // click
    const c = this.ctx!.createOscillator();
    c.type = 'square';
    c.frequency.setValueAtTime(1200, t);
    const cg = this.ctx!.createGain();
    cg.gain.setValueAtTime(vol * 0.2, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    osc.connect(g); g.connect(this.drumGain);
    c.connect(cg); cg.connect(this.drumGain);
    osc.start(t); osc.stop(t + 0.2);
    c.start(t); c.stop(t + 0.04);
  }

  private playSnare(t: number, vol: number): void {
    const buf = this.getOrMakeNoiseBuffer(0.4);
    if (!buf) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 1300;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter); filter.connect(g); g.connect(this.drumGain);
    src.start(t); src.stop(t + 0.16);
    // Tonal body
    const osc = this.ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = this.ctx!.createGain();
    og.gain.setValueAtTime(vol * 0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og); og.connect(this.drumGain);
    osc.start(t); osc.stop(t + 0.12);
  }

  private playHat(t: number, vol: number): void {
    const buf = this.getOrMakeNoiseBuffer(0.3);
    if (!buf) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 6500;
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter); filter.connect(g); g.connect(this.drumGain);
    src.start(t); src.stop(t + 0.06);
  }

  private playTone(params: {
    type: OscillatorType;
    freqStart: number; freqEnd: number;
    dur: number; vol: number; attack: number; decay: number;
    dest: GainNode;
  }): void {
    this.playToneAt(this.ctx!.currentTime, params);
  }

  private playToneAt(t: number, params: {
    type: OscillatorType;
    freqStart: number; freqEnd: number;
    dur: number; vol: number; attack: number; decay: number;
    dest: GainNode;
  }): void {
    if (!this.ctx) return;
    const { type, freqStart, freqEnd, dur, vol, attack, decay, dest } = params;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst — the percussion half of the turret and strike kits. */
  private playNoiseAt(t: number, dur: number, filterStart: number, filterEnd: number, vol: number): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getOrMakeNoiseBuffer(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  private makeBitCrusherCurve(bits: number): Float32Array<ArrayBuffer> {
    const levels = 2 ** bits;
    const curve = new Float32Array(new ArrayBuffer(4096 * Float32Array.BYTES_PER_ELEMENT));
    for (let i = 0; i < curve.length; i++) {
      const input = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(((input + 1) * 0.5) * (levels - 1)) / (levels - 1) * 2 - 1;
    }
    return curve;
  }

  private makeVoiceImpulse(age: AgeKey): AudioBuffer {
    const durations: Record<AgeKey, number> = { stone: 0.16, medieval: 0.22, modern: 0.28 };
    const seconds = durations[age];
    const length = Math.floor(this.ctx!.sampleRate * seconds);
    const impulse = this.ctx!.createBuffer(2, length, this.ctx!.sampleRate);
    const decay = age === 'modern' ? 3.2 : age === 'medieval' ? 4.2 : 5.5;
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  private noiseBuf: AudioBuffer | null = null;
  private getOrMakeNoiseBuffer(seconds: number): AudioBuffer {
    if (!this.ctx) throw new Error('no ctx');
    if (!this.noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * Math.max(seconds, 0.5));
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }
}

function noteToFreq(note: string): number {
  const m = note.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!m) return 440;
  const letter = m[1]!;
  const accidental = m[2] ?? '';
  const octave = parseInt(m[3]!, 10);
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let n = semitones[letter]! + (octave + 1) * 12;
  if (accidental === '#') n += 1;
  if (accidental === 'b') n -= 1;
  return 440 * Math.pow(2, (n - 69) / 12);
}

export const audio = new AudioEngine();
