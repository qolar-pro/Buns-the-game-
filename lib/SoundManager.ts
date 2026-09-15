import { debugError } from '@/lib/debug';
import { AmbientBed } from '@/lib/AmbientBed';
/**
 * SoundManager using Web Audio API to generate procedural sounds.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  /** The two-layer ambient bed; crossfaded by setAmbientMix. */
  private ambient: AmbientBed | null = null;
  private sfxGain: GainNode | null = null;
  private isInitialized = false;

  constructor() {
    // Context is initialized on first user interaction
  }

  private init() {
    if (this.isInitialized) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.3;
      this.ambientGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.masterGain);

      this.isInitialized = true;
      this.ambient = new AmbientBed(this.ctx, this.ambientGain);
      this.ambient.start();
    } catch (e) {
      debugError('Failed to initialize AudioContext', e);
    }
  }

  public resume() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }



  public playFootstep() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playChop() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    
    // Impact noise
    const noise = this.createNoiseSource(0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.1);

    // Wood resonance
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playMine() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    
    // Metallic ping
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);

    // Debris noise
    const noise = this.createNoiseSource(0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  public playHit() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    
    // Impact noise
    const noise = this.createNoiseSource(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.15);

    // Low thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playCraft() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.1;
      const noise = this.createNoiseSource(0.05);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      noise.connect(gain);
      gain.connect(this.sfxGain);
      noise.start(t);
      noise.stop(t + 0.05);
    }
  }

  // --- Added in the overhaul -------------------------------------------------
  // The original had chop, mine, hit, craft, click and animal calls. These fill
  // in the feedback the game was missing: picking things up, eating, placing,
  // opening containers, low health, and the day/night turn.

  /** A short shaped tone. The building block for most of the cues below. */
  private tone(
    freq: number,
    duration: number,
    opts: { type?: OscillatorType; gain?: number; delay?: number; sweepTo?: number } = {},
  ) {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + duration);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(opts.gain ?? 0.12, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Harvest feedback, distinct per material.
   *
   * One sound for every material made wood and stone indistinguishable by ear,
   * which matters because the player often harvests off-screen edges.
   */
  public playHarvest(material: 'wood' | 'stone' | 'ore' | 'plant' | 'wool') {
    switch (material) {
      case 'wood':
        this.playChop();
        break;
      case 'stone':
        this.playMine();
        break;
      case 'ore':
        // Brighter and more metallic than plain stone.
        this.playMine();
        this.tone(880, 0.12, { type: 'triangle', gain: 0.07, delay: 0.04 });
        break;
      case 'plant':
        this.tone(320, 0.09, { type: 'sawtooth', gain: 0.05, sweepTo: 180 });
        break;
      case 'wool':
        this.tone(200, 0.14, { type: 'sine', gain: 0.05, sweepTo: 150 });
        break;
    }
  }

  /** An item entering the inventory: two quick rising notes. */
  public playPickup() {
    this.tone(660, 0.07, { type: 'triangle', gain: 0.08 });
    this.tone(990, 0.09, { type: 'triangle', gain: 0.07, delay: 0.06 });
  }

  /** Crafting refused — a recipe the player cannot afford. */
  public playCraftFail() {
    this.tone(200, 0.14, { type: 'square', gain: 0.06, sweepTo: 120 });
  }

  /** Eating: two soft muted thuds. */
  public playEat() {
    this.tone(180, 0.1, { type: 'sine', gain: 0.09, sweepTo: 130 });
    this.tone(160, 0.12, { type: 'sine', gain: 0.07, sweepTo: 110, delay: 0.13 });
  }

  /** Setting an object down. */
  public playPlace() {
    this.tone(150, 0.1, { type: 'square', gain: 0.07, sweepTo: 90 });
    this.tone(300, 0.06, { type: 'triangle', gain: 0.04, delay: 0.02 });
  }

  /** A chest or furnace opening. */
  public playOpenContainer() {
    this.tone(420, 0.1, { type: 'triangle', gain: 0.06, sweepTo: 620 });
  }

  /** And closing: the same shape, inverted. */
  public playCloseContainer() {
    this.tone(620, 0.1, { type: 'triangle', gain: 0.06, sweepTo: 420 });
  }

  /**
   * Low-health heartbeat.
   *
   * Called from the survival tick while health is critical; the two-thump
   * shape is what makes it read as a heartbeat rather than an error tone.
   */
  public playHeartbeat() {
    this.tone(60, 0.16, { type: 'sine', gain: 0.22, sweepTo: 42 });
    this.tone(55, 0.18, { type: 'sine', gain: 0.16, sweepTo: 38, delay: 0.2 });
  }

  /** A short sting when day turns to night, and the reverse. */
  public playDayNightSting(toNight: boolean) {
    if (toNight) {
      this.tone(330, 0.5, { type: 'sine', gain: 0.08, sweepTo: 165 });
      this.tone(220, 0.7, { type: 'sine', gain: 0.05, sweepTo: 110, delay: 0.1 });
    } else {
      this.tone(220, 0.5, { type: 'sine', gain: 0.07, sweepTo: 440 });
      this.tone(330, 0.6, { type: 'triangle', gain: 0.04, sweepTo: 660, delay: 0.1 });
    }
  }

  /**
   * Crossfade the ambient bed between day and night.
   *
   * Two layers held at constant volume with their mix driven by the clock,
   * rather than one loop that cuts over: a hard switch at dusk is the most
   * obvious seam in an otherwise continuous soundscape.
   */
  public setAmbientMix(nightAmount: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const night = Math.max(0, Math.min(1, nightAmount));
    const now = this.ctx.currentTime;
    this.ambient?.dayLayer?.gain.setTargetAtTime(0.28 * (1 - night), now, 1.5);
    this.ambient?.nightLayer?.gain.setTargetAtTime(0.22 * night, now, 1.5);
  }

  public playClick() {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playAnimal(type: string) {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    switch (type) {
      case 'cow':
        this.playMoo(now);
        break;
      case 'pig':
        this.playOink(now);
        break;
      case 'sheep':
        this.playBaa(now);
        break;
      case 'chicken':
        this.playCluck(now);
        break;
    }
  }

  private playMoo(now: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  private playOink(now: number) {
    if (!this.ctx || !this.sfxGain) return;
    const noise = this.createNoiseSource(0.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.2);
  }

  private playBaa(now: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    
    // Vibrato
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 10;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
    lfo.stop(now + 0.4);
  }

  private playCluck(now: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  private createNoiseSource(duration: number): AudioBufferSourceNode {
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }
}

export const soundManager = new SoundManager();
