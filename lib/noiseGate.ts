// AudioWorklet noise gate — silences the mic when RMS is below threshold.
// Loaded inline via Blob URL so no static file needs to be served.
const GATE_WORKLET = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // All timing converted to block counts (128 samples per block)
    this._threshold = 0.015;                              // RMS threshold
    this._gate = 0;                                       // 0 = closed, 1 = open
    this._holdBlocks = Math.round(0.30 * sampleRate / 128); // 300 ms hold
    this._holdCount = 0;
    this._attackStep = 1 / Math.max(1, Math.round(0.005 * sampleRate / 128));  // ~5 ms attack
    this._releaseStep = 1 / Math.max(1, Math.round(0.15 * sampleRate / 128)); // ~150 ms release
  }
  process(inputs, outputs) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp?.length) return true;
    // RMS across all channels
    let sum = 0, count = 0;
    for (let c = 0; c < inp.length; c++) {
      for (let n = 0; n < inp[c].length; n++) { sum += inp[c][n] ** 2; count++; }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    if (rms > this._threshold) {
      this._holdCount = this._holdBlocks;
      this._gate = Math.min(1, this._gate + this._attackStep);
    } else if (this._holdCount > 0) {
      this._holdCount--;
    } else {
      this._gate = Math.max(0, this._gate - this._releaseStep);
    }
    for (let c = 0; c < inp.length; c++) {
      for (let n = 0; n < inp[c].length; n++) out[c][n] = inp[c][n] * this._gate;
    }
    return true;
  }
}
registerProcessor('noise-gate', NoiseGateProcessor);
`;

export interface GatedMic {
  stream: MediaStream;
  stop: () => void;
}

export async function createGatedMicStream(): Promise<GatedMic> {
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });

  const ctx = new AudioContext();
  const blob = new Blob([GATE_WORKLET], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = ctx.createMediaStreamSource(rawStream);
  const gate = new AudioWorkletNode(ctx, 'noise-gate');
  const dest = ctx.createMediaStreamDestination();
  source.connect(gate);
  gate.connect(dest);

  return {
    stream: dest.stream,
    stop: () => {
      source.disconnect();
      gate.disconnect();
      rawStream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
