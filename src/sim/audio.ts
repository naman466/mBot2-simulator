// CyberPi's speaker, played through the Web Audio API. The built-in voice clips
// ("hi", "laugh", ...) can't be reproduced, so each gets a short, recognisable
// jingle of the same length class instead.

const DRUMS: Record<string, number> = {
  "snare": 220, "bass-drum": 70, "side-stick": 900, "crash-cymbal": 5000, "open-hi-hat": 7000,
  "closed-hi-hat": 8000, "tambourine": 6000, "hand-clap": 1500, "claves": 2500,
};

export class Speaker {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes = new Set<AudioScheduledSourceNode>();
  /** 0–100 like CyberPi's volume. */
  public volume = 50;
  /** Playback speed in percent. */
  public speed = 100;
  public muted = false;

  /** Must be called from a user gesture once so browsers allow sound. */
  public unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  private get ready() {
    return this.ctx && this.master && !this.muted && this.ctx.state === "running";
  }

  private gain() {
    return 0.25 * Math.max(0, Math.min(100, this.volume)) / 100;
  }

  private beep(freq: number, seconds: number, type: OscillatorType = "square", at = 0) {
    if (!this.ready || freq <= 0 || seconds <= 0) return;
    const ctx = this.ctx!;
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = Math.min(freq, 12000);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(this.gain(), start + 0.005);
    env.gain.setValueAtTime(this.gain(), start + Math.max(0.005, seconds - 0.02));
    env.gain.linearRampToValueAtTime(0, start + seconds);
    osc.connect(env).connect(this.master!);
    osc.start(start);
    osc.stop(start + seconds + 0.01);
    this.track(osc);
  }

  private noise(seconds: number, cutoff: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = cutoff < 500 ? "lowpass" : "highpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.value = this.gain() * 1.5;
    source.connect(filter).connect(env).connect(this.master!);
    source.start();
    this.track(source);
  }

  private track(node: AudioScheduledSourceNode) {
    this.nodes.add(node);
    node.onended = () => this.nodes.delete(node);
  }

  private scaled(seconds: number) {
    return seconds * (100 / Math.max(10, this.speed));
  }

  /** Plays a tone; returns how long it lasts in ms. */
  public tone(freq: number, seconds: number) {
    this.beep(freq, seconds);
    return seconds * 1000;
  }

  /** Plays a MIDI note number for a number of beats (1 beat = 1 s at 100 % speed). */
  public note(midi: number, beats: number) {
    const seconds = this.scaled(beats);
    this.beep(440 * Math.pow(2, (midi - 69) / 12), seconds, "triangle");
    return seconds * 1000;
  }

  public drum(name: string, beats: number) {
    const seconds = this.scaled(beats);
    this.noise(Math.min(seconds, 0.3), DRUMS[name] ?? 1000);
    return seconds * 1000;
  }

  /** Plays a stand-in jingle for a built-in sound clip. */
  public clip(name: string) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const scale = [523, 587, 659, 784, 880, 1047];
    const notes = 2 + (hash % 3);
    const len = 0.12;
    for (let i = 0; i < notes; i++) {
      this.beep(scale[(hash >> (i * 3)) % scale.length], len, "square", i * len);
    }
    return notes * len * 1000;
  }

  public stop() {
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.nodes.clear();
  }
}

export const speaker = new Speaker();
