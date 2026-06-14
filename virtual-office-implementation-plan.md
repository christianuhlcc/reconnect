# Virtual Office — Implementation Plan

A proximity-audio "virtual room" for remote teams. Cute pixel-art office, avatars walk
around, audio is always on and fades with distance, plus a shared text chat. Join by
magic link, customise an avatar in a couple of clicks, start immediately.

> **How to use this doc with Claude Code**
> Work top-to-bottom. Do **Phase 0** (scaffold) and **author the four skills** *before*
> any feature work — the skills pin conventions so later phases don't drift. Each phase
> below has a **Goal**, **Tasks**, **Definition of Done (DoD)**, and **Verify** step.
> Treat one phase = one focused Claude Code session. Don't start a phase until the
> previous phase's DoD is green. Tell Claude Code: *"Read `.claude/skills/` first, then
> implement Phase N from `virtual-office-implementation-plan.md`. Stop at the DoD and
> show me how to verify."*

---

## 1. Product brief

- **Unit of deployment:** one room per team. The room is the magic link.
- **Audience:** small teams (~5–10 people per room). Optimise for this, not for 100-person halls.
- **Primary loop:** open link → pick avatar → walk over to colleagues → talk → wander off → silence.
- **Non-goals for MVP:** video, screen-share, meeting rooms, map editor, persistence, moderation, SSO, integrations.

### In scope (MVP)
- Magic-link join, no account.
- 2–3 step avatar customisation (sprite + colour + display name), persisted in `localStorage`.
- 2D pixel-art office: keyboard movement, collision with walls/furniture.
- Always-on microphone with **proximity gain** — volume falls with distance, hard cutoff past a radius.
- Live presence: remote avatars rendered in real time; speaking indicator; mute toggle.
- Central text chat visible to everyone in the room.

### Out of scope (defer; note where each slots back in)
| Deferred feature | Earliest sensible phase to add |
|---|---|
| Stereo L/R panning (true spatial) | Phase 4b (quick add once gain works) |
| Chat history / late-joiner backfill | Post-MVP (add Upstash Redis) |
| Status (away/busy/DND), emotes, follow | Post-MVP polish |
| Private/meeting zones, "huddle" rooms | Post-MVP |
| Video, screen-share | Post-MVP |
| Map editor / custom layouts | Post-MVP |
| Admin, moderation, SSO, integrations | Production / enterprise |

---

## 2. Architecture & stack

**Key insight:** LiveKit carries arbitrary data over its room data channels, so for the MVP
**there is no separate game server**. Avatar position and chat ride the same realtime
connection as audio. LiveKit also ships an official open-source 2D spatial-audio example to
crib from: https://github.com/livekit-examples/spatial-audio

| Concern | Choice | Rationale |
|---|---|---|
| App + hosting | **Next.js (App Router, TypeScript) on Vercel** | One repo; serverless route mints LiveKit tokens; no servers to run for MVP. |
| Realtime audio | **LiveKit** (Cloud free tier to start) | Managed SFU; avoids WebRTC-mesh scaling pain; open-source so you can self-host later. |
| Proximity audio | **Web Audio API** (`GainNode` + optional `StereoPannerNode`) per remote peer | Attenuate gain by distance client-side; follows the LiveKit spatial-audio pattern. |
| Position + chat sync | **LiveKit data channels** + **participant metadata** | No game server needed at MVP scale. |
| Rendering | **Phaser 3** | First-class tilemaps, sprites, collision; huge training-data corpus = productive vibecoding. (WorkAdventure, the closest OSS reference, also uses Phaser.) |
| Identity / onboarding | Magic-link URL + `localStorage` avatar prefs → LiveKit participant metadata | Zero-account, low barrier. |
| Production realtime (later) | **Self-hosted LiveKit on AWS Frankfurt (eu-central-1)** | GDPR data residency without LiveKit Cloud's $500/mo Scale tier; uses your AWS account. |

### Data flow
```
Browser (Next.js + Phaser)
  ├─ GET /api/token?room=<team>&identity=<uuid>   → mints LiveKit JWT (serverless)
  ├─ connect to LiveKit room with JWT
  ├─ publish mic track (always on)
  ├─ subscribe to all remote audio tracks → Web Audio graph (gain by distance)
  ├─ on local move: throttled position broadcast over data channel (~10 Hz)
  ├─ on remote position msg: update that avatar's Phaser sprite + its GainNode
  └─ chat: send/receive text messages over a reliable data channel topic
```

### Repo shape (target)
```
/app
  /api/token/route.ts        # mint LiveKit token (server)
  /r/[room]/page.tsx         # the room: onboarding gate → game canvas
  /page.tsx                  # landing / create-a-room
/lib
  /livekit.ts                # connect, publish, data-channel helpers
  /realtime.ts               # encode/decode the wire messages (see §3)
  /audio.ts                  # Web Audio graph: per-peer gain/pan
/game
  /scenes/OfficeScene.ts     # Phaser scene: tilemap, avatars, input
  /avatar.ts                 # sprite + nameplate + speaking ring
/components
  /Onboarding.tsx            # name + sprite + colour picker
  /ChatPanel.tsx             # central chat UI
  /Hud.tsx                   # mute, participant list
/.claude/skills/             # the four project skills (see §4)
/public/assets/              # tilemap, tileset, character spritesheets
```

