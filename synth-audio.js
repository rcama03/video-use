// Synthesises the subscribe card Web Audio API sounds as a stereo WAV file.
// Mirrors the exact timing/parameters from the HTML source.
const fs = require('fs');

const SAMPLE_RATE = 44100;
const DURATION    = 8.5;
const N           = Math.ceil(SAMPLE_RATE * DURATION);
const left  = new Float32Array(N);
const right = new Float32Array(N);

function si(t) { return Math.floor(t * SAMPLE_RATE); }

function addClick(st, freq, vol) {
  const s0 = si(st), s1 = Math.min(N, si(st + 0.16));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SAMPLE_RATE;
    const v = Math.sin(2 * Math.PI * freq * t) * vol * Math.exp(-t / 0.018);
    left[i] += v; right[i] += v;
  }
}

function addCrack(st, vol) {
  const s0 = si(st), s1 = Math.min(N, si(st + 0.09));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SAMPLE_RATE;
    const v = (Math.random() * 2 - 1) * vol * Math.exp(-t / 0.03);
    left[i] += v; right[i] += v;
  }
}

function addChime(st, freqs, vol) {
  freqs.forEach((f, idx) => {
    const offset = idx * 0.06;
    const s0 = si(st + offset), s1 = Math.min(N, si(st + offset + 1.2));
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SAMPLE_RATE;
      const env = t < 0.02 ? (t / 0.02) : Math.pow(2, -10 * (t - 0.02) / 1.1);
      const v = Math.sin(2 * Math.PI * f * t) * vol * env;
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

// Master gain 0.9, fade out 7.4→8.2s
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;
  let g = 0.9;
  if (t >= 7.4) g = t >= 8.2 ? 0 : 0.9 * (1 - (t - 7.4) / 0.8);
  left[i]  = Math.max(-1, Math.min(1, left[i]  * g));
  right[i] = Math.max(-1, Math.min(1, right[i] * g));
}

// Write 16-bit stereo WAV
function writeWav(path, L, R, sr) {
  const dataLen = L.length * 4; // 2ch × 2 bytes
  const buf = Buffer.allocUnsafe(44 + dataLen);
  const write = (o, v, n) => { if(n===4) buf.writeInt32LE(v,o); else if(n===2) buf.writeInt16LE(v,o); };
  buf.write('RIFF', 0); write(4, 36 + dataLen, 4);
  buf.write('WAVEfmt ', 8); write(16, 16, 4); write(20, 1, 2); write(22, 2, 2);
  write(24, sr, 4); write(28, sr * 4, 4); write(32, 4, 2); write(34, 16, 2);
  buf.write('data', 36); write(40, dataLen, 4);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(L[i] * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(R[i] * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(path, buf);
}

writeWav('/tmp/subscribe-audio.wav', left, right, SAMPLE_RATE);
console.log('Audio written to /tmp/subscribe-audio.wav');
