// Mic noise suppression for the local participant.
//
// An RMS gate (the previous approach) can't remove keyboard noise: clicks are
// loud broadband transients that punch through any amplitude threshold, and
// when you type *while* talking the gate is wide open. Real keyboard
// suppression needs a spectral/ML model that separates voice from noise.
//
// Everything here is expressed in terms of LiveKit's `TrackProcessor` interface
// so the backend is swappable. Attach the result via:
//   room.localParticipant.setMicrophoneEnabled(true, { processor })

import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

/** A noise-suppression processor for the local mic track. */
export type AudioNoiseFilter = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

export interface NoiseFilterHandle {
  /** Pass to `setMicrophoneEnabled(true, { processor })`; null when unavailable. */
  processor: AudioNoiseFilter | null;
  /** Which backend produced it — used for logging / fallback decisions. */
  backend: 'krisp' | 'unsupported';
}

// ── Swap point ────────────────────────────────────────────────────────────────
// Current backend: LiveKit Krisp (ML noise cancellation, a LiveKit Cloud feature).
// If Krisp turns out to be gated behind a paid plan, replace the body below with
// an OSS processor (e.g. RNNoise wrapped as a TrackProcessor<Track.Kind.Audio>).
// Callers depend only on the `AudioNoiseFilter` interface above, so nothing else
// in the app needs to change.
//
// Whether Krisp actually *engaged* (vs. being silently disabled by the server on
// an unsupported plan) is reported at runtime via `track.enhancedNoiseCancellation`
// — see GameCanvas, which warns and points back here if it never turns on.
async function loadBackend(): Promise<NoiseFilterHandle> {
  const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import(
    '@livekit/krisp-noise-filter'
  );
  if (!isKrispNoiseFilterSupported()) return { processor: null, backend: 'unsupported' };
  // "low" model on low-end devices would cut CPU; "medium" (default) is a good
  // balance for desktop where the typing complaint originates.
  return { processor: KrispNoiseFilter(), backend: 'krisp' };
}

export function createNoiseFilter(): Promise<NoiseFilterHandle> {
  return loadBackend();
}
