import Phaser from 'phaser';
import type { Room } from 'livekit-client';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { RemoteAvatar, EMOTE_DATA } from '@/game/avatar';
import { encodeMsg, decodeMsg } from '@/lib/realtime';
import type { Direction, PosMsg, AvatarMeta, EmoteType } from '@/lib/realtime';
import { updateGain } from '@/lib/audio';

const TILE = 32;
const PLAYER_W = 32;
const PLAYER_H = 48;
const SPEED = 160;
const SPAWN_X = 464;
const SPAWN_Y = 400;
const MAP_COLS = 30;
const MAP_ROWS = 25;
const POS_INTERVAL = 100;

// Tile GIDs:
//   1=floor  2=wall  3=desk  4=desk+monitor  5=bookcase  6=couch  7=plant  8=cooler
//   9=rug  10=walkway  11=round table  12=coffee machine  13=whiteboard  14=window
//   15=treasure chest  16=ship-in-a-bottle  17=tiki palm  18=parrot perch  19=hanging sign
// Walkable tiles — everything else collides (see create()).
const WALKABLE_GIDS = [1, 9, 10];

// 30×25 zoned office: work pods + coffee nook up top, meeting room + lounge +
// plant garden + captain's corner below, all linked by a walkway crossroads.
const OFFICE_MAP: number[][] = [
  [2,14,14,2,2,2,2,14,14,2,2,2,2,2,2,2,2,2,2,14,14,2,2,2,2,14,14,2,2,2],
  [2,5,5,1,1,5,5,1,1,5,5,1,1,1,10,10,1,12,12,12,1,1,8,1,1,5,5,5,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,4,3,1,1,4,3,1,1,4,3,1,1,10,10,1,9,9,9,9,1,1,1,9,9,9,9,1,2],
  [2,1,3,3,1,1,3,3,1,1,3,3,1,1,10,10,1,9,11,11,9,1,7,1,9,11,11,9,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,9,9,9,9,1,1,1,9,9,9,9,1,2],
  [2,7,1,1,1,1,1,1,1,1,1,1,1,7,10,10,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,4,3,1,1,4,3,1,1,4,3,1,1,10,10,1,5,5,1,1,1,1,1,1,1,12,12,1,2],
  [2,1,3,3,1,1,3,3,1,1,3,3,1,1,10,10,1,1,1,1,1,1,11,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,1,1,1,1,9,9,9,1,1,1,1,1,2],
  [2,7,1,1,1,1,1,1,1,1,1,1,1,7,10,10,7,1,1,1,1,9,11,9,1,1,1,1,7,2],
  [2,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,2],
  [2,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,2],
  [2,1,1,13,13,13,1,1,1,1,1,1,1,1,10,10,1,5,5,1,1,1,1,1,1,1,7,1,1,2],
  [2,9,9,9,9,9,9,9,9,9,9,9,9,1,10,10,1,9,9,9,9,9,9,9,9,9,9,9,1,2],
  [2,9,9,11,11,11,9,9,11,11,11,9,9,1,10,10,1,9,6,6,6,9,9,6,6,6,9,9,1,2],
  [2,9,9,9,9,9,9,9,9,9,9,9,9,1,10,10,1,9,6,6,6,9,9,6,6,6,9,9,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,9,9,9,9,9,9,9,9,9,9,9,1,2],
  [2,7,1,7,1,17,1,1,17,1,1,7,1,7,10,10,19,1,1,1,1,1,1,1,1,1,1,1,17,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,1,15,1,1,16,1,1,18,1,1,1,1,2],
  [2,7,17,1,7,1,1,7,1,1,17,1,7,1,10,10,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,17,1,1,6,6,1,1,1,1,5,5,1,17,2],
  [2,7,1,1,17,1,7,1,17,1,1,7,1,7,10,10,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,10,10,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];

const IDLE_FRAME: Record<Direction, number> = {
  down: 0, up: 2, left: 4, right: 6,
};

const DEFAULT_META: AvatarMeta = {
  name: '',
  sprite: 'player',
  color: '#5588FF',
  skinTone: '#FFCC88',
  hairStyle: 'short',
  hairColor: '#4A2C0A',
  beard: 'none',
};

type WASDKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

type EmoteKeys = {
  e1: Phaser.Input.Keyboard.Key;
  e2: Phaser.Input.Keyboard.Key;
  e3: Phaser.Input.Keyboard.Key;
  e4: Phaser.Input.Keyboard.Key;
  e5: Phaser.Input.Keyboard.Key;
  e6: Phaser.Input.Keyboard.Key;
};

// Shade a hex color — factor < 0 darkens, factor > 0 lightens
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 0xFF) + factor * 255)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 0xFF) + factor * 255)));
  const b = Math.min(255, Math.max(0, Math.round((n & 0xFF) + factor * 255)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WASDKeys;
  private emoteKeys!: EmoteKeys;
  private facing: Direction = 'down';

  private lkRoom: Room | null = null;
  private localMeta: AvatarMeta = { ...DEFAULT_META };
  private remoteAvatars = new Map<string, RemoteAvatar>();

  private lastPosSend = 0;
  private wasMoving = false;

  private localEmoteText: Phaser.GameObjects.Text | null = null;
  private localEmoteTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  init(data: { room: string; lkRoom: Room | null; meta?: AvatarMeta }) {
    this.lkRoom = data.lkRoom ?? null;
    if (data.meta) this.localMeta = { ...DEFAULT_META, ...data.meta };
  }

  create() {
    this.buildTilesetTexture();
    this.buildAvatarTexture('player_local', this.localMeta);
    this.createAvatarAnimations('player_local');

    const map = this.make.tilemap({ data: OFFICE_MAP, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('office-tiles', 'tiles', TILE, TILE, 0, 0, 1)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollisionByExclusion([-1, ...WALKABLE_GIDS]);

    this.player = this.physics.add.sprite(SPAWN_X, SPAWN_Y, 'player_local', 0);
    this.player.setDepth(1);
    this.physics.add.collider(this.player, layer);

    const mapW = MAP_COLS * TILE;
    const mapH = MAP_ROWS * TILE;
    this.physics.world.setBounds(0, 0, mapW, mapH);
    this.player.setCollideWorldBounds(true);

    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as WASDKeys;
    this.emoteKeys = this.input.keyboard!.addKeys({
      e1: Phaser.Input.Keyboard.KeyCodes.ONE,
      e2: Phaser.Input.Keyboard.KeyCodes.TWO,
      e3: Phaser.Input.Keyboard.KeyCodes.THREE,
      e4: Phaser.Input.Keyboard.KeyCodes.FOUR,
      e5: Phaser.Input.Keyboard.KeyCodes.FIVE,
      e6: Phaser.Input.Keyboard.KeyCodes.SIX,
    }) as EmoteKeys;
    this.input.keyboard!.disableGlobalCapture();

    this.setupLiveKitListeners();
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // Keep local emote bubble above player
    if (this.localEmoteText) {
      this.localEmoteText.setPosition(this.player.x, this.player.y - 46);
    }

    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
      if (this.wasMoving) {
        this.broadcastPos(false);
        this.wasMoving = false;
      }
      this.player.anims.stop();
      this.player.setFrame(IDLE_FRAME[this.facing]);
      this.remoteAvatars.forEach((avatar) => avatar.tick());
      return;
    }

    // Emote keys (1-6)
    const emoteDefs: [Phaser.Input.Keyboard.Key, EmoteType][] = [
      [this.emoteKeys.e1, 'joy'],
      [this.emoteKeys.e2, 'anger'],
      [this.emoteKeys.e3, 'sadness'],
      [this.emoteKeys.e4, 'sleepy'],
      [this.emoteKeys.e5, 'bored'],
      [this.emoteKeys.e6, 'frustrated'],
    ];
    for (const [key, emote] of emoteDefs) {
      if (Phaser.Input.Keyboard.JustDown(key)) {
        this.triggerLocalEmote(emote);
        this.broadcastEmote(emote);
        break;
      }
    }

    const { left, right, up, down } = this.cursors;
    const goLeft  = left.isDown  || this.wasd.A.isDown;
    const goRight = right.isDown || this.wasd.D.isDown;
    const goUp    = up.isDown    || this.wasd.W.isDown;
    const goDown  = down.isDown  || this.wasd.S.isDown;

    let moving = false;

    if (goLeft)       { body.setVelocityX(-SPEED); this.facing = 'left';  moving = true; }
    else if (goRight) { body.setVelocityX(SPEED);  this.facing = 'right'; moving = true; }

    if (goUp)         { body.setVelocityY(-SPEED); this.facing = 'up';   moving = true; }
    else if (goDown)  { body.setVelocityY(SPEED);  this.facing = 'down'; moving = true; }

    if (body.velocity.x !== 0 && body.velocity.y !== 0) {
      body.velocity.normalize().scale(SPEED);
    }

    if (moving) {
      this.player.anims.play(`walk-${this.facing}-player_local`, true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(IDLE_FRAME[this.facing]);
    }

    if (this.lkRoom) {
      const now = this.time.now;
      if (moving && now - this.lastPosSend >= POS_INTERVAL) {
        this.broadcastPos(true);
        this.lastPosSend = now;
      } else if (!moving && this.wasMoving) {
        this.broadcastPos(false);
      }
    }
    this.wasMoving = moving;

    this.remoteAvatars.forEach(avatar => avatar.tick());
  }

  private triggerLocalEmote(emote: EmoteType) {
    if (this.localEmoteText) {
      this.localEmoteText.destroy();
      this.localEmoteText = null;
    }
    if (this.localEmoteTimer) {
      this.localEmoteTimer.remove();
      this.localEmoteTimer = null;
    }

    const { text, color } = EMOTE_DATA[emote];
    this.localEmoteText = this.add
      .text(this.player.x, this.player.y - 46, text, {
        fontSize: '9px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(3);

    this.localEmoteTimer = this.time.delayedCall(3000, () => {
      if (this.localEmoteText) {
        this.localEmoteText.destroy();
        this.localEmoteText = null;
      }
    });
  }

  private broadcastPos(moving: boolean) {
    if (!this.lkRoom || this.lkRoom.state !== ConnectionState.Connected) return;
    const msg: PosMsg = {
      t: 'pos',
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      dir: this.facing,
      moving,
    };
    this.lkRoom.localParticipant.publishData(encodeMsg(msg), {
      reliable: false,
      topic: 'pos',
    }).catch(() => {});
  }

  private broadcastEmote(emote: EmoteType) {
    if (!this.lkRoom || this.lkRoom.state !== ConnectionState.Connected) return;
    this.lkRoom.localParticipant.publishData(
      encodeMsg({ t: 'emote', emote }),
      { reliable: true, topic: 'emote' }
    ).catch(() => {});
  }

  private handleRemotePosMsg(identity: string, msg: PosMsg) {
    let avatar = this.remoteAvatars.get(identity);
    if (!avatar) {
      const participant = this.lkRoom?.remoteParticipants.get(identity);
      let name = identity.slice(0, 6);
      let partialMeta: Partial<AvatarMeta> = {};
      if (participant?.metadata) {
        try {
          const meta = JSON.parse(participant.metadata) as AvatarMeta;
          name = meta.name || name;
          partialMeta = meta;
        } catch { /* ignore */ }
      }
      const texKey = `player_${identity}`;
      if (!this.textures.exists(texKey)) {
        this.buildAvatarTexture(texKey, partialMeta);
        this.createAvatarAnimations(texKey);
      }
      avatar = new RemoteAvatar(this, msg.x, msg.y, name, texKey);
      this.remoteAvatars.set(identity, avatar);
    }
    avatar.applyPos(msg);

    const dx = msg.x - this.player.x;
    const dy = msg.y - this.player.y;
    updateGain(identity, Math.sqrt(dx * dx + dy * dy));
  }

  private setupLiveKitListeners() {
    if (!this.lkRoom) return;

    this.lkRoom.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, participant?: { identity: string }) => {
        if (!participant) return;
        try {
          const msg = decodeMsg(payload);
          if (msg.t === 'pos') {
            this.handleRemotePosMsg(participant.identity, msg);
          } else if (msg.t === 'emote') {
            this.remoteAvatars.get(participant.identity)?.triggerEmote(msg.emote);
          }
        } catch { /* ignore malformed packets */ }
      }
    );

    this.lkRoom.on(RoomEvent.ParticipantDisconnected, (participant: { identity: string }) => {
      this.remoteAvatars.get(participant.identity)?.destroy();
      this.remoteAvatars.delete(participant.identity);
    });

    this.lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Array<{ identity: string }>) => {
      const speakingIds = new Set(speakers.map((s) => s.identity));
      this.remoteAvatars.forEach((avatar, id) => avatar.setSpeaking(speakingIds.has(id)));
    });

    this.lkRoom.on(
      RoomEvent.ParticipantMetadataChanged,
      (_prev: unknown, participant: { identity: string; metadata?: string }) => {
        const avatar = this.remoteAvatars.get(participant.identity);
        if (!avatar || !participant.metadata) return;
        try {
          const meta = JSON.parse(participant.metadata) as AvatarMeta;
          const texKey = `player_${participant.identity}`;
          this.buildAvatarTexture(texKey, meta);
          this.createAvatarAnimations(texKey);
          avatar.updateTexture(texKey);
          if (meta.name) avatar.applyMeta(meta.name);
        } catch { /* ignore */ }
      }
    );
  }

  // ── Texture generation ──────────────────────────────────────────────────────

  private buildAvatarTexture(key: string, meta: Partial<AvatarMeta>) {
    const W = PLAYER_W, H = PLAYER_H;
    const skinTone  = meta.skinTone  ?? DEFAULT_META.skinTone;
    const hairStyle = meta.hairStyle ?? DEFAULT_META.hairStyle;
    const hairColor = meta.hairColor ?? DEFAULT_META.hairColor;
    const beard     = meta.beard     ?? DEFAULT_META.beard;
    const shirtColor = meta.color    ?? DEFAULT_META.color;
    const shirtDark  = shade(shirtColor, -0.18);

    if (this.textures.exists(key)) this.textures.remove(key);

    const tex = this.textures.createCanvas(key, W * 8, H)!;
    const ctx = tex.getContext()!;

    // Chibi proportions: oversized head, small rounded body, stubby limbs —
    // the silhouette that reads as "cute video-game character".
    const HEAD_R = 12;
    const outline = 'rgba(38,26,40,0.5)';
    const skinShade = shade(skinTone, -0.12);
    const shirtLight = shade(shirtColor, 0.16);
    const dirs: Direction[] = ['down', 'up', 'left', 'right'];

    dirs.forEach((dir, di) => {
      for (let frame = 0; frame < 2; frame++) {
        const bx = (di * 2 + frame) * W;
        const cx = bx + W / 2;
        const headCy = 15;
        const bob = frame === 1 ? 1 : 0; // tiny vertical bob on the 2nd walk frame

        // ── Ground shadow ──
        ellipse(ctx, cx, H - 3, 10, 3, 'rgba(0,0,0,0.18)');

        // ── Feet: little rounded shoes that alternate while walking ──
        const footY = H - 8;
        const stepL = frame === 0 ? -1 : 0;
        const stepR = frame === 0 ? 0 : -1;
        rr(ctx, bx + 8,  footY + stepL, 7, 6, 3, outline);
        rr(ctx, bx + 17, footY + stepR, 7, 6, 3, outline);
        rr(ctx, bx + 9,  footY + stepL, 6, 5, 2, '#5A3A22');
        rr(ctx, bx + 18, footY + stepR, 6, 5, 2, '#5A3A22');
        f(ctx, bx + 10, footY + stepL + 1, 3, 1, 'rgba(255,255,255,0.3)');
        f(ctx, bx + 19, footY + stepR + 1, 3, 1, 'rgba(255,255,255,0.3)');

        // ── Body / shirt: rounded with a soft outline ──
        const bodyTop = 24 + bob;
        rr(ctx, bx + 6, bodyTop,     20, 17, 8, outline);
        rr(ctx, bx + 7, bodyTop + 1, 18, 15, 7, shirtColor);
        f(ctx, bx + 9,  bodyTop + 2,  14, 2, shirtLight);  // chest highlight
        f(ctx, bx + 8,  bodyTop + 12, 16, 3, shirtDark);   // belly shade
        f(ctx, cx - 3,  bodyTop + 1,  6, 2,  shirtDark);   // collar

        // ── Stubby mitten hands ──
        const handY = bodyTop + 7 + bob;
        circle(ctx, bx + 6,  handY, 3,   outline);
        circle(ctx, bx + 26, handY, 3,   outline);
        circle(ctx, bx + 6,  handY, 2.2, skinTone);
        circle(ctx, bx + 26, handY, 2.2, skinTone);

        // ── Head ──
        circle(ctx, cx, headCy, HEAD_R + 0.5, outline);
        circle(ctx, cx, headCy, HEAD_R, skinTone);
        ellipse(ctx, cx, headCy + HEAD_R - 4, HEAD_R - 4, 3, skinShade); // soft jaw

        // ── Hair: back of head when facing away, otherwise front fringe ──
        this.drawHair(ctx, cx, headCy, HEAD_R, hairStyle, hairColor, dir === 'up');

        // ── Beard, then face (both hidden from behind) ──
        if (dir !== 'up') {
          if (beard !== 'none') this.drawBeard(ctx, cx, headCy, HEAD_R, beard, hairColor);
          this.drawFace(ctx, cx, headCy, dir);
        }
      }
    });

    tex.refresh();

    const pTex = this.textures.get(key);
    for (let i = 0; i < 8; i++) {
      pTex.add(i, 0, i * W, 0, W, H);
    }
  }

  private drawHair(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    style: string, color: string, back: boolean,
  ) {
    if (style === 'bald') return;
    const dark = shade(color, -0.15);

    // Most fringe shapes are clipped to the head circle so they stay head-shaped.
    const clipHead = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
      ctx.clip();
    };

    // A spiky three-point fan rising off the crown.
    const mohawkCrest = () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - r + 4);
      ctx.lineTo(cx - 4, cy - r - 4);
      ctx.lineTo(cx - 1.5, cy - r + 1);
      ctx.lineTo(cx, cy - r - 8);
      ctx.lineTo(cx + 1.5, cy - r + 1);
      ctx.lineTo(cx + 4, cy - r - 4);
      ctx.lineTo(cx + 6, cy - r + 4);
      ctx.closePath();
      ctx.fill();
    };

    if (back) {
      // Facing away: the back of the head is mostly hair.
      clipHead();
      if (style === 'mohawk') {
        f(ctx, cx - 3, cy - r, 6, r * 2, color);
      } else {
        circle(ctx, cx, cy, r, color);
      }
      ctx.restore();
      if (style === 'bun') {
        circle(ctx, cx, cy - r - 1, 4, color);
        f(ctx, cx - 5, cy - r + 2, 10, 2, dark);
      } else if (style === 'mohawk') {
        mohawkCrest();
      }
      return;
    }

    switch (style) {
      case 'short':
        clipHead();
        f(ctx, cx - r, cy - r, r * 2, r, color); // cap over the forehead
        ctx.restore();
        break;

      case 'long':
        clipHead();
        f(ctx, cx - r, cy - r, r * 2, r, color);
        ctx.restore();
        rr(ctx, cx - r,     cy - 2, 3, r + 7, 2, color); // flowing side strands
        rr(ctx, cx + r - 3, cy - 2, 3, r + 7, 2, color);
        break;

      case 'curly': {
        // Fluffy bumps around the crown, spilling slightly past the head.
        const bumps: [number, number][] = [
          [-9, -5], [-4, -9], [2, -9], [8, -6], [-7, -10], [0, -11], [6, -10],
        ];
        bumps.forEach(([dx, dy]) => circle(ctx, cx + dx, cy + dy, 5, color));
        clipHead();
        f(ctx, cx - r, cy - r, r * 2, r - 2, color);
        ctx.restore();
        break;
      }

      case 'bun':
        clipHead();
        f(ctx, cx - r, cy - r, r * 2, r, color);
        ctx.restore();
        circle(ctx, cx, cy - r - 1, 4, color);   // top knot
        f(ctx, cx - 5, cy - r + 2, 10, 2, dark); // hair tie
        break;

      case 'mohawk':
        clipHead();
        f(ctx, cx - 3, cy - r, 6, r, color);       // strip across the crown
        ctx.restore();
        mohawkCrest();                             // raised spiky fin
        break;
    }
  }

  private drawFace(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, dir: Direction,
  ) {
    const eyeY = cy + 2;
    const ox = dir === 'left' ? -2 : dir === 'right' ? 2 : 0;
    const dx = 4;

    // Big shiny eyes — the single biggest "cute" cue.
    ellipse(ctx, cx - dx + ox, eyeY, 2.3, 3.1, '#2A2230');
    ellipse(ctx, cx + dx + ox, eyeY, 2.3, 3.1, '#2A2230');
    circle(ctx, cx - dx + ox - 0.7, eyeY - 1.3, 1, '#FFFFFF'); // catch-light
    circle(ctx, cx + dx + ox - 0.7, eyeY - 1.3, 1, '#FFFFFF');

    // Rosy blush cheeks.
    ellipse(ctx, cx - 7 + ox, eyeY + 3, 2, 1.4, 'rgba(255,150,150,0.45)');
    ellipse(ctx, cx + 7 + ox, eyeY + 3, 2, 1.4, 'rgba(255,150,150,0.45)');

    // Little smile.
    ctx.strokeStyle = '#9A5A3A';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx + ox, eyeY + 2.5, 2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  private drawBeard(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number,
    beard: string, hairColor: string,
  ) {
    // Clip to the head circle so the beard hugs the lower face.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    if (beard === 'stubble') {
      ctx.fillStyle = shade(hairColor, -0.1);
      for (let py = cy + 2; py <= cy + r; py += 2) {
        for (let px = cx - r; px <= cx + r; px += 3) {
          ctx.fillRect(px, py, 1, 1);
        }
      }
    } else {
      // full
      ctx.fillStyle = hairColor;
      ctx.fillRect(cx - r, cy + 2, r * 2, r - 2);
    }

    ctx.restore();
  }

  private createAvatarAnimations(textureKey: string) {
    const defs: [string, number, number][] = [
      [`walk-down-${textureKey}`,  0, 1],
      [`walk-up-${textureKey}`,    2, 3],
      [`walk-left-${textureKey}`,  4, 5],
      [`walk-right-${textureKey}`, 6, 7],
    ];
    defs.forEach(([animKey, f0, f1]) => {
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: [
            { key: textureKey, frame: f0 },
            { key: textureKey, frame: f1 },
          ],
          frameRate: 8,
          repeat: -1,
        });
      }
    });
  }

  // ── Tileset texture ─────────────────────────────────────────────────────────
  // Each entry draws one 32×32 tile at horizontal offset `ox`. Array order maps
  // directly to GID (index + 1), and the canvas width is derived from the count,
  // so adding a tile is a one-line append — no magic offsets to keep in sync.

  private buildTilesetTexture() {
    const T = TILE;

    // Drawn first so the helpers below can close over `ctx`.
    const drawers: Array<(ctx: CanvasRenderingContext2D, ox: number) => void> = [
      drawFloor,        // 1  floor
      drawWall,         // 2  wall
      drawDeskPapers,   // 3  desk
      drawDeskMonitor,  // 4  desk + monitor
      drawBookcase,     // 5  bookcase
      drawCouch,        // 6  couch
      drawPlant,        // 7  plant
      drawCooler,       // 8  water cooler
      drawRug,          // 9  area rug
      drawWalkway,      // 10 walkway
      drawRoundTable,   // 11 round meeting table
      drawCoffee,       // 12 coffee machine
      drawWhiteboard,   // 13 whiteboard
      drawWindow,       // 14 window
      drawChest,        // 15 treasure chest
      drawShip,         // 16 ship-in-a-bottle
      drawTiki,         // 17 tiki palm
      drawParrot,       // 18 parrot perch
      drawSign,         // 19 hanging sign
    ];

    const tex = this.textures.createCanvas('tiles', T * drawers.length, T)!;
    const ctx = tex.getContext()!;
    drawers.forEach((draw, i) => draw(ctx, i * T));

    tex.refresh();
  }
}

