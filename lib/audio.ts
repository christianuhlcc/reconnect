// Single source of truth for attenuation constants (proximity-audio skill)
export const FULL_RADIUS = 120;   // px: gain = 1.0 within this
export const CUTOFF_RADIUS = 360; // px: gain = 0 beyond this

export function computeGain(dist: number): number {
  return Math.max(0, Math.min(1, (CUTOFF_RADIUS - dist) / (CUTOFF_RADIUS - FULL_RADIUS)));
}

// Lazy AudioContext — must not be created before a user gesture
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

export function resumeContext() {
  getCtx().resume().catch(() => {});
}

interface PeerAudio {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

const peers = new Map<string, PeerAudio>();

export function addPeer(identity: string, track: MediaStreamTrack) {
  if (peers.has(identity)) return;
  const c = getCtx();
  const source = c.createMediaStreamSource(new MediaStream([track]));
  const gain = c.createGain();
  gain.gain.value = 1.0; // Phase 3: flat volume; Phase 4 will call updateGain()
  source.connect(gain);
  gain.connect(c.destination);
  peers.set(identity, { source, gain });
}

export function removePeer(identity: string) {
  const peer = peers.get(identity);
  if (!peer) return;
  peer.source.disconnect();
  peer.gain.disconnect();
  peers.delete(identity);
}

// Phase 4: called on every PosMsg to apply proximity attenuation
export function updateGain(identity: string, dist: number) {
  const peer = peers.get(identity);
  if (!peer) return;
  peer.gain.gain.setTargetAtTime(computeGain(dist), getCtx().currentTime, 0.05);
}
