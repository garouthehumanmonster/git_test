/**
 * Audio.ts — upgraded chiptune engine. Three per-age adaptive arrangements
 * (stone / medieval / modern) with bass + chord pad + lead + arpeggio + drums.
 * Tempo/intensity shifts by game state and base-HP tension. All synthesized
 * with Web Audio — zero external assets.
 */

type MusicState = 'menu' | 'playing' | 'win' | 'lose';
export type AgeKey = 'stone' | 'medieval' | 'modern';

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
  private musicStarted = false;
  private nextStepTime = 0;
  private step = 0;
  private musicState: MusicState = 'menu';
  private musicAge: AgeKey = 'stone';
  private muted = false;
  private musicMuted = false;
  private tension = 0; // 0..1, drives filter + lead intensity when base is low

  // Per-age patterns (16-step bars, cycling for variety).
  // Bass: root/fifth pattern in a key befitting the age.
  private readonly patterns: Record<AgeKey, {
    bpm: number;
    bass: string[][]; lead: string[][]; arp: string[][]; drums: string[][];
    waveBass: OscillatorType; waveLead: OscillatorType; wavePad: OscillatorType;
  }> = {
    stone: {
      bpm: 108,
      waveBass: 'triangle', waveLead: 'square', wavePad: 'sawtooth',
      bass: [
        ['A1','r','r','A1','E2','r','A1','r','G1','r','r','G1','D2','r','G1','r'],
        ['A1','r','E2','r','A1','r','E2','A1','G1','r','D2','r','G1','r','D2','G1'],
      ],
      lead: [
        ['r','C4','E4','r','G4','r','E4','C4','r','Bb3','C4','r','Eb4','G4','r','r'],
        ['r','A3','C4','E4','r','G4','E4','C4','Bb3','r','C4','Eb4','r','G4','E4','C4'],
      ],
      arp: [
        ['r','r','r','r','r','r','r','r','r','r','r','r','r','r','r','r'],
      ],
      drums: [
        ['K','r','r','r','K','r','H','r','K','r','r','K','r','H','K','H'],
        ['K','r','H','r','K','H','K','H','K','r','H','K','S','H','K','H'],
      ],
    },
    medieval: {
      bpm: 126,
      waveBass: 'triangle', waveLead: 'square', wavePad: 'triangle',
      bass: [
        ['D2','r','A2','r','D2','r','A2','r','G2','r','D2','r','G2','r','A2','r'],
        ['D2','r','A2','F#2','G2','r','D2','r','Bb1','r','F2','r','A2','r','D2','A2'],
      ],
      lead: [
        ['r','D4','F#4','A4','r','A4','F#4','D4','r','C4','Eb4','G4','r','Bb4','A4','F#4'],
        ['F#4','r','A4','D5','r','A4','F#4','D4','G4','r','Bb4','D5','r','A4','F#4','D4'],
      ],
      arp: [
        ['D3','r','A3','r','F#3','r','A3','r','G3','r','D3','r','Bb3','r','A3','r'],
      ],
      drums: [
        ['K','r','H','r','K','H','K','H','K','r','H','r','S','H','K','H'],
        ['K','H','r','H','K','H','K','H','K','H','r','K','S','H','K','H'],
      ],
    },
    modern: {
      bpm: 148,
      waveBass: 'sawtooth', waveLead: 'square', wavePad: 'sawtooth',
      bass: [
        ['E1','r','G1','r','B1','r','E2','r','A1','r','C2','r','E2','r','B1','r'],
        ['E1','B1','r','G1','B1','r','E2','B1','A1','E2','r','C2','E2','B1','r','G1'],
      ],
      lead: [
        ['r','E5','r','G5','r','B5','r','E6','r','G5','r','E5','r','B5','G5','E5'],
        ['B4','r','E5','G5','r','B5','E6','r','A5','r','G5','E5','r','B5','r','E5'],
      ],
      arp: [
        ['E3','G3','B3','E4','G3','B3','E4','G4','A3','C4','E4','A4','C4','E4','G4','B4'],
        ['E3','B3','G3','E4','B3','G3','E4','B4','A3','E4','C4','A4','E4','C4','B4','G4'],
      ],
      drums: [
        ['K','r','H','H','K','H','K','H','K','H','H','K','S','H','K','H'],
        ['K','H','S','H','K','H','K','S','K','H','S','K','S','H','K','H'],
      ],
    },
  };

  async init(): Promise<void> {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.65;

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

  /** Set tension 0..1 — driven by how low the player tower HP is. */
  setTension(t: number): void {
    this.tension = Math.max(0, Math.min(1, t));
  }

  // ---------------------------------------------------------------
  // SFX
  // ---------------------------------------------------------------

  sfxSpawn(age: AgeKey = 'stone'): void {
    if (!this.ctx) return;
    const baseFreq = age === 'modern' ? 820 : age === 'medieval' ? 560 : 380;
    this.playTone({ type: 'square', freqStart: baseFreq, freqEnd: baseFreq * 1.9, dur: 0.14, vol: 0.22, attack: 0.004, decay: 0.1, dest: this.sfxGain });
  }

  sfxMeleeHit(): void {
    if (!this.ctx) return;
    const dur = 0.08;
    const t = this.ctx.currentTime;
    const buffer = this.getOrMakeNoiseBuffer(0.2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  sfxArrow(age: AgeKey = 'stone'): void {
    if (!this.ctx) return;
    const start = age === 'modern' ? 1600 : age === 'medieval' ? 1100 : 800;
    const end = age === 'modern' ? 380 : age === 'medieval' ? 320 : 260;
    const dur = age === 'modern' ? 0.1 : 0.16;
    this.playTone({ type: age === 'modern' ? 'square' : 'sawtooth', freqStart: start, freqEnd: end, dur, vol: 0.18, attack: 0.002, decay: dur, dest: this.sfxGain });
  }

  sfxGold(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.playToneAt(t, { type: 'square', freqStart: 1046, freqEnd: 1046, dur: 0.06, vol: 0.18, attack: 0.001, decay: 0.06, dest: this.sfxGain });
    this.playToneAt(t + 0.06, { type: 'square', freqStart: 1318, freqEnd: 1568, dur: 0.12, vol: 0.2, attack: 0.001, decay: 0.1, dest: this.sfxGain });
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
    const idx = this.step % 16;
    const barVariant = Math.floor(this.step / 16) % 2;

    if (this.musicState === 'win' || this.musicState === 'lose') {
      if (idx === 0) this.playBass(t, this.musicState === 'win' ? 'C3' : 'C2', pat.waveBass, 0.3);
      if (idx % 4 === 0) this.playKick(t, 0.28);
      if (idx === 4 || idx === 12) this.playHat(t, 0.06);
      return;
    }

    // Pad: long sustained chord on downbeats (very subtle, fills space)
    if (idx === 0 || idx === 8) {
      const chord = pat.bass[0]![idx]!;
      if (chord && chord !== 'r') this.playPad(t, chord, pat.wavePad);
    }

    // Bass
    const bRow = pat.bass[barVariant % pat.bass.length]!;
    const b = bRow[idx];
    if (b && b !== 'r') this.playBass(t, b, pat.waveBass, 0.35 + this.tension * 0.1);

    // Lead — louder/earlier during tension
    const lRow = pat.lead[barVariant % pat.lead.length]!;
    const l = lRow[idx];
    if (l && l !== 'r') this.playLead(t, l, pat.waveLead, 0.16 + this.tension * 0.08);

    // Arp (medieval/modern only — stone stays empty for primal feel)
    if (this.musicAge !== 'stone') {
      const aRow = pat.arp[barVariant % pat.arp.length]!;
      const a = aRow[idx];
      if (a && a !== 'r') this.playArp(t, a, 0.14);
    }

    // Drums
    const dRow = pat.drums[barVariant % pat.drums.length]!;
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
    // Play a soft sustained 5th chord under the bass.
    const root = noteToFreq(bassNote);
    const freqs = [root * 1, root * 1.5, root * 2];
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
