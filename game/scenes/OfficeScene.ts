import Phaser from 'phaser';
import type { Room } from 'livekit-client';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { RemoteAvatar } from '@/game/avatar';
import { encodeMsg, decodeMsg } from '@/lib/realtime';
import type { Direction, PosMsg, AvatarMeta } from '@/lib/realtime';
import { updateGain } from '@/lib/audio';

const TILE = 32;
const PLAYER_W = 32;
const PLAYER_H = 48;
const SPEED = 160;
const SPAWN_X = 384;
const SPAWN_Y = 224;
const MAP_COLS = 25;
const MAP_ROWS = 20;
const POS_INTERVAL = 100; // ms between position broadcasts (~10 Hz)

// Tile GIDs: 1=floor  2=wall  3=desk  4=desk+monitor  5=bookcase  6=couch  7=plant  8=cooler
const OFFICE_MAP: number[][] = [
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  [2,5,5,5,5,5,5,1,1,1,1,1,1,1,1,1,1,1,5,5,5,5,5,7,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,4,3,1,4,3,1,1,1,1,1,1,1,1,1,1,1,4,3,1,4,3,1,1,2],
  [2,3,3,1,3,3,1,1,1,1,1,1,1,1,1,1,1,3,3,1,3,3,1,7,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,7,1,4,3,1,1,1,1,1,1,1,1,1,1,1,1,4,3,1,1,1,7,1,2],
  [2,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,8,1,1,1,8,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,1,1,1,1,7,1,6,6,6,1,1,1,1,1,6,6,6,1,7,1,1,1,1,2],
  [2,1,1,1,1,1,1,6,6,6,1,1,1,1,1,6,6,6,1,1,1,1,1,1,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,4,3,1,4,3,1,1,1,1,1,1,1,1,1,1,1,4,3,1,4,3,1,1,2],
  [2,3,3,1,3,3,1,1,1,1,1,1,1,1,1,1,1,3,3,1,3,3,1,7,2],
  [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
  [2,7,1,4,3,1,1,1,1,1,1,1,1,1,1,1,1,4,3,1,1,1,7,1,2],
  [2,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];

const IDLE_FRAME: Record<Direction, number> = {
  down: 0, up: 2, left: 4, right: 6,
};

type WASDKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WASDKeys;
  private facing: Direction = 'down';

  private lkRoom: Room | null = null;
  private localColor = '#ffffff';
  private remoteAvatars = new Map<string, RemoteAvatar>();

  private lastPosSend = 0;
  private wasMoving = false;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  init(data: { room: string; lkRoom: Room | null; meta?: AvatarMeta }) {
    this.lkRoom = data.lkRoom ?? null;
    if (data.meta?.color) this.localColor = data.meta.color;
  }

  create() {
    this.buildTilesetTexture();
    this.buildPlayerTexture();

    const map = this.make.tilemap({ data: OFFICE_MAP, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('office-tiles', 'tiles', TILE, TILE, 0, 0, 1)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollisionByExclusion([-1, 1]);

    this.player = this.physics.add.sprite(SPAWN_X, SPAWN_Y, 'player', 0);
    this.player.setDepth(1);
    this.player.setTint(parseInt(this.localColor.replace('#', ''), 16));
    this.physics.add.collider(this.player, layer);

    const mapW = MAP_COLS * TILE;
    const mapH = MAP_ROWS * TILE;
    this.physics.world.setBounds(0, 0, mapW, mapH);
    this.player.setCollideWorldBounds(true);

    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as WASDKeys;
    // Stop Phaser calling preventDefault() on key events so HTML inputs receive them
    this.input.keyboard!.disableGlobalCapture();

    this.createAnimations();
    this.setupLiveKitListeners();
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // Don't drive the player while a text input has focus (e.g. chat panel)
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
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(IDLE_FRAME[this.facing]);
    }

    // Broadcast position
    if (this.lkRoom) {
      const now = this.time.now;
      if (moving && now - this.lastPosSend >= POS_INTERVAL) {
        this.broadcastPos(true);
        this.lastPosSend = now;
      } else if (!moving && this.wasMoving) {
        // Stopped — send one final update so remotes see us idle
        this.broadcastPos(false);
      }
    }
    this.wasMoving = moving;

    // Tick remote avatars for smooth interpolation
    this.remoteAvatars.forEach(avatar => avatar.tick());
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
    // fire-and-forget; loss is acceptable for position
    this.lkRoom.localParticipant.publishData(encodeMsg(msg), {
      reliable: false,
      topic: 'pos',
    }).catch(() => {});
  }

  private handleRemotePosMsg(identity: string, msg: PosMsg) {
    let avatar = this.remoteAvatars.get(identity);
    if (!avatar) {
      const participant = this.lkRoom?.remoteParticipants.get(identity);
      let name = identity.slice(0, 6);
      let color = '#ffffff';
      if (participant?.metadata) {
        try {
          const meta = JSON.parse(participant.metadata) as AvatarMeta;
          name = meta.name || name;
          color = meta.color || color;
        } catch { /* ignore */ }
      }
      avatar = new RemoteAvatar(this, msg.x, msg.y, name, color);
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
          if (msg.t === 'pos') this.handleRemotePosMsg(participant.identity, msg);
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
          if (meta.name && meta.color) avatar.applyMeta(meta.name, meta.color);
        } catch { /* ignore */ }
      }
    );
  }

  // ── texture generation ──────────────────────────────────────────────────────

  private buildTilesetTexture() {
    const T = TILE;
    const tex = this.textures.createCanvas('tiles', T * 8, T)!;
    const ctx = tex.getContext()!;

    const f = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    };

    // Reusable: draw wood planks starting at x-offset ox
    const planks = (ox: number) => {
      const pc = ['#C49A5A','#BA8F52','#C8A060','#BC9255'];
      for (let p = 0; p < 4; p++) {
        f(ox, p*8, T, 7, pc[p]);
        f(ox+3+p*4, p*8, 1, 7, 'rgba(255,215,140,0.18)');
        f(ox+18+p*2, p*8, 1, 7, 'rgba(255,215,140,0.12)');
        f(ox, p*8+7, T, 1, '#7A5228');
      }
    };

    // ── Tile 0: Floor ────────────────────────────────────────────────────────
    planks(0);

    // ── Tile 1: Wall — dark brick ────────────────────────────────────────────
    const w1 = T;
    f(w1,0,T,T,'#22213F'); f(w1,0,T,5,'#48467A'); f(w1,0,3,T,'#35336A');
    for (let r=0;r<4;r++){
      const y=6+r*7;
      f(w1+3,y,T-3,1,'#504E82');
      f(r%2===0?w1+18:w1+10, y-6, 1, 6, '#403E72');
    }
    f(w1+T-2,0,2,T,'rgba(0,0,0,0.30)'); f(w1,T-2,T,2,'rgba(0,0,0,0.30)');

    // ── Tile 2: Plain desk ───────────────────────────────────────────────────
    const d2 = T*2;
    f(d2,0,T,T,'#9A7044'); f(d2,0,T,4,'#5C3A20'); f(d2,4,T,4,'#B08050');
    // papers
    f(d2+3,10,11,14,'#FFFFF0'); f(d2+4,12,8,1,'#C8C8B0');
    f(d2+4,14,6,1,'#C8C8B0'); f(d2+4,16,9,1,'#C8C8B0'); f(d2+4,18,7,1,'#C8C8B0');
    // keyboard
    f(d2+16,16,12,9,'#4A4A4A'); f(d2+17,17,10,7,'#3A3A3A');
    for(let kr=0;kr<3;kr++) f(d2+18,18+kr*2,8,1,'#555');
    // coffee mug (the most important office item)
    f(d2+4,23,7,6,'#FFFFFF'); f(d2+5,24,5,4,'#5C1414');
    f(d2+11,25,3,3,'#FFFFFF'); f(d2+3,23,1,6,'rgba(0,0,0,0.15)');
    // steam wisps
    f(d2+6,21,1,2,'rgba(200,200,200,0.5)'); f(d2+8,20,1,3,'rgba(200,200,200,0.4)');

    // ── Tile 3: Desk + monitor ───────────────────────────────────────────────
    const d3 = T*3;
    f(d3,0,T,T,'#9A7044'); f(d3,0,T,4,'#5C3A20'); f(d3,4,T,4,'#B08050');
    // monitor bezel
    f(d3+5,4,22,16,'#181828');
    // screen — code editor aesthetic
    f(d3+6,5,20,14,'#1E2A6E');
    const lines: [number,string][] = [[7,'#7EC8E3'],[9,'#88D498'],[11,'#F0A500'],[13,'#E86060'],[15,'#A29BFE'],[17,'#7EC8E3']];
    lines.forEach(([ly,c],i) => f(d3+7,ly,5+(i%3)*4,1,c));
    f(d3+6,5,7,4,'rgba(255,255,255,0.07)'); // glare
    // stand
    f(d3+14,20,4,5,'#2A2A2A'); f(d3+11,23,10,2,'#333');
    // keyboard
    f(d3+6,26,20,5,'#4A4A4A'); f(d3+7,27,18,3,'#3A3A3A');
    for(let kr=0;kr<2;kr++) f(d3+8,27+kr,16,1,'#555');

    // ── Tile 4: Bookcase ─────────────────────────────────────────────────────
    const d4 = T*4;
    f(d4,0,T,T,'#3D2B1A'); f(d4,0,T,2,'#7A5A30');
    f(d4,0,2,T,'#5C3D24'); f(d4+T-2,0,2,T,'#1E140A');
    [10,21].forEach(sy => f(d4,sy,T,2,'#7A5A30'));
    const booksRow = (row: [number,number,string][], y: number) =>
      row.forEach(([x,w,c]) => {
        f(d4+x,y,w-1,8,c); f(d4+x,y,1,8,'rgba(255,255,255,0.2)');
      });
    booksRow([[2,3,'#C0392B'],[5,4,'#E67E22'],[9,3,'#27AE60'],[12,5,'#2980B9'],
              [17,3,'#8E44AD'],[20,4,'#E74C3C'],[24,4,'#F1C40F'],[28,2,'#16A085']], 2);
    booksRow([[2,4,'#9B59B6'],[6,3,'#1ABC9C'],[9,5,'#E74C3C'],[14,3,'#F39C12'],
              [17,4,'#2ECC71'],[21,3,'#3498DB'],[24,5,'#E67E22'],[29,1,'#BDC3C7']], 12);
    booksRow([[2,5,'#C0392B'],[7,3,'#27AE60'],[10,4,'#8E44AD'],[14,3,'#F1C40F'],
              [17,5,'#2980B9'],[22,3,'#E74C3C'],[25,4,'#1ABC9C']], 23);

    // ── Tile 5: Couch (top-down) ──────────────────────────────────────────────
    const d5 = T*5;
    f(d5,0,T,T,'#8B2220');                        // dark base
    f(d5+3,7,T-6,T-9,'#C0392B');                  // seat cushions
    f(d5+1,0,T-2,7,'#E74C3C');                    // back rest
    f(d5,0,3,T,'#7B241C'); f(d5+T-3,0,3,T,'#7B241C'); // armrests
    f(d5+T/2-1,8,2,T-10,'#A93226');               // cushion seam
    f(d5+4,9,9,T-12,'#CD6155'); f(d5+T/2+2,9,9,T-12,'#CD6155'); // cushion highlights
    f(d5+3,1,T-6,3,'#EC7063'); f(d5+3,4,T-6,1,'#B03A2E'); // backrest texture
    f(d5+1,T-3,2,2,'#5D1A16'); f(d5+T-3,T-3,2,2,'#5D1A16'); // leg pegs

    // ── Tile 6: Plant (on floor) ──────────────────────────────────────────────
    const d6 = T*6;
    planks(d6);
    // leaves — tropical, lush, Monkey Island energy
    f(d6+7,5,7,15,'#1A6B3C'); f(d6+18,8,7,11,'#145A32');
    f(d6+12,2,8,17,'#1E8449');
    f(d6+8,7,3,6,'#27AE60'); f(d6+19,10,4,5,'#1ABC9C'); f(d6+13,3,4,7,'#27AE60');
    // veins
    f(d6+10,8,1,11,'#145A32'); f(d6+22,12,1,6,'#0E6655'); f(d6+16,16,1,4,'#196F3D');
    // stem
    f(d6+15,18,2,4,'#196F3D');
    // pot
    f(d6+10,21,12,3,'#DEB887'); f(d6+11,23,10,7,'#CD853F');
    f(d6+12,25,8,5,'#3D1A00');

    // ── Tile 7: Water cooler (on floor) ───────────────────────────────────────
    const d7 = T*7;
    planks(d7);
    // body
    f(d7+10,2,12,22,'#2980B9');
    // water bottle
    f(d7+11,3,10,10,'#3498DB'); f(d7+12,4,8,8,'#85C1E9'); f(d7+13,5,6,6,'#AED6F1');
    // label
    f(d7+12,7,8,2,'#FFFFFF');
    // nozzle
    f(d7+14,13,4,5,'#1A5276'); f(d7+15,14,2,3,'#85C1E9');
    // drip tray
    f(d7+9,18,14,2,'#AEB6BF');
    // button panel
    f(d7+10,20,12,4,'#2471A3');
    f(d7+11,21,3,2,'#E74C3C'); // hot
    f(d7+18,21,3,2,'#3498DB'); // cold
    // cabinet
    f(d7+10,24,12,5,'#1F618D'); f(d7+11,25,10,3,'#1A5276');
    // feet
    f(d7+10,29,3,2,'#154360'); f(d7+19,29,3,2,'#154360');

    tex.refresh();
  }

  private buildPlayerTexture() {
    const W = PLAYER_W, H = PLAYER_H;
    const tex = this.textures.createCanvas('player', W * 8, H)!;
    const ctx = tex.getContext()!;

    const dirs: Direction[] = ['down', 'up', 'left', 'right'];

    dirs.forEach((dir, di) => {
      for (let frame = 0; frame < 2; frame++) {
        const bx = (di * 2 + frame) * W;

        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(bx + W / 2, H - 2, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const legA = frame === 0 ? 3 : 0;
        const legB = frame === 0 ? 0 : 3;
        ctx.fillStyle = '#2255CC';
        ctx.fillRect(bx + 8,  H - 15 + legA, 6, 13);
        ctx.fillStyle = '#1a44aa';
        ctx.fillRect(bx + 18, H - 15 + legB, 6, 13);

        ctx.fillStyle = '#5588FF';
        ctx.fillRect(bx + 6, H - 35, 20, 22);
        ctx.fillStyle = '#4477EE';
        ctx.fillRect(bx + 6, H - 35, 4, 22);

        ctx.fillStyle = '#FFCC88';
        ctx.beginPath();
        ctx.arc(bx + W / 2, H - 42, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#333333';
        if (dir === 'down') {
          ctx.fillRect(bx + 9,  H - 41, 3, 3);
          ctx.fillRect(bx + 20, H - 41, 3, 3);
        } else if (dir === 'up') {
          ctx.fillRect(bx + 9,  H - 46, 3, 3);
          ctx.fillRect(bx + 20, H - 46, 3, 3);
        } else if (dir === 'left') {
          ctx.fillRect(bx + 7, H - 44, 3, 3);
          ctx.fillRect(bx + 7, H - 39, 3, 3);
        } else {
          ctx.fillRect(bx + 22, H - 44, 3, 3);
          ctx.fillRect(bx + 22, H - 39, 3, 3);
        }
      }
    });

    tex.refresh();

    const pTex = this.textures.get('player');
    for (let i = 0; i < 8; i++) {
      pTex.add(i, 0, i * W, 0, W, H);
    }
  }

  private createAnimations() {
    const defs: [string, number, number][] = [
      ['walk-down',  0, 1],
      ['walk-up',    2, 3],
      ['walk-left',  4, 5],
      ['walk-right', 6, 7],
    ];
    defs.forEach(([key, f0, f1]) => {
      this.anims.create({
        key,
        frames: [
          { key: 'player', frame: f0 },
          { key: 'player', frame: f1 },
        ],
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