// ── Tile drawing helpers (pure canvas, no Phaser state) ───────────────────────

const f = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, color: string,
) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

// Rounded rectangle via arcTo (universally supported, unlike roundRect).
const rr = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number, color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
};

const circle = (
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, color: string,
) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };

const ellipse = (
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, color: string,
) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };

const tri = (
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy);
  ctx.closePath(); ctx.fill();
};

const T = TILE;

// Warm honey plank floor (also reused under plant / cooler tiles).
function planks(ctx: CanvasRenderingContext2D, ox: number) {
  const pc = ['#E0B070', '#D6A464', '#E6B97A', '#D8A86A'];
  for (let p = 0; p < 4; p++) {
    f(ctx, ox, p * 8, T, 7, pc[p]);
    f(ctx, ox + 3 + p * 4, p * 8, 1, 7, 'rgba(255,235,180,0.20)');
    f(ctx, ox + 18 + p * 2, p * 8, 1, 7, 'rgba(255,235,180,0.12)');
    f(ctx, ox, p * 8 + 7, T, 1, '#9A6A34');
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
}

// Soft sage-teal plaster wall.
function drawWall(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#5B8A7D');
  f(ctx, ox, 0, T, 5, '#7BA89B');
  f(ctx, ox, 0, 3, T, '#6B988B');
  for (let r = 0; r < 4; r++) {
    const y = 6 + r * 7;
    f(ctx, ox + 3, y, T - 3, 1, '#4A6F64');
    f(ctx, r % 2 === 0 ? ox + 18 : ox + 10, y - 6, 1, 6, '#52796D');
  }
  f(ctx, ox + T - 2, 0, 2, T, 'rgba(0,0,0,0.28)');
  f(ctx, ox, T - 2, T, 2, 'rgba(0,0,0,0.28)');
}

function drawDeskPapers(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#9A7044'); f(ctx, ox, 0, T, 4, '#5C3A20'); f(ctx, ox, 4, T, 4, '#B08050');
  f(ctx, ox + 3, 10, 11, 14, '#FFFFF0'); f(ctx, ox + 4, 12, 8, 1, '#C8C8B0');
  f(ctx, ox + 4, 14, 6, 1, '#C8C8B0'); f(ctx, ox + 4, 16, 9, 1, '#C8C8B0'); f(ctx, ox + 4, 18, 7, 1, '#C8C8B0');
  f(ctx, ox + 16, 16, 12, 9, '#4A4A4A'); f(ctx, ox + 17, 17, 10, 7, '#3A3A3A');
  for (let kr = 0; kr < 3; kr++) f(ctx, ox + 18, 18 + kr * 2, 8, 1, '#555');
  f(ctx, ox + 4, 23, 7, 6, '#FFFFFF'); f(ctx, ox + 5, 24, 5, 4, '#5C1414');
  f(ctx, ox + 11, 25, 3, 3, '#FFFFFF'); f(ctx, ox + 3, 23, 1, 6, 'rgba(0,0,0,0.15)');
  f(ctx, ox + 6, 21, 1, 2, 'rgba(200,200,200,0.5)'); f(ctx, ox + 8, 20, 1, 3, 'rgba(200,200,200,0.4)');
}

function drawDeskMonitor(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#9A7044'); f(ctx, ox, 0, T, 4, '#5C3A20'); f(ctx, ox, 4, T, 4, '#B08050');
  f(ctx, ox + 5, 4, 22, 16, '#181828');
  f(ctx, ox + 6, 5, 20, 14, '#1E2A6E');
  const lines: [number, string][] = [[7, '#7EC8E3'], [9, '#88D498'], [11, '#F0A500'], [13, '#E86060'], [15, '#A29BFE'], [17, '#7EC8E3']];
  lines.forEach(([ly, c], i) => f(ctx, ox + 7, ly, 5 + (i % 3) * 4, 1, c));
  f(ctx, ox + 6, 5, 7, 4, 'rgba(255,255,255,0.07)');
  f(ctx, ox + 14, 20, 4, 5, '#2A2A2A'); f(ctx, ox + 11, 23, 10, 2, '#333');
  f(ctx, ox + 6, 26, 20, 5, '#4A4A4A'); f(ctx, ox + 7, 27, 18, 3, '#3A3A3A');
  for (let kr = 0; kr < 2; kr++) f(ctx, ox + 8, 27 + kr, 16, 1, '#555');
}

function drawBookcase(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#3D2B1A'); f(ctx, ox, 0, T, 2, '#7A5A30');
  f(ctx, ox, 0, 2, T, '#5C3D24'); f(ctx, ox + T - 2, 0, 2, T, '#1E140A');
  [10, 21].forEach(sy => f(ctx, ox, sy, T, 2, '#7A5A30'));
  const booksRow = (row: [number, number, string][], y: number) =>
    row.forEach(([x, w, c]) => {
      f(ctx, ox + x, y, w - 1, 8, c); f(ctx, ox + x, y, 1, 8, 'rgba(255,255,255,0.2)');
    });
  booksRow([[2, 3, '#C0392B'], [5, 4, '#E67E22'], [9, 3, '#27AE60'], [12, 5, '#2980B9'],
            [17, 3, '#8E44AD'], [20, 4, '#E74C3C'], [24, 4, '#F1C40F'], [28, 2, '#16A085']], 2);
  booksRow([[2, 4, '#9B59B6'], [6, 3, '#1ABC9C'], [9, 5, '#E74C3C'], [14, 3, '#F39C12'],
            [17, 4, '#2ECC71'], [21, 3, '#3498DB'], [24, 5, '#E67E22'], [29, 1, '#BDC3C7']], 12);
  booksRow([[2, 5, '#C0392B'], [7, 3, '#27AE60'], [10, 4, '#8E44AD'], [14, 3, '#F1C40F'],
            [17, 5, '#2980B9'], [22, 3, '#E74C3C'], [25, 4, '#1ABC9C']], 23);
}

// Rounded pastel-coral couch. Sits on rug zones, so paints a rug backdrop
// (a seamless blend there, a cute little accent rug anywhere else).
function drawCouch(ctx: CanvasRenderingContext2D, ox: number) {
  drawRug(ctx, ox);
  f(ctx, ox + 2, 28, 28, 2, 'rgba(0,0,0,0.12)');           // shadow
  rr(ctx, ox + 1, 8, 5, 20, 3, '#E07A5C');                 // left armrest
  rr(ctx, ox + 26, 8, 5, 20, 3, '#E07A5C');                // right armrest
  rr(ctx, ox + 3, 4, 26, 11, 4, '#E8896B');                // backrest
  rr(ctx, ox + 3, 12, 26, 15, 5, '#F2A488');               // seat base
  rr(ctx, ox + 5, 14, 10, 11, 3, '#F7B59C');               // cushion L
  rr(ctx, ox + 17, 14, 10, 11, 3, '#F7B59C');              // cushion R
  f(ctx, ox + 4, 6, 24, 2, 'rgba(255,255,255,0.18)');      // back highlight
}

function drawPlant(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 7, 5, 7, 15, '#1A6B3C'); f(ctx, ox + 18, 8, 7, 11, '#145A32');
  f(ctx, ox + 12, 2, 8, 17, '#1E8449');
  f(ctx, ox + 8, 7, 3, 6, '#27AE60'); f(ctx, ox + 19, 10, 4, 5, '#1ABC9C'); f(ctx, ox + 13, 3, 4, 7, '#27AE60');
  f(ctx, ox + 10, 8, 1, 11, '#145A32'); f(ctx, ox + 22, 12, 1, 6, '#0E6655'); f(ctx, ox + 16, 16, 1, 4, '#196F3D');
  f(ctx, ox + 15, 18, 2, 4, '#196F3D');
  f(ctx, ox + 10, 21, 12, 3, '#DEB887'); f(ctx, ox + 11, 23, 10, 7, '#CD853F');
  f(ctx, ox + 12, 25, 8, 5, '#3D1A00');
}

