# Skill: livekit-room

**Load this skill when touching token minting, room connection, mic publishing, data channels, or participant metadata.**

---

## Token minting — `/app/api/token/route.ts`

Server-side only. Uses `livekit-server-sdk`. Reads env vars:
- `LIVEKIT_URL` — wss://… LiveKit server URL
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

```ts
import { AccessToken } from "livekit-server-sdk";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const identity = searchParams.get("identity");

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: identity! }
  );
  at.addGrant({ roomJoin: true, room: room!, canPublish: true, canSubscribe: true });

  return Response.json({ token: await at.toJwt() });
}
```

## Client connection — `/lib/livekit.ts`

```ts
import { Room, RoomEvent, DataPacket_Kind } from "livekit-client";

export async function connectToRoom(roomName: string, identity: string): Promise<Room> {
  const res = await fetch(`/api/token?room=${roomName}&identity=${identity}`);
  const { token } = await res.json();

  const room = new Room();
  await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL!, token);
  return room;
}
```

`NEXT_PUBLIC_LIVEKIT_URL` is the same `wss://…` URL exposed to the browser.

## Publishing the mic

```ts
await room.localParticipant.setMicrophoneEnabled(true);
```

Toggle mute: `room.localParticipant.setMicrophoneEnabled(false/true)`.

## Subscribing to remote audio tracks

Listen for `RoomEvent.TrackSubscribed` — the SDK subscribes to all tracks automatically when `autoSubscribe` is true (the default).

```ts
room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  if (track.kind === "audio") {
    // attach to Web Audio graph — see proximity-audio skill
  }
});
```

## Data channels

```ts
// Send (lossy for pos, reliable for chat):
const encoder = new TextEncoder();
room.localParticipant.publishData(encoder.encode(JSON.stringify(msg)), {
  reliable: false,   // true for chat
  topic: "pos",      // "chat" for chat
});

// Receive:
room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
  const msg = JSON.parse(new TextDecoder().decode(payload));
  // dispatch by msg.t
});
```

## Participant metadata

```ts
// Set local:
await room.localParticipant.setMetadata(JSON.stringify(avatarMeta));

// Read remote:
room.on(RoomEvent.ParticipantMetadataChanged, (metadata, participant) => {
  const meta = JSON.parse(participant.metadata ?? "{}");
});
```

## Identity persistence

Generate a `crypto.randomUUID()` on first load; store in `localStorage` under key `"reconnect-identity"`. Pass this as `identity` to `/api/token`.
