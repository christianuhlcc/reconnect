# Skill: phaser-scene

**Load this skill when touching Phaser game code — scenes, tilemaps, sprites, input, or camera.**

---

## Scene lifecycle

`OfficeScene` extends `Phaser.Scene`. Lifecycle order: `constructor` → `preload` → `create` → `update` (60 fps).

```ts
// /game/scenes/OfficeScene.ts
import Phaser from "phaser";

export class OfficeScene extends Phaser.Scene {
  constructor() { super({ key: "OfficeScene" }); }

  preload() { /* load assets */ }
  create() { /* build world, wire input */ }
  update() { /* movement, position broadcast */ }
}
```

## Tilemap loading

Assets live in `/public/assets/`. Load a Tiled JSON export + the tileset PNG:

```ts
// preload()
this.load.tilemapTiledJSON("office", "/assets/maps/office.json");
this.load.image("tiles", "/assets/tilesets/office-tiles.png");
// spritesheet: 48x48 frame, 4 directions × 3 frames = 12 frames
this.load.spritesheet("char_a", "/assets/sprites/char_a.png", { frameWidth: 48, frameHeight: 48 });

// create()
const map = this.make.tilemap({ key: "office" });
const tileset = map.addTilesetImage("office-tiles", "tiles")!;
const groundLayer = map.createLayer("Ground", tileset, 0, 0)!;
const wallsLayer  = map.createLayer("Walls",  tileset, 0, 0)!;
wallsLayer.setCollisionByProperty({ collides: true });
```

## World coordinates

- Origin: (0, 0) at top-left of map.
- World pixel units match what is broadcast in `PosMsg.x` / `PosMsg.y`.
- Camera follows the local avatar: `this.cameras.main.startFollow(localSprite)`.

## Local avatar

Create with `this.physics.add.sprite(x, y, "char_a")`. Add physics collider against `wallsLayer`. Move by setting `velocity` in `update()`, never `setPosition` (so physics collision works).

## Remote avatars — one per LiveKit participant

**Rule:** every remote LiveKit participant maps to exactly one Phaser avatar, keyed by `participant.identity`.

```ts
// /game/avatar.ts
export class RemoteAvatar {
  constructor(scene: Phaser.Scene, identity: string, meta: AvatarMeta) { … }
  moveTo(x: number, y: number, dir: string, moving: boolean) { … }
  destroy() { … }
}

// In OfficeScene:
private remoteAvatars = new Map<string, RemoteAvatar>();

// On PosMsg received:
let avatar = this.remoteAvatars.get(identity);
if (!avatar) {
  avatar = new RemoteAvatar(this, identity, meta);
  this.remoteAvatars.set(identity, avatar);
}
avatar.moveTo(msg.x, msg.y, msg.dir, msg.moving);

// On participant disconnect:
this.remoteAvatars.get(identity)?.destroy();
this.remoteAvatars.delete(identity);
```

## Mounting Phaser in Next.js

Phaser must only run client-side. Wrap the canvas container in a `"use client"` component; instantiate `Phaser.Game` inside a `useEffect` and destroy on cleanup:

```ts
useEffect(() => {
  const game = new Phaser.Game({ scene: [OfficeScene], parent: "phaser-container", … });
  return () => game.destroy(true);
}, []);
```