function drawCooler(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 10, 2, 12, 22, '#2980B9');
  f(ctx, ox + 11, 3, 10, 10, '#3498DB'); f(ctx, ox + 12, 4, 8, 8, '#85C1E9'); f(ctx, ox + 13, 5, 6, 6, '#AED6F1');
  f(ctx, ox + 12, 7, 8, 2, '#FFFFFF');
  f(ctx, ox + 14, 13, 4, 5, '#1A5276'); f(ctx, ox + 15, 14, 2, 3, '#85C1E9');
  f(ctx, ox + 9, 18, 14, 2, '#AEB6BF');
  f(ctx, ox + 10, 20, 12, 4, '#2471A3');
  f(ctx, ox + 11, 21, 3, 2, '#E74C3C');
  f(ctx, ox + 18, 21, 3, 2, '#3498DB');
  f(ctx, ox + 10, 24, 12, 5, '#1F618D'); f(ctx, ox + 11, 25, 10, 3, '#1A5276');
  f(ctx, ox + 10, 29, 3, 2, '#154360'); f(ctx, ox + 19, 29, 3, 2, '#154360');
}

// Seamless woven rug — pattern repeats every tile so adjacent rug tiles blend.
function drawRug(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#E3C9A0');
  for (let yy = 0; yy < T; yy += 8) {
    for (let xx = 0; xx < T; xx += 8) {
      f(ctx, ox + xx + 1, yy + 1, 3, 3, '#EFD9B8');
      f(ctx, ox + xx + 5, yy + 5, 2, 2, '#CDAE82');
    }
  }
}

