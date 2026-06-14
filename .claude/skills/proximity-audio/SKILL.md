# Skill: proximity-audio

**Load this skill when touching the Web Audio graph, gain/pan logic, or the attenuation constants.**

---

## Graph topology (per remote peer)

```
RemoteAudioTrack (MediaStreamTrack)
  └─ MediaStreamAudioSourceNode
       └─ GainNode          ← distance-driven gain
            └─ [StereoPannerNode]  ← optional Phase 4b
                 └─ AudioContext.destination
```

One graph per remote participant, created in `/lib/audio.ts`.

## Attenuation constants (single source of truth — only in `/lib/audio.ts`)

```ts
export const FULL_RADIUS   = 120;  // px: gain = 1.0 within this
export const CUTOFF_RADIUS = 360;  // px: gain = 0 beyond this

export function computeGain(dist: number): number {
  return Math.max(0, Math.min(1, (CUTOFF_RADIUS - dist) / (CUTOFF_RADIUS - FULL_RADIUS)));
}
```

Tune `FULL_RADIUS` / `CUTOFF_RADIUS` once the tilemap tile size is known (Phase 4 calibration).

## Peer audio manager — `/lib/audio.ts`

```ts
interface PeerAudio {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  panner?: StereoPannerNode;
}

const ctx = new AudioContext();
const peers = new Map<string, PeerAudio>();

export function addPeer(identity: string, track: MediaStreamTrack) {
  const stream = new MediaStream([track]);
  const source = ctx.createMediaStreamSource(stream);
  const gain   = ctx.createGain();
  source.connect(gain);
  gain.connect(ctx.destination);
  peers.set(identity, { source, gain });
}

export function removePeer(identity: string) {
  const peer = peers.get(identity);
  if (!peer) return;
  peer.gain.disconnect();
  peer.source.disconnect();
  peers.delete(identity);
}

export function updateGain(identity: string, dist: number) {
  const peer = peers.get(identity);
  if (!peer) return;
  peer.gain.gain.setTargetAtTime(computeGain(dist), ctx.currentTime, 0.05);
}
```

## Update rule

**Gain must be updated on every `PosMsg` received — never on a timer.** When a participant's position changes, call `updateGain(identity, dist)` immediately after updating the Phaser sprite position.

## AudioContext resume

Browsers block the AudioContext until a user gesture. Call `ctx.resume()` inside the first user interaction (e.g. the "Enter room" button click in Onboarding).

## Stereo panning (Phase 4b, optional)

If adding `StereoPannerNode`, insert it between `GainNode` and `destination`. Pan value = `clamp(dx / CUTOFF_RADIUS, -1, 1)` where `dx = remoteX - localX`.
