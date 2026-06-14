export type Direction = 'up' | 'down' | 'left' | 'right';

export type PosMsg = {
  t: 'pos';
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
};

export type ChatMsg = {
  t: 'chat';
  id: string;
  name: string;
  body: string;
  ts: number;
};

export type AvatarMeta = {
  name: string;
  sprite: string;
  color: string;
};

export type WireMsg = PosMsg | ChatMsg;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeMsg(msg: WireMsg): Uint8Array {
  return enc.encode(JSON.stringify(msg));
}

export function decodeMsg(data: Uint8Array): WireMsg {
  return JSON.parse(dec.decode(data)) as WireMsg;
}
