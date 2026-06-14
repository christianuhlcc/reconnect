---
name: proximity-audio
description: Use when wiring remote LiveKit audio tracks into the Web Audio API for proximity/spatial sound — building the per-peer audio graph, updating volume by distance, adding stereo panning, or debugging "no sound" issues. Owns the project's Web Audio conventions and the known WebRTC+Web Audio gotchas.
---

# Proximity audio

Goal: each remote peer's voice gets quieter with distance and goes silent past a cutoff
radius. Distance comes from avatar positions (Phaser world px); the gain curve and constants
live in the **realtime-contract** skill (`gainForDistance`, `FULL_RADIUS`, `CUTOFF_RADIUS`).
Implementation lives in `/lib/audio.ts`.

## One shared AudioContext

- Create exactly one `AudioContext` for the app.
- Browsers start it `suspended` (autoplay policy). Call `ctx.resume()` inside the first user
  gesture (the same click that enters the room / grants mic). Until resumed, there is no sound.

## Per-peer graph

For each remote audio track (from `RoomEvent.TrackSubscribed`):

```
MediaStreamSource(track) → GainNode → [StereoPannerNode] → ctx.destination
```

```ts
const stream = new MediaStream([track.mediaStreamTrack]);
const src = ctx.createMediaStreamSource(stream);
const gain = ctx.createGain();
const panner = ctx.createStereoPanner(); // Phase D4 (optional); pass-through (pan=0) until then
src.connect(gain).connect(panner).connect(ctx.destination);
// store { src, gain, panner, sink } keyed by participant identity
```

Tear the node down on `TrackUnsubscribed` / `ParticipantDisconnected` (disconnect + drop the ref).

## ⚠️ The muted-sink gotcha (do this or you get silence)

In Chromium, a WebRTC `MediaStreamTrack` routed **only** through Web Audio produces **no sound**.
Workaround: also attach the stream to a muted `HTMLAudioElement` and keep the reference alive.
It plays nothing audible itself but unblocks the Web Audio path.

```ts
const sink = new Audio();
sink.srcObject = stream;
sink.muted = true;          // critical: actual audio comes from the Web Audio graph
sink.play().catch(() => {}); // may need to retry after a user gesture
```

If you hear nothing, check this first, then check that `ctx.state === "running"`.

## Updating volume

- On every `pos` update for a peer (and on local movement, for all peers), recompute
  distance between local and that peer and set gain:

```ts
const target = gainForDistance(dist);          // from realtime-contract
node.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.05); // smooth ~50ms, avoids zipper noise
```

- Do NOT set `gain.value` directly each frame — the ramp prevents clicks.
- Gain is driven by position events, not a polling timer.

## Stereo panning (Phase D4, optional polish)

- `pan = clamp((peer.x - local.x) / CUTOFF_RADIUS, -1, 1)`; apply via
  `panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.05)`.
- Proximity gain is the MVP; panning is additive. Ship gain first.

## Speaking indicator

- Drive from `RoomEvent.ActiveSpeakersChanged` → call the scene's `setSpeaking(identity, bool)`.
  This is independent of the audio graph (uses LiveKit's own detection), so it works even
  while a peer is far/silent.

## Gotchas recap

1. Resume the `AudioContext` on a user gesture or everything is silent.
2. The muted `HTMLAudioElement` sink is mandatory for WebRTC streams in Chromium.
3. Ramp gain/pan with `setTargetAtTime`, never hard-set per frame.
4. One graph node per identity; clean up on unsubscribe/disconnect.
