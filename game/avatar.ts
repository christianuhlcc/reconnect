import Phaser from 'phaser';
import type { Direction, PosMsg } from '@/lib/realtime';

const IDLE_FRAME: Record<Direction, number> = {
  down: 0, up: 2, left: 4, right: 6,
};

const LERP = 0.22; // per-frame lerp factor toward target position

export class RemoteAvatar {
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Arc;

  private targetX: number;
  private targetY: number;
  private facing: Direction = 'down';
  private moving = false;

  constructor(scene: Phaser.Scene, x: number, y: number, displayName: string, color = '#ffffff') {
    this.targetX = x;
    this.targetY = y;

    // Speaking ring — hidden until setSpeaking(true)
    this.ring = scene.add
      .arc(x, y, 22, 0, 360, false, 0x000000, 0)
      .setStrokeStyle(2, 0x44ff88)
      .setDepth(0.9)
      .setVisible(false);

    this.sprite = scene.add.sprite(x, y, 'player', 0).setDepth(1);
    this.sprite.setTint(parseInt(color.replace('#', ''), 16));

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

  applyMeta(name: string, color: string) {
    this.label.setText(name);
    this.sprite.setTint(parseInt(color.replace('#', ''), 16));
  }

  applyPos(msg: PosMsg) {
    this.targetX = msg.x;
    this.targetY = msg.y;
    this.facing = msg.dir;
    this.moving = msg.moving;
  }

  // Call once per Phaser update tick
  tick() {
    const sx = Phaser.Math.Linear(this.sprite.x, this.targetX, LERP);
    const sy = Phaser.Math.Linear(this.sprite.y, this.targetY, LERP);
    this.sprite.setPosition(sx, sy);
    this.label.setPosition(sx, sy - 34);
    this.ring.setPosition(sx, sy);

    if (this.moving) {
      this.sprite.anims.play(`walk-${this.facing}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(IDLE_FRAME[this.facing]);
    }
  }

  destroy() {
    this.ring.destroy();
    this.sprite.destroy();
    this.label.destroy();
  }
}
