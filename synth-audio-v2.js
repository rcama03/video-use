// Exact reimplementation of the subscribe card Web Audio API audio.
// Uses the same exponential ramp formula as the Web Audio API spec.
const fs = require('fs');

const SAMPLE_RATE = 44100;
const DURATION    = 8.5;
const N           = Math.ceil(SAMPLE_RATE * DURATION);
const left  = new Float32Array(N);
const right = new Float32Array(N);

function si(t) { return Math.floor(t * SAMPLE_RATE); }

// Web Audio API exponentialRampToValueAtTime formula
// v(t) = v0 * (v1/v0)^((t-t0)/(t1-t0))
function expRamp(v0, v1, t0, t1, t) {
  if (t <= t0) return v0;
  if (t >= t1) return v1;
  return v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
}

// click(st, freq, vol)
// Oscillator: sine at freq, runs st→st+0.16
// Gain: vol at st, exponentialRamp to 0.001 at st+0.14
function addClick(st, freq, vol) {
  const s0 = si(st), s1 = Math.min(N, si(st + 0.16));
  for (let i = s0; i < s1; i++) {
    const tr = (i - s0) / SAMPLE_RATE;
    const gain = expRamp(vol, 0.001, 0, 0.14, tr);
    const v = Math.sin(2 * Math.PI * freq * tr) * gain;
    left[i] += v; right[i] += v;
  }
}

// crack(st, vol)
// Buffer content: noise * exp(-i/(sr*0.03))
// Gain: vol at st, exponentialRamp to 0.001 at st+0.09
function addCrack(st, vol) {
  const s0 = si(st), s1 = Math.min(N, si(st + 0.09));
  for (let i = s0; i < s1; i++) {
    const tr = (i - s0) / SAMPLE_RATE;
    const bufSample = (Math.random() * 2 - 1) * Math.exp(-tr / 0.03);
    const gain = expRamp(vol, 0.001, 0, 0.09, tr);
    const v = bufSample * gain;
    left[i] += v; right[i] += v;
  }
}

// chime(st, freqs, vol)
// Each partial at freq[i], staggered by i*0.06s, runs 1.2s
// Gain: 0 → linearRamp(vol, +0.02s) → exponentialRamp(0.001, +1.1s)
function addChime(st, freqs, vol) {
  freqs.forEach((f, idx) => {
    const chStart = st + idx * 0.06;
    const s0 = si(chStart), s1 = Math.min(N, si(chStart + 1.2));
    for (let i = s0; i < s1; i++) {
      const tr = (i - s0) / SAMPLE_RATE;
      const gain = tr < 0.02
        ? (tr / 0.02) * vol                    // linear ramp 0→vol
        : expRamp(vol, 0.001, 0.02, 1.1, tr);  // exp ramp vol→0.001
      const v = Math.sin(2 * Math.PI * f * tr) * gain;
      left[i] += v; right[i] += v;
    }
  });
}

// SUBSCRIBE click — t = 2.0s
addCrack(2.0, 1.0);
addClick(2.0, 180, 0.45);
addChime(2.06, [523, 659, 784, 1047], 0.13);

// LIKE click — t = 3.3s
addCrack(3.3, 0.55);
addClick(3.3, 300, 0.28);
addChime(3.35, [880, 1108], 0.09);

// BELL click — t = 4.5s
addCrack(4.5, 0.45);
addChime(4.5, [880, 1108, 1318, 1760], 0.11);

// Master gain: 0.9 constant, linear fade 0.9→0 from 7.4s to 8.2s
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  let mg = 0.9;
  if (t >= 7.4) mg = t >= 8.2 ? 0 : 0.9 * (1 - (t - 7.4) / 0.8);
  left[i]  = Math.max(-1, Math.min(1, left[i]  * mg));
  right[i] = Math.max(-1, Math.min(1, right[i] * mg));
}

// Write 16-bit stereo PCM WAV
const dataLen = N * 4;
const buf = Buffer.allocUnsafe(44 + dataLen);
buf.write('RIFF', 0);       buf.writeInt32LE(36 + dataLen, 4);
buf.write('WAVEfmt ', 8);   buf.writeInt32LE(16, 16);
buf.writeInt16LE(1, 20);    buf.writeInt16LE(2, 22);         // PCM, stereo
buf.writeInt32LE(SAMPLE_RATE, 24);
buf.writeInt32LE(SAMPLE_RATE * 4, 28);
buf.writeInt16LE(4, 32);    buf.writeInt16LE(16, 34);        // blockAlign, bitsPerSample
buf.write('data', 36);      buf.writeInt32LE(dataLen, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(left[i]  * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(right[i] * 32767), 44 + i * 4 + 2);
}
fs.writeFileSync('/tmp/subscribe-audio-v2.wav', buf);
console.log('Audio written: /tmp/subscribe-audio-v2.wav');
