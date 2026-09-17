import { debugError } from '@/lib/debug';

/**
 * The ambient bed.
 *
 * Two layers held at constant volume with their mix driven by the clock, rather
 * than one loop that cuts over at dusk: a hard switch is the most audible seam
 * in an otherwise continuous soundscape.
 *
 * Split out of SoundManager to keep both files under 500 lines.
 */
export class AmbientBed {
  private day: GainNode | null = null;
  private night: GainNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private ctx: AudioContext,
    private out: GainNode,
  ) {}

  /** Gain node for the daytime layer, so the manager can crossfade it. */
  get dayLayer() {
    return this.day;
  }

  get nightLayer() {
    return this.night;
  }

  start() {
    try {
      this.day = this.ctx.createGain();
      this.day.gain.value = 0.28;
      this.day.connect(this.out);

      this.night = this.ctx.createGain();
      this.night.gain.value = 0;
      this.night.connect(this.out);

      this.startDay();
      this.startNight();
    } catch (e) {
      debugError('Failed to start the ambient bed', e);
    }
  }

  /** Stop the scheduled callbacks; the oscillators die with the context. */
  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  /** Daytime: filtered wind that wanders, and occasional birds. */
  private startDay() {

      // Wind sound (White noise + Low pass filter)
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 1;

      const windGain = this.ctx.createGain();
      windGain.gain.value = 0.1;

      whiteNoise.connect(filter);
      filter.connect(windGain);
      windGain.connect(this.day!);

      whiteNoise.start();

      // Modulate wind
      const modulateWind = () => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        filter.frequency.exponentialRampToValueAtTime(200 + Math.random() * 600, now + 2 + Math.random() * 3);
        windGain.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.1, now + 2 + Math.random() * 3);
        this.later(modulateWind, 3000 + Math.random() * 2000);
      };
      modulateWind();

      // Occasional birds
      const playBird = () => {
        if (this.ctx.state !== 'running') {
          this.later(playBird, 5000);
          return;
        }
        this.playBirdChirp();
        this.later(playBird, 10000 + Math.random() * 20000);
      };
      playBird();
  }

  /**
   * Night: a lower, darker drone with sparse crickets. Deliberately quieter and
   * less eventful than day, so nightfall feels like the world going still.
   */
  private startNight() {
    const size = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.16;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.night!);
    noise.start();

    const cricket = () => {
      if (this.ctx.state === 'running' && (this.night?.gain.value ?? 0) > 0.02) {
        const t = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = 4200 + Math.random() * 400;
          g.gain.setValueAtTime(0, t + i * 0.08);
          g.gain.linearRampToValueAtTime(0.02, t + i * 0.08 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.05);
          osc.connect(g);
          g.connect(this.night!);
          osc.start(t + i * 0.08);
          osc.stop(t + i * 0.08 + 0.06);
        }
      }
      this.later(cricket, 4000 + Math.random() * 6000);
    };
    this.later(cricket, 3000);
  }

    private playBirdChirp() {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2000 + Math.random() * 1000, now);
      osc.frequency.exponentialRampToValueAtTime(3000 + Math.random() * 1000, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 1000, now + 0.2);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);

      osc.connect(gain);
      gain.connect(this.day!);

      osc.start(now);
      osc.stop(now + 0.2);
    }
}
