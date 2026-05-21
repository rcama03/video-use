// Exact reimplementation of the intro HTML Web Audio API sounds.
const fs = require('fs');

const SAMPLE_RATE = 44100;
const DURATION    = 5.5;
const N           = Math.ceil(SAMPLE_RATE * DURATION);
const left  = new Float32Array(N);
const right = new Float32Array(N);

function si(t) { return Math.max(0, Math.floor(t * SAMPLE_RATE)); }

function expRamp(v0, v1, t0, t1, t) {
  if (t <= t0) return v0;
  if (t >= t1) return v1;
  return v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
}

function mix(i, v) {
  if (i >= 0 && i < N) { left[i] += v; right[i] += v; }
}

// boom: sine oscillator, pitch drops freq→freq*0.4 over dur,
// lowpass@300Hz (freq 60-90Hz is below cutoff so pass-through),
// gain: 0→vol linear 0.02s, vol→0.001 exp over dur
function addBoom(freq, vol, st, dur) {
  const s0 = si(st), s1 = Math.min(N, si(st + dur + 0.05));
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const tr = (i - s0) / SAMPLE_RATE;
    const f  = freq * Math.pow(0.4, Math.min(tr, dur) / dur);
    phase += 2 * Math.PI * f / SAMPLE_RATE;
    const gain = tr < 0.02 ? (tr / 0.02) * vol : expRamp(vol, 0.001, 0.02, dur, tr);
    const v = Math.sin(phase) * gain;
    left[i] += v; right[i] += v;
  }
}

// ping: pure sine, exponential decay
function addPing(st, freq, vol, dur) {
  const s0 = si(st), s1 = Math.min(N, si(st + dur + 0.05));
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const tr = (i - s0) / SAMPLE_RATE;
    phase += 2 * Math.PI * freq / SAMPLE_RATE;
    const gain = expRamp(vol, 0.001, 0, dur, tr);
    const v = Math.sin(phase) * gain;
    left[i] += v; right[i] += v;
  }
}

// whoosh: sawtooth-like sweep (sine sweep ≈ pitch swoosh),
// bandpass Q=5 approximated by narrow sine sweep,
// gain: triangle envelope peaking at dur/2
function addWhoosh(st, f0, f1, dur) {
  const s0 = si(st), s1 = Math.min(N, si(st + dur + 0.05));
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const tr  = (i - s0) / SAMPLE_RATE;
    const f   = f0 * Math.pow(f1 / f0, tr / dur);
    phase += 2 * Math.PI * f / SAMPLE_RATE;
    const half = dur * 0.5;
    const gain = tr < half ? 0.16 * (tr / half) : 0.16 * (1 - (tr - half) / half);
    // mix fundamental + slight harmonic for richer whoosh
    const v = (Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.3) * gain;
    left[i] += v; right[i] += v;
  }
}

// crack: decaying noise, lowpass@280Hz approximated by simple smoothing
function addCrack(st, dur, vol) {
  const s0 = si(st), s1 = Math.min(N, si(st + dur));
  let prev = 0;
  const smooth = 0.18; // low-pass coefficient (higher = more bass)
  for (let i = s0; i < s1; i++) {
    const tr = (i - s0) / SAMPLE_RATE;
    const raw = (Math.random() * 2 - 1) * Math.exp(-tr / (dur * 0.2));
    prev = prev + smooth * (raw - prev); // simple IIR low-pass
    const gain = expRamp(vol, 0.001, 0, dur, tr);
    const v = prev * gain;
    left[i] += v; right[i] += v;
  }
}

// ── Schedule all sounds (matching HTML exactly) ──────────────

// Opening hit at t=0.04
addCrack(0.04, 0.3, 2.0);
addBoom(75,  1.2, 0.04, 0.6);
addPing(0.06, 880, 0.2, 0.6);

// Per-word: [landTime, whooshF0, whooshF1, boomFreq, boomVol, pingFreq]
const WS = [
  [0.50, 180, 1400, 70,  1.1, 1320],
  [1.15, 200, 1600, 60,  1.3, 1760],
  [1.90, 150, 1000, 90,  0.6,  880],
  [2.55, 160, 1100, 85,  0.55, 1046],
  [3.20, 170, 1200, 80,  0.6,  1174]
];
WS.forEach(([wt, f0, f1, bf, bv, pf]) => {
  addWhoosh(wt - 0.28, f0, f1, 0.3);
  addCrack(wt, 0.22, wt < 1.5 ? 1.5 : 0.9);
  addBoom(bf, bv, wt, 0.4);
  addPing(wt + 0.02, pf, wt < 1.5 ? 0.22 : 0.14, 0.9);
});

// Master gain: 1.0 → 0 linear from t=4.4 to t=5.1
for (let i = 0; i < N; i++) {
  const t  = i / SAMPLE_RATE;
  const mg = t < 4.4 ? 1.0 : t >= 5.1 ? 0 : 1.0 * (1 - (t - 4.4) / 0.7);
  left[i]  = Math.max(-1, Math.min(1, left[i]  * mg));
  right[i] = Math.max(-1, Math.min(1, right[i] * mg));
}

// Write 16-bit stereo WAV
const dataLen = N * 4;
const buf = Buffer.allocUnsafe(44 + dataLen);
buf.write('RIFF', 0);       buf.writeInt32LE(36 + dataLen, 4);
buf.write('WAVEfmt ', 8);   buf.writeInt32LE(16, 16);
buf.writeInt16LE(1, 20);    buf.writeInt16LE(2, 22);
buf.writeInt32LE(SAMPLE_RATE, 24); buf.writeInt32LE(SAMPLE_RATE * 4, 28);
buf.writeInt16LE(4, 32);    buf.writeInt16LE(16, 34);
buf.write('data', 36);      buf.writeInt32LE(dataLen, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(left[i]  * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(right[i] * 32767), 44 + i * 4 + 2);
}
fs.writeFileSync('/tmp/intro-audio.wav', buf);
console.log('Intro audio written: /tmp/intro-audio.wav');