// Pale flagstone walkway — distinct from honey floor, offset-brick pattern.
function drawWalkway(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#CDBC97');
  const seam = '#B0996F';
  f(ctx, ox, 0, T, 2, seam); f(ctx, ox, 15, T, 2, seam);
  f(ctx, ox, 0, 2, 15, seam); f(ctx, ox + 16, 0, 2, 15, seam);
  f(ctx, ox + 8, 15, 2, 17, seam); f(ctx, ox + 24, 15, 2, 17, seam);
  f(ctx, ox + 3, 3, 11, 10, '#D8C8A6'); f(ctx, ox + 19, 3, 10, 10, '#D8C8A6');
  f(ctx, ox + 11, 18, 11, 11, '#D8C8A6'); f(ctx, ox + 27, 18, 4, 11, '#D8C8A6');
  f(ctx, ox + 1, 18, 6, 11, '#D8C8A6');
}

function drawRoundTable(ctx: CanvasRenderingContext2D, ox: number) {
  drawRug(ctx, ox);                                        // backdrop (blends on rugs)
  ellipse(ctx, ox + 16, 27, 12, 4, 'rgba(0,0,0,0.12)');    // shadow
  circle(ctx, ox + 16, 15, 13, '#A9743F');                 // table edge
  circle(ctx, ox + 16, 14, 11, '#C28E54');                 // top highlight
  circle(ctx, ox + 16, 15, 8, '#B5824A');                  // inner
  f(ctx, ox + 13, 11, 6, 2, '#36A268');                    // tiny plant
  f(ctx, ox + 14, 9, 4, 4, '#2E8B57');
}