---

## 3. Realtime contract (pin this FIRST)

Every phase depends on this. Define it once, encode/decode in `/lib/realtime.ts`, and have
the `realtime-contract` skill (see §4) reference it. All messages are JSON, sent over
LiveKit data channels. Use a `t` (type) discriminator.

```ts
// Sent ~10 Hz over LOSSY data channel while moving; topic "pos"
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

// Avatar identity travels as LiveKit participant METADATA (not a data msg),
// set at connect and on customise:
type AvatarMeta = {
  name: string;
  sprite: string;   // spritesheet key, e.g. "char_a"
  color: string;    // hex tint
};
```

**Audio attenuation model** (single source of truth for `proximity-audio` skill):
```
FULL_RADIUS  = 120   // px: within this, gain = 1.0
CUTOFF_RADIUS = 360  // px: beyond this, gain = 0 (silence)
// linear (MVP) — swap for a smoother curve later:
gain = clamp((CUTOFF_RADIUS - dist) / (CUTOFF_RADIUS - FULL_RADIUS), 0, 1)
```
Tune the three constants against the office's tile size during Phase 4.

---

## 4. Claude Code skills to author (before Phase 1)

Create these under `.claude/skills/<name>/SKILL.md`. Keep each tight: a description line
(so Claude knows when to load it) + the conventions/code patterns. These exist to stop
Claude Code reinventing schemas or structure between sessions.

1. **`realtime-contract`** — paste §3 verbatim. The most important skill. Every feature
   that touches the wire format must conform to this.
2. **`livekit-room`** — how tokens are minted (`/api/token`), how the client connects,
   publishes the mic, subscribes to tracks, and reads/writes participant metadata. Include
   the exact helper signatures from `/lib/livekit.ts` once they exist.
3. **`phaser-scene`** — scene lifecycle, how the tilemap + tileset + spritesheets load,
   the world coordinate system, and the rule that **every remote LiveKit participant maps
   to exactly one Phaser avatar keyed by participant identity**.
4. **`proximity-audio`** — the Web Audio graph (one `GainNode` per remote peer, optional
   `StereoPannerNode` downstream), the attenuation constants/formula from §3, and the rule
   that gain updates happen on every position message, not on a timer.

> Optional: a `project-conventions` skill for folder layout, TS strictness, naming, and
> commit style. Nice-to-have, not blocking.

---

## 5. Build phases

### Phase 0 — Scaffold & accounts
**Goal:** runnable empty app + LiveKit project + the four skills.
**Tasks:**
- `create-next-app` (TS, App Router). Add Phaser, the LiveKit client SDK, and the LiveKit server SDK.
- Create a LiveKit Cloud project (free **Build** tier). Put `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env.local` (and Vercel env vars). Never commit secrets.
- Author the four skills from §4 (schemas can be stubs that match §3).
- Clone WorkAdventure and the LiveKit spatial-audio example locally as reference only.
**DoD:** `npm run dev` serves a blank page; `.claude/skills/` has four `SKILL.md` files.
**Verify:** app loads at `localhost:3000`; `ls .claude/skills/*/SKILL.md` shows four.

### Phase 1 — Single-player movement (no networking)
**Goal:** one avatar walks around a pixel-art office with collision. Pure local.
**Tasks:**
- Build `OfficeScene`: load a tilemap (Tiled JSON) + tileset + one character spritesheet.
- Keyboard movement (WASD + arrows), 4-direction walk animation, collide with a "walls" layer.
- Camera follows the avatar.
**DoD:** you can walk around the office and cannot pass through walls/furniture.
**Verify:** manual — walk into every wall edge; confirm collision and smooth animation.

### Phase 2 — Multiplayer presence
**Goal:** open two tabs → see both avatars move in real time.
**Tasks:**
- `/api/token` mints a JWT for `?room=&identity=`. Generate a per-browser `identity` uuid (store in `localStorage`).
- Connect to the LiveKit room on entering `/r/[room]`.
- Broadcast `PosMsg` over the lossy data channel, throttled to ~10 Hz, only while moving.
- On remote `PosMsg`, spawn/update a Phaser avatar keyed by participant identity. Interpolate position for smoothness. Despawn on participant disconnect.
**DoD:** two browser tabs in the same room show each other moving with <200ms perceived lag; closing a tab removes that avatar.
**Verify:** open two tabs on the same `/r/test` link; move each; watch the other.

### Phase 3 — Always-on audio (flat volume)
**Goal:** hear everyone in the room at full volume (proximity comes next).
**Tasks:**
- On connect, request mic permission and publish the audio track (always on).
- Subscribe to all remote audio tracks; attach each to a Web Audio graph node (gain fixed at 1.0 for now).
- HUD: mute/unmute toggle for the local mic.
**DoD:** two tabs (use headphones to avoid feedback) can hear each other; mute works.
**Verify:** two devices/tabs with headphones; talk; toggle mute.

