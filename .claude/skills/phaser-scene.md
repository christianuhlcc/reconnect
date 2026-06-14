---
name: phaser-scene
description: Use when building or editing the Phaser game — the office scene, tilemap/tileset/spritesheet loading, avatar sprites, keyboard movement, collision, camera, or the registry that maps LiveKit participants to on-screen avatars. Covers the project's Phaser 3 conventions and coordinate rules.
---

# Phaser scene conventions

Engine: **Phaser 3, Arcade physics.** The scene is `/game/scenes/OfficeScene.ts`.
Coordinate space = **Phaser world pixels**, and that is the SAME space used by `PosMsg.x/y`
in the realtime-contract skill. Never convert; the number you read from the local sprite is
the number you broadcast.

## Mounting in Next.js

- Phaser is client-only. Mount in a `"use client"` component inside `useEffect`; create the
  `Phaser.Game` once, destroy it on unmount (`game.destroy(true)`). Guard against React
  double-invoke in dev (StrictMode) so you don't spawn two games.
- Config: `type: Phaser.AUTO`, arcade physics, `pixelArt: true`, `roundPixels: true`,
  `scale.mode: Phaser.Scale.RESIZE`.

## Scene lifecycle

- `preload()` — load assets:
  - `this.load.tilemapTiledJSON("office", "/assets/office.json")` (map authored in Tiled)
  - `this.load.image("tiles", "/assets/tileset.png")`
  - `this.load.spritesheet("char_a", "/assets/char_a.png", { frameWidth, frameHeight })` (one per sprite key)
- `create()` — build map, layers, animations, local player, camera, input.
- `update(time, delta)` — read input, move local player, emit throttled `pos` (Phase C), lerp remote avatars.

## Tilemap + collision

```ts
const map = this.make.tilemap({ key: "office" });
const tiles = map.addTilesetImage("<tiled-tileset-name>", "tiles");
map.createLayer("floor", tiles, 0, 0);
const walls = map.createLayer("walls", tiles, 0, 0);
walls.setCollisionByProperty({ collides: true }); // set this property on solid tiles in Tiled
```

- Tiled layers by convention: `floor` (non-colliding), `walls` (colliding furniture/walls), optional `above` (drawn over avatars, depth set high).
- Mark solid tiles with a boolean tile property `collides = true` in Tiled.

## Local player

```ts
this.player = this.physics.add.sprite(spawnX, spawnY, spriteKey);
this.physics.add.collider(this.player, walls);
this.cameras.main.startFollow(this.player, true);
this.cameras.main.setZoom(2); // pixel-art reads better zoomed in
```

- Movement: WASD + arrow keys. Set velocity (e.g. 160) per axis; normalise diagonals.
- 4-direction walk anims named `"<spriteKey>-walk-<dir>"` and idle frames per direction.
- Track `dir` (last non-zero direction) and `moving` (velocity != 0) — both feed `PosMsg`.

## Remote avatar registry (critical convention)

- A single `Map<string /*identity*/, Avatar>` owns all remote avatars. `/game/avatar.ts`
  defines `Avatar` (sprite + nameplate text + speaking ring).
- Spawn on `ParticipantConnected` (or first `pos` from an unknown identity); despawn and
  destroy on `ParticipantDisconnected`. Exactly one avatar per identity — never duplicate.
- Remote avatars are **display-only**: no physics body / no collision. Drive them purely by
  incoming `pos` (lerp toward the target each `update` for smoothness; play walk anim while
  `moving`, idle otherwise).
- Nameplate/sprite/colour come from `AvatarMeta` (participant metadata), updated live on
  `ParticipantMetadataChanged`.

## Bridge to the rest of the app

- The scene exposes a small event surface (e.g. an `EventEmitter` or callbacks passed in at
  construction): `onLocalMove(pos)` for the LiveKit layer to broadcast, and methods
  `applyRemotePos(identity, pos)`, `addAvatar(identity, meta)`, `removeAvatar(identity)`,
  `setSpeaking(identity, bool)` for the LiveKit layer to call inward. Keep Phaser and
  LiveKit decoupled — they talk only through this surface.
