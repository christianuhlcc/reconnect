import Phaser from 'phaser';
import type { Direction, PosMsg, EmoteType } from '@/lib/realtime';

const IDLE_FRAME: Record<Direction, number> = {
  down: 0, up: 2, left: 4, right: 6,
};

export const EMOTE_DATA: Record<EmoteType, { text: string; color: string }> = {
  joy:         { text: '( ^_^ )', color: '#FFD700' },
  anger:       { text: '( >:( )', color: '#FF4444' },
  sadness:     { text: '( T_T )', color: '#88AAFF' },
  sleepy:      { text: 'z z Z..',  color: '#BBBBDD' },
  bored:       { text: '( -_- )', color: '#AAAAAA' },
  frustrated:  { text: '(!@#$!)', color: '#FF8800' },
};

const LERP = 0.22;

export class RemoteAvatar {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Arc;
  private emoteText: Phaser.GameObjects.Text | null = null;
  private emoteTimer: Phaser.Time.TimerEvent | null = null;
  private textureKey: string;

  private targetX: number;
  private targetY: number;
  private facing: Direction = 'down';
  private moving = false;

  constructor(scene: Phaser.Scene, x: number, y: number, displayName: string, textureKey: string) {
    this.scene = scene;
    this.textureKey = textureKey;
    this.targetX = x;
    this.targetY = y;

    this.ring = scene.add
      .arc(x, y, 22, 0, 360, false, 0x000000, 0)
      .setStrokeStyle(2, 0x44ff88)
      .setDepth(0.9)
      .setVisible(false);

    this.sprite = scene.add.sprite(x, y, textureKey, 0).setDepth(1);

    this.label = scene.add
      .text(x, y - 34, displayName, {
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(2);
  }

  setSpeaking(active: boolean) {
    this.ring.setVisible(active);
  }

  applyMeta(name: string) {
    this.label.setText(name);
  }

  updateTexture(textureKey: string) {
    this.textureKey = textureKey;
    this.sprite.setTexture(textureKey, 0);
  }

  applyPos(msg: PosMsg) {
    this.targetX = msg.x;
    this.targetY = msg.y;
    this.facing = msg.dir;
    this.moving = msg.moving;
  }

  triggerEmote(emote: EmoteType) {
    if (this.emoteText) {
      this.emoteText.destroy();
      this.emoteText = null;
    }
    if (this.emoteTimer) {
      this.emoteTimer.remove();
      this.emoteTimer = null;
    }

    const { text, color } = EMOTE_DATA[emote];
    this.emoteText = this.scene.add
      .text(this.sprite.x, this.sprite.y - 46, text, {
        fontSize: '9px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(3);

    this.emoteTimer = this.scene.time.delayedCall(3000, () => {
      if (this.emoteText) {
        this.emoteText.destroy();
        this.emoteText = null;
      }
    });
  }

  tick() {
    const sx = Phaser.Math.Linear(this.sprite.x, this.targetX, LERP);
    const sy = Phaser.Math.Linear(this.sprite.y, this.targetY, LERP);
    this.sprite.setPosition(sx, sy);
    this.label.setPosition(sx, sy - 34);
    this.ring.setPosition(sx, sy);
    if (this.emoteText) this.emoteText.setPosition(sx, sy - 46);

    if (this.moving) {
      this.sprite.anims.play(`walk-${this.facing}-${this.textureKey}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(IDLE_FRAME[this.facing]);
    }
  }

  destroy() {
    this.ring.destroy();
    this.sprite.destroy();
    this.label.destroy();
    this.emoteText?.destroy();
    this.emoteTimer?.remove();
  }
}