### Phase 4 — Proximity audio
**Goal:** volume fades with distance; silence past the cutoff radius.
**Tasks (4a — gain, the MVP):**
- Maintain each remote peer's last known position (from `PosMsg`) and the local position.
- On every position update, recompute distance and set that peer's `GainNode.gain` using the §3 formula.
- Tune `FULL_RADIUS` / `CUTOFF_RADIUS` against tile size so "standing together" = full, "across the room" = silent.
**Tasks (4b — panning, polish, optional):**
- Insert a `StereoPannerNode` after each gain node; set pan from the left/right offset between local and remote.
**DoD:** walking toward a talking colleague gets louder; walking away goes silent. Speaking indicator (ring/nameplate highlight) shows who's talking, driven by LiveKit's active-speaker events.
**Verify:** three tabs; cluster two together and leave one far; confirm the far one can't hear the pair and vice-versa.

### Phase 5 — Onboarding & magic link
**Goal:** land on a link → name + avatar in 2–3 clicks → enter.
**Tasks:**
- Landing page: "create a room" generates `/r/<slug>` (random or team name).
- `Onboarding` gate on `/r/[room]`: display name, sprite pick, colour tint. Persist `AvatarMeta` to `localStorage`; set as LiveKit participant metadata on connect.
- Remote avatars render their name/sprite/colour from metadata; update live if someone re-customises.
**DoD:** a brand-new browser can open a shared link and be walking around in under ~15 seconds with a chosen avatar and name.
**Verify:** incognito window → paste link → complete onboarding → appears correctly to the other tab.

### Phase 6 — Central chat
**Goal:** shared text chat for the room.
**Tasks:**
- `ChatPanel`: send `ChatMsg` over the reliable data channel; render incoming messages with name + timestamp.
- Cap body length; basic autoscroll; unread indicator when panel is closed.
- (MVP accepts no history for late joiners — note this in the UI or just leave it live-only.)
**DoD:** messages typed in one tab appear in all other tabs in the room near-instantly.
**Verify:** three tabs; send from each; confirm all receive and order is sane.

### Phase 7 — Polish pass
**Goal:** make it feel finished enough to put in front of a team.
**Tasks:** nameplates always legible; speaking ring; participant list in HUD; reconnect handling (network blip → rejoin cleanly); a real office map (walls, desks, a couch/coffee zone as a natural gathering spot); mobile/touch movement if wanted; perf check at 8–10 avatars.
**DoD:** a 6-person team can use it for a 30-minute hangout without confusion or obvious bugs.
**Verify:** real session with one actual team; collect friction notes.

### Phase 8 — Production hardening (when ready to roll out)
**Goal:** GDPR-clean, cost-controlled deployment.
**Tasks:**
- **Self-host LiveKit on AWS Frankfurt (eu-central-1)** — Docker/compose or ECS; point `LIVEKIT_URL` at it. Removes Cloud per-minute cost and gives EU data residency.
- Separate `dev` (LiveKit Cloud) vs `prod` (self-hosted) env config.
- Lock down token route (rate-limit; optionally a shared room secret in the link so links aren't guessable).
- Short privacy note for users: audio is real-time, not recorded; what metadata is stored.
- (Optional) Upstash Redis for chat history + late-joiner backfill.
**DoD:** prod runs on EU infra; no audio leaves the EU; cost is a flat instance, not per-minute.
**Verify:** confirm media server region; load-test one busy room.

---

## 6. Cost & compliance notes
- **Prototype:** LiveKit Cloud **Build** tier is free (~5,000 WebRTC min/month) — enough to develop and demo, not enough for real daily team usage.
- **Reality check:** one team of 6 hanging out ~8h/day ≈ **~60k participant-minutes/month**, far beyond the free tier. Cloud paid tiers start at $50/mo (Ship); **regional data residency on Cloud only starts at the $500/mo Scale tier.**
- **Therefore:** for an actual rollout at a German company, **self-host LiveKit on AWS Frankfurt** (Phase 8). Flat instance cost, full GDPR residency, no per-minute meter.

## 7. Open decisions (resolve as you go)
- Movement model: free pixel movement (chosen above) vs tile-grid snapping (simpler collision, more "retro"). Free movement is assumed; switch in Phase 1 if grid feels better.
- Panning: ship gain-only (Phase 4a) for MVP, or include stereo (4b)? Default: gain-only first.
- Chat persistence: live-only for MVP, add Redis later? Default: live-only.
- One global office vs per-team rooms: per-team (room = team) is the spec; keep it.

## 8. Reference implementations to study (not copy wholesale)
- **WorkAdventure** — OSS, Phaser, pixel-art, self-hostable. Closest match to this spec.
- **LiveKit spatial-audio example** — `github.com/livekit-examples/spatial-audio`. The audio pattern.
- **LiveKit docs** — token minting, data channels, participant metadata, active-speaker events.
