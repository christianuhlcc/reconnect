# reconnect — work log

Virtual proximity-audio office. One room per team via magic link.
See `virtual-office-implementation-plan.md` for full spec.

---

## Done

### Phase 0 — Scaffold ✅
- Next.js 15 (App Router, TypeScript, Tailwind v4)
- Packages: `phaser`, `livekit-client`, `@livekit/components-react`, `livekit-server-sdk`
- `.env.local` filled with LiveKit Cloud credentials (project: reconnect-sxwx2np5)
- Four skills authored: `realtime-contract`, `livekit-room`, `phaser-scene`, `proximity-audio`

### Phase 1 — Single-player movement ✅
- `OfficeScene.ts`: tileset + player spritesheet generated at runtime via `createCanvas` (no PNG files)
- 25×20 tile map (gid=1 convention: 1=floor, 2=wall)
- WASD + arrows, 4-direction walk animation, diagonal normalised to constant speed
- Arcade physics collision against wall tiles
- Camera follows player with 0.12 lerp
- Spawn at (384, 224) — verified collision on all wall edges

### Phase 2 — Multiplayer presence ✅
- `/app/api/token/route.ts`: mints LiveKit JWT (grants: roomJoin, canPublish, canSubscribe, canUpdateOwnMetadata)
- `lib/livekit.ts`: `connectToRoom()` + `getOrCreateIdentity()` (uses **sessionStorage** so two tabs in the same browser get distinct identities)
- `game/avatar.ts`: `RemoteAvatar` — Phaser sprite + nameplate label, lerps to target pos at 0.22/frame
- `OfficeScene` connects to LiveKit after scene create; broadcasts `PosMsg` ~10 Hz while moving, one final packet on stop
- Remote avatars spawned lazily on first PosMsg, destroyed on participant disconnect
- `ConnectionState.Connected` guard prevents DataChannel errors on early frames

#### Bugs fixed along the way
| Error | Root cause | Fix |
|---|---|---|
| "Cannot add Scene with duplicate key" | React StrictMode double-invokes effect; both passed the `gameRef` guard before the async import resolved | `mounted` flag checked after the `await` |
| `SignalRequestError: metadata timed out` | `setMetadata()` called before `room.connect()` | moved `setMetadata` to after `connect()` |
| "does not have permission to update own metadata" | Token missing grant | added `canUpdateOwnMetadata: true` to token |
| "Unknown DataChannel error on lossy" | `publishData` called before RTCDataChannel was open | `ConnectionState.Connected` guard in `broadcastPos` |
| Two tabs share identity → never see each other | `localStorage` is shared across tabs | switched to `sessionStorage` |

---

### Phase 3 — Always-on audio (flat volume) ✅

- `lib/audio.ts`: lazy `AudioContext`, `addPeer()` / `removePeer()` / `updateGain()` (Phase 4 hook)
- LiveKit connection moved to `GameCanvas.tsx` — room passed to `OfficeScene` via scene init data
- `TrackSubscribed` / `TrackUnsubscribed` wired in `GameCanvas` to add/remove peers in audio graph
- Existing participants' audio tracks handled on join (iterates `remoteParticipants`)
- AudioContext unlocked on first click or keydown (browser autoplay policy)
- `components/Hud.tsx`: mute / unmute button overlaid on canvas
- **DoD:** two tabs with headphones can hear each other; mute button works

---

### Phase 4 — Proximity audio ✅
- `updateGain(identity, dist)` called on every `PosMsg` in `OfficeScene.handleRemotePosMsg`
- Distance computed from local player position to remote msg position
- Speaking indicator ring (`Phaser.GameObjects.Arc`, depth 0.9, green stroke) on `RemoteAvatar`
- `ActiveSpeakersChanged` event handler in `setupLiveKitListeners` toggles ring visibility
- Ring tracks avatar lerp position each tick
- **DoD:** walking toward a speaker gets louder; walking away goes silent

