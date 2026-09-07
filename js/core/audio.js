// Tiny WebAudio sound effects — synthesized, no asset files.
// AudioContext is created lazily on the first user gesture (browser policy).
let ctx = null;
let muted = false;

export function setMuted(m) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function ac() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!ctx) ctx = new window.AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.15, delay = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch {
    // audio unavailable — silent
  }
}

export const sfx = {
  ui: () => tone(660, 0.06, 'square', 0.07),
  hit: () => {
    tone(220, 0.09, 'sawtooth', 0.16);
    tone(150, 0.13, 'sawtooth', 0.13, 0.05);
  },
  crit: () => {
    tone(320, 0.1, 'sawtooth', 0.18);
    tone(240, 0.14, 'sawtooth', 0.16, 0.06);
    tone(150, 0.2, 'sawtooth', 0.14, 0.12);
  },
  miss: () => tone(300, 0.09, 'sine', 0.08),
  hurt: () => {
    tone(140, 0.1, 'sawtooth', 0.15);
    tone(90, 0.16, 'sawtooth', 0.13, 0.06);
  },
  defend: () => {
    tone(180, 0.12, 'triangle', 0.14);
    tone(120, 0.16, 'triangle', 0.11, 0.08);
  },
  potion: () => {
    tone(520, 0.1, 'sine', 0.11);
    tone(780, 0.14, 'sine', 0.09, 0.08);
  },
  skill: () => {
    tone(440, 0.08, 'square', 0.11);
    tone(660, 0.1, 'square', 0.09, 0.07);
  },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.09)),
  victory: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, 'square', 0.11, i * 0.12)),
  defeat: () => [330, 262, 196, 131].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.11, i * 0.15)),
};