function drawCoffee(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  rr(ctx, ox + 2, 16, 28, 14, 3, '#8C6A47');               // counter
  f(ctx, ox + 2, 16, 28, 3, '#A6815B');                    // counter top
  rr(ctx, ox + 6, 4, 20, 14, 2, '#3A3A40');                // machine body
  f(ctx, ox + 7, 6, 18, 6, '#5A5A66');                     // upper panel
  f(ctx, ox + 9, 7, 6, 3, '#9AD7E0');                      // display
  f(ctx, ox + 14, 18, 4, 3, '#222');                       // group head
  f(ctx, ox + 8, 12, 4, 4, '#FFFFFF'); f(ctx, ox + 20, 12, 4, 4, '#FFFFFF'); // cups
  f(ctx, ox + 10, 2, 1, 2, 'rgba(255,255,255,0.5)'); f(ctx, ox + 22, 2, 1, 2, 'rgba(255,255,255,0.5)'); // steam
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 2, 3, 28, 22, '#6B4F34');                    // frame
  f(ctx, ox + 4, 5, 24, 18, '#F7F7F2');                    // board
  f(ctx, ox + 6, 8, 10, 1, '#E74C3C'); f(ctx, ox + 6, 11, 14, 1, '#2980B9'); f(ctx, ox + 6, 14, 8, 1, '#27AE60');
  f(ctx, ox + 18, 8, 6, 1, '#8E44AD'); f(ctx, ox + 18, 11, 5, 1, '#F39C12');
  f(ctx, ox + 18, 15, 6, 5, '#3498DB'); f(ctx, ox + 19, 16, 4, 3, '#85C1E9');
  f(ctx, ox + 4, 23, 24, 2, '#5C4326'); f(ctx, ox + 8, 24, 5, 1, '#E74C3C'); // tray + marker
}

