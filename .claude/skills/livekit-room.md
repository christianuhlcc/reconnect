---
name: livekit-room
description: Use when minting LiveKit access tokens, connecting to a room, publishing the microphone, subscribing to remote tracks, sending/receiving data-channel messages, or reading/writing participant metadata. Covers the project's LiveKit conventions and known gotchas.
---

# LiveKit room conventions

Packages: `livekit-server-sdk` (token route, server only) and `livekit-client` (browser).
Wire format is owned by the **realtime-contract** skill — read it before touching data or metadata.

> SDK versions drift. The shapes below are the stable conventions; verify exact signatures
> against the installed version's types if something doesn't compile (notably `toJwt()` and
> `publishData` options, which have changed across majors).

## Token minting — `/app/api/token/route.ts` (server only)

```ts
import { AccessToken } from "livekit-server-sdk";

// inputs: room (string), identity (uuid from client), metadata (AvatarMeta JSON string)
const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
  identity,
  metadata,              // JSON.stringify(AvatarMeta) — sets avatar identity at join
  ttl: "2h",
});
at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
const token = await at.toJwt();   // NOTE: async in current SDK
return Response.json({ token, url: process.env.LIVEKIT_URL });
```

- Secrets (`LIVEKIT_API_KEY/SECRET`) NEVER reach the client. Only this route reads them.
- For MVP the room is open: anyone with the link gets a token for that room.

## Identity

- One stable `identity` per browser: generate a uuid once, persist in `localStorage` (`vo:identity`).
- This `identity` is the join key across the whole app: the Phaser avatar registry, audio
  graph, and chat all key off it. One participant ⇄ one identity ⇄ one avatar.

## Connect — `/lib/livekit.ts`

```ts
import { Room, RoomEvent, Track } from "livekit-client";

const room = new Room({ adaptiveStream: true, dynacast: true });
await room.connect(url, token);
await room.localParticipant.setMicrophoneEnabled(true); // always-on mic (Phase D)
```

## Events to wire (canonical set)

- `RoomEvent.ParticipantConnected` / `ParticipantDisconnected` → spawn/despawn avatar + audio node.
- `RoomEvent.TrackSubscribed` `(track, pub, participant)` → if `track.kind === Track.Kind.Audio`, hand to the proximity-audio graph (see that skill).
- `RoomEvent.TrackUnsubscribed` → tear down that peer's audio node.
- `RoomEvent.DataReceived` `(payload, participant, kind, topic)` → `decode(payload)` then route by `topic`.
- `RoomEvent.ActiveSpeakersChanged` `(speakers[])` → drive speaking indicators.
- `RoomEvent.ParticipantMetadataChanged` → re-read `AvatarMeta`, update that avatar's name/sprite/colour live.
- `RoomEvent.Disconnected` / `Reconnecting` / `Reconnected` → HUD state + clean rejoin.

## Sending data

```ts
const data = encode(msg); // from /lib/realtime.ts
await room.localParticipant.publishData(data, { reliable, topic });
// reliable=false for "pos", true for "chat".
// (Older SDKs use DataPacket_Kind instead of { reliable } — match the installed version.)
```

## Metadata

- Simplest: pass `metadata` at token mint (above). No runtime permission needed.
- Runtime updates (`room.localParticipant.setMetadata(JSON.stringify(meta))`) require the token
  grant `canUpdateOwnMetadata: true`. Only add that grant if Phase E needs live re-customise.

## Gotchas

- `room.connect` must run client-side only (`"use client"`); never in a Server Component.
- Mic publish needs a user gesture + HTTPS (Vercel is fine; localhost is treated as secure).
- Always `room.disconnect()` on page unload / route change to avoid ghost participants.
- Don't attach remote audio to a plain `<audio>` element if it also goes through Web Audio —
  see the proximity-audio skill for the required muted-sink pattern.