### Phase 5 — Onboarding & magic link ✅
- Landing page: room name input → `/r/<slug>` (empty → random UUID prefix)
- `components/Onboarding.tsx`: display name + 6 colour swatches → saved to `localStorage` as `AvatarMeta`
- `RoomLoader`: checks `localStorage` on mount; shows Onboarding gate if no saved meta, then GameCanvas
- `GameCanvas`: takes `meta: AvatarMeta` prop; passes it straight to `connectToRoom`
- `RemoteAvatar`: constructor accepts `color`, applies `setTint()`; `applyMeta()` for live updates
- `OfficeScene`: passes color when spawning RemoteAvatar; handles `ParticipantMetadataChanged`
- **DoD:** brand-new browser → join link → walking in under 15 s

## Up next

### Phase 6 — Central chat ✅
- `components/ChatPanel.tsx`: collapsible panel (bottom-right), message list with autoscroll, 500-char cap, unread badge when closed
- `GameCanvas`: static imports for `encodeMsg`/`decodeMsg`; `DataReceived` handler appends chat msgs to state; `sendChat` optimistically appends locally then publishes reliably (topic "chat"); `openChat`/`closeChat` manage `chatOpenRef` so unread count is accurate
- `OfficeScene.update()`: early return when `document.activeElement` is an input/textarea — stops player, sends a stop broadcast, still ticks remote avatars
- **DoD:** message sent in one tab appears in all others near-instantly

### Phase 7 — Polish pass ✅
- **Participant list**: top-left HUD panel shows all room members (name + blue dot for self); updates live on join/leave/rename via `ParticipantConnected`, `ParticipantDisconnected`, `ParticipantMetadataChanged`
- **Reconnect handling**: `Reconnecting` → yellow banner; `Reconnected` → banner clears + audio re-syncs + participant list refreshes; `Disconnected` (non-intentional) → full-screen overlay with reload button
- **Improved tile graphics**: floor = 4-plank wood with grain streaks and gap lines; wall = dark brick panel with top/left highlights, mortar rows, and shadow edges
- Nameplates + speaking ring: already done in Phase 4/5
- Perf check: deferred to real team session

### Office redesign — bigger & cuter ✅
- **Map +50% area**: grid 25×20 → **30×25** (800×640 → 960×800px); `MAP_COLS/ROWS` + spawn (464, 400, central walkway crossroads) updated in `OfficeScene.ts`
- **Zoned layout** (WorkAdventure-style, linked by flagstone walkways): work pods + coffee/kitchen nook up top; meeting room (whiteboard + round tables on rug) + plant garden bottom-left; lounge (couches on rug) + Monkey-Island "captain's corner" (treasure chest, ship-in-a-bottle, parrot perch, tiki palm, hanging sign) bottom-right; sky windows along the top wall
- **Tileset refactor**: `buildTilesetTexture()` now an ordered array of pure draw-fns (`drawFloor`…`drawSign`) at module scope; canvas width self-sizes from the count; GID = index+1. Tiles grew 8 → **19**
- **Cuter palette**: warm honey plank floor, sage-teal plaster walls (was navy), rounded pastel-coral couch; helpers `rr`/`circle`/`ellipse`/`tri` for rounded shapes
- **Walkability**: new `WALKABLE_GIDS = [1, 9, 10]` (floor, rug, walkway); `setCollisionByExclusion([-1, ...WALKABLE_GIDS])`. All other GIDs solid
- **Single-layer gotcha**: every prop tile paints its own full background (planks for floor props, rug for couch/table) — there is no ground layer beneath, so transparent tiles would show black
- Verified: `next build` clean; map flood-fill reachable (537/537 walkable tiles, no sealed pockets); all 19 tiles + full map rendered via headless Chrome

### Phase 8 — Production hardening
- Self-host LiveKit on AWS Frankfurt (eu-central-1) for GDPR + flat cost
- Separate dev (Cloud) / prod (self-hosted) env config
- Rate-limit token route; optional room secret in link
- Short privacy note (audio real-time, not recorded)

---

## Deferred / open decisions
- Stereo panning (Phase 4b): gain-only first, add panner in polish
- Chat history for late joiners: live-only MVP, add Upstash Redis later
- Mobile/touch movement: defer to Phase 7
- Map editor: post-MVP