function drawWindow(ctx: CanvasRenderingContext2D, ox: number) {
  f(ctx, ox, 0, T, T, '#5B8A7D');                          // wall plaster
  f(ctx, ox, 0, T, 5, '#7BA89B'); f(ctx, ox, 0, 3, T, '#6B988B');
  f(ctx, ox + 5, 5, 22, 22, '#EAE0CC');                    // frame
  f(ctx, ox + 7, 7, 18, 18, '#86C5E0');                    // sky
  f(ctx, ox + 15, 7, 2, 18, '#EAE0CC'); f(ctx, ox + 7, 15, 18, 2, '#EAE0CC'); // mullions
  f(ctx, ox + 9, 9, 5, 2, 'rgba(255,255,255,0.8)'); f(ctx, ox + 19, 18, 4, 2, 'rgba(255,255,255,0.6)'); // clouds
  f(ctx, ox + 4, 25, 24, 3, '#C9BF9F');                    // sill
}

function drawChest(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 5, 29, 22, 2, 'rgba(0,0,0,0.18)');           // shadow
  rr(ctx, ox + 5, 15, 22, 13, 2, '#6E4A28');               // body
  f(ctx, ox + 5, 18, 22, 2, '#8A6038');                    // plank line
  // domed lid
  ctx.fillStyle = '#7A5230';
  ctx.beginPath();
  ctx.moveTo(ox + 5, 16);
  ctx.arcTo(ox + 5, 8, ox + 16, 8, 7);
  ctx.arcTo(ox + 27, 8, ox + 27, 16, 7);
  ctx.lineTo(ox + 27, 16);
  ctx.closePath();
  ctx.fill();
  f(ctx, ox + 5, 14, 22, 2, '#C8A24A');                    // lock band
  f(ctx, ox + 9, 8, 2, 20, '#C8A24A'); f(ctx, ox + 21, 8, 2, 20, '#C8A24A'); // metal straps
  f(ctx, ox + 12, 11, 8, 2, '#FFE08A');                    // gold glimmer
  f(ctx, ox + 14, 15, 4, 5, '#E0C158'); f(ctx, ox + 15, 17, 2, 2, '#6E4A28'); // lock
}

