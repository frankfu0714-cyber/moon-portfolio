"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { useSceneStore } from "@/lib/store";

// ------------------------------------------------------------------
// Chill generative ambient music, synthesized live with WebAudio.
// No mp3 to license, host, or fail to fetch: slow lush pad chords
// drifting through a mellow progression, with occasional soft
// pentatonic plucks echoing through a feedback delay. Starts on the
// first unmute click (satisfies the browser's user-gesture rule).
// ------------------------------------------------------------------

// Chord progression (frequencies in Hz) — Am9 → Fmaj7 → Cmaj7 → G6,
// voiced low and wide for a spacey drift.
const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 261.63, 329.63], // A2 E3 A3 C4 E4  (Am add9-ish)
  [87.31, 174.61, 220.0, 261.63, 349.23], // F2 F3 A3 C4 F4  (Fmaj7)
  [130.81, 196.0, 261.63, 329.63, 392.0], // C3 G3 C4 E4 G4  (Cmaj7)
  [98.0, 196.0, 246.94, 293.66, 392.0], // G2 G3 B3 D4 G4  (G6)
];
const CHORD_SECONDS = 10; // one chord per 10s, 4s crossfade
const CHORD_FADE = 4;

// A-minor pentatonic pool for the sparse melody plucks.
const PLUCK_NOTES = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

class AmbientMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private delaySend: GainNode | null = null;
  private chordGains: GainNode[] = [];
  private chordTimer: ReturnType<typeof setInterval> | null = null;
  private pluckTimer: ReturnType<typeof setTimeout> | null = null;
  private chordIndex = 0;
  private running = false;

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    if (!this.ctx) {
      this.build();
    } else {
      void this.ctx.resume();
      this.fadeMaster(0.16, 2.5);
      this.scheduleChords();
      this.schedulePluck();
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.chordTimer) clearInterval(this.chordTimer);
    if (this.pluckTimer) clearTimeout(this.pluckTimer);
    this.chordTimer = null;
    this.pluckTimer = null;
    if (this.ctx && this.master) {
      this.fadeMaster(0.0001, 1.2);
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.running) void ctx.suspend();
      }, 1400);
    }
  }

  private fadeMaster(to: number, seconds: number) {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 0.0001), this.ctx.currentTime);
    g.exponentialRampToValueAtTime(to, this.ctx.currentTime + seconds);
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.master = master;

    // Feedback delay — the "space" the plucks echo into.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.46;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = "lowpass";
    delayTone.frequency.value = 1600;
    delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(delay);
    delayTone.connect(master);
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.5;
    delaySend.connect(delay);
    this.delaySend = delaySend;

    // Shared pad filter with a very slow LFO breathing the cutoff.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 750;
    padFilter.Q.value = 0.4;
    padFilter.connect(master);
    padFilter.connect(delaySend);
    this.padFilter = padFilter;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // One gain lane per chord; oscillators run forever, lanes crossfade.
    this.chordGains = CHORDS.map((chord) => {
      const lane = ctx.createGain();
      lane.gain.value = 0.0001;
      lane.connect(padFilter);
      chord.forEach((freq) => {
        [0, 1].forEach((k) => {
          const osc = ctx.createOscillator();
          osc.type = k === 0 ? "sine" : "triangle";
          osc.frequency.value = freq;
          osc.detune.value = k === 0 ? -4 : 5;
          const og = ctx.createGain();
          og.gain.value = k === 0 ? 0.05 : 0.022;
          osc.connect(og);
          og.connect(lane);
          osc.start();
        });
      });
      return lane;
    });

    this.chordIndex = 0;
    this.setChord(0, true);
    this.fadeMaster(0.16, 3);
    this.scheduleChords();
    this.schedulePluck();
  }

  private setChord(idx: number, immediate = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.chordGains.forEach((lane, i) => {
      const target = i === idx ? 1 : 0.0001;
      lane.gain.cancelScheduledValues(t);
      lane.gain.setValueAtTime(Math.max(lane.gain.value, 0.0001), t);
      lane.gain.exponentialRampToValueAtTime(
        target,
        t + (immediate ? 0.05 : CHORD_FADE),
      );
    });
  }

  private scheduleChords() {
    if (this.chordTimer) clearInterval(this.chordTimer);
    this.chordTimer = setInterval(() => {
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.setChord(this.chordIndex);
    }, CHORD_SECONDS * 1000);
  }

  private schedulePluck() {
    if (this.pluckTimer) clearTimeout(this.pluckTimer);
    const wait = 2500 + Math.random() * 5500;
    this.pluckTimer = setTimeout(() => {
      this.pluck();
      if (this.running) this.schedulePluck();
    }, wait);
  }

  // Autoplay policy leaves the context suspended until the first user
  // gesture; poke it awake so sound-on-by-default actually makes noise.
  unlock() {
    if (this.running && this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  private pluck() {
    const ctx = this.ctx;
    if (!ctx || !this.delaySend || !this.master) return;
    const freq =
      PLUCK_NOTES[Math.floor(Math.random() * PLUCK_NOTES.length)] /
      (Math.random() < 0.35 ? 2 : 1);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    osc.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    osc.start(t);
    osc.stop(t + 3);
  }
}

const music = typeof window !== "undefined" ? new AmbientMusic() : null;

export function MuteButton() {
  const muted = useSceneStore((s) => s.muted);
  const toggleMute = useSceneStore((s) => s.toggleMute);

  useEffect(() => {
    if (!music) return;
    if (muted) {
      music.stop();
      return;
    }
    music.start();
    // Sound defaults to on, but browsers refuse to start audio without
    // a user gesture — resume the context on the first interaction.
    const unlock = () => {
      music.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [muted]);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={toggleMute}
      aria-label={muted ? "Play ambient music" : "Mute ambient music"}
      className="rounded-full border border-white/15 bg-black/40 backdrop-blur px-3 py-2 text-xs opacity-80 hover:opacity-100 transition font-mono"
    >
      {muted ? "SOUND · OFF" : "SOUND · ON"}
    </motion.button>
  );
}
