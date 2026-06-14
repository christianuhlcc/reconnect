# Skill: realtime-contract

**Load this skill whenever you touch anything that goes over the wire — data channels, participant metadata, or the audio attenuation formula.**

---

## Wire messages (JSON over LiveKit data channels)

```ts
// Sent ~10 Hz over LOSSY data channel; topic "pos"
type PosMsg = {
  t: "pos";
  x: number;        // world pixels
  y: number;
  dir: "up" | "down" | "left" | "right";
  moving: boolean;
};

// Sent over RELIABLE data channel; topic "chat"
type ChatMsg = {
  t: "chat";
  id: string;       // message uuid
  name: string;     // display name at send time
  body: string;     // <= 500 chars
  ts: number;       // epoch ms
};
```

## Participant metadata (set at connect and on re-customise)

```ts
type AvatarMeta = {
  name: string;
  sprite: string;   // spritesheet key, e.g. "char_a"
  color: string;    // hex tint, e.g. "#ff8800"
};
```

Metadata is set via `room.localParticipant.setMetadata(JSON.stringify(meta))`.

## Audio attenuation formula

```ts
const FULL_RADIUS  = 120;  // px: within this, gain = 1.0
const CUTOFF_RADIUS = 360; // px: beyond this, gain = 0

function computeGain(dist: number): number {
  return Math.max(0, Math.min(1, (CUTOFF_RADIUS - dist) / (CUTOFF_RADIUS - FULL_RADIUS)));
}
```

Do **not** hardcode these constants outside `/lib/audio.ts`. The tunables live there only.

## Encode/decode helpers (live in `/lib/realtime.ts`)

All messages must go through the encode/decode helpers in `/lib/realtime.ts` so there is a single source of truth for the wire format. Never call `JSON.stringify`/`JSON.parse` on messages inline in components or scenes — always import from `realtime.ts`.