function drawShip(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  rr(ctx, ox + 4, 22, 24, 7, 2, '#8C6A47'); f(ctx, ox + 4, 22, 24, 2, '#A6815B'); // side table
  rr(ctx, ox + 4, 9, 24, 12, 6, 'rgba(160,205,190,0.55)'); // bottle glass
  f(ctx, ox + 2, 12, 4, 6, '#B5824A');                     // cork
  f(ctx, ox + 11, 16, 9, 3, '#6E4A28');                    // hull
  f(ctx, ox + 15, 8, 1, 8, '#5C3D24');                     // mast
  tri(ctx, ox + 15, 9, ox + 15, 15, ox + 11, 15, '#F7F2E5');
  tri(ctx, ox + 16, 9, ox + 16, 15, ox + 20, 15, '#F7F2E5');
  f(ctx, ox + 8, 11, 10, 1, 'rgba(255,255,255,0.4)');      // glass highlight
}

function drawTiki(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  rr(ctx, ox + 10, 22, 12, 8, 2, '#B5651D'); f(ctx, ox + 10, 22, 12, 2, '#CD7D33'); // pot
  f(ctx, ox + 15, 12, 3, 11, '#7A5230');                   // trunk
  tri(ctx, ox + 16, 12, ox + 4, 8, ox + 6, 13, '#27AE60');
  tri(ctx, ox + 16, 12, ox + 28, 8, ox + 26, 13, '#27AE60');
  tri(ctx, ox + 16, 11, ox + 8, 2, ox + 13, 5, '#2ECC71');
  tri(ctx, ox + 16, 11, ox + 24, 2, ox + 19, 5, '#2ECC71');
  tri(ctx, ox + 16, 11, ox + 14, 1, ox + 18, 4, '#3FE07A');
  f(ctx, ox + 12, 11, 3, 3, '#6E4A28'); f(ctx, ox + 17, 11, 3, 3, '#6E4A28'); // coconuts
}

function drawParrot(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 15, 10, 2, 18, '#8C6A47');                   // pole
  rr(ctx, ox + 10, 26, 12, 3, 2, '#6E4A28');               // base
  f(ctx, ox + 9, 12, 14, 2, '#A6815B');                    // perch bar
  ellipse(ctx, ox + 13, 9, 5, 6, '#E74C3C');               // body
  ellipse(ctx, ox + 14, 9, 3, 5, '#2980B9');               // wing
  circle(ctx, ox + 12, 5, 3, '#E74C3C');                   // head
  tri(ctx, ox + 9, 5, ox + 12, 4, ox + 12, 7, '#F1C40F');  // beak
  f(ctx, ox + 12, 3, 1, 1, '#000');                        // eye
  tri(ctx, ox + 14, 13, ox + 18, 21, ox + 15, 14, '#27AE60'); // tail
}

function drawSign(ctx: CanvasRenderingContext2D, ox: number) {
  planks(ctx, ox);
  f(ctx, ox + 4, 2, 2, 26, '#6E4A28');                     // post
  f(ctx, ox + 4, 4, 16, 2, '#6E4A28');                     // cross arm
  f(ctx, ox + 9, 6, 1, 3, '#888'); f(ctx, ox + 17, 6, 1, 3, '#888'); // chains
  rr(ctx, ox + 7, 9, 18, 14, 2, '#A9743F');                // board
  f(ctx, ox + 7, 9, 18, 2, '#C28E54');                     // top highlight
  f(ctx, ox + 10, 13, 12, 1, '#3D2B1A'); f(ctx, ox + 10, 16, 9, 1, '#3D2B1A'); f(ctx, ox + 10, 19, 11, 1, '#3D2B1A'); // text
  tri(ctx, ox + 22, 16, ox + 25, 18, ox + 22, 20, '#C0392B'); // arrow
}
