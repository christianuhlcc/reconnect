export type Direction = 'up' | 'down' | 'left' | 'right';

export type AvatarMeta = {
  name: string;
  sprite: string;
  color: string;       // shirt colour
  skinTone: string;    // hex, e.g. '#FFCC88'
  hairStyle: string;   // 'short'|'long'|'curly'|'bun'|'mohawk'|'bald'
  hairColor: string;   // hex
  beard: string;       // 'none'|'stubble'|'full'
};

export type EmoteType = 'joy' | 'anger' | 'sadness' | 'sleepy' | 'bored' | 'frustrated';

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

export type EmoteMsg = {
  t: 'emote';
  emote: EmoteType;
};

export type WireMsg = PosMsg | ChatMsg | EmoteMsg;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeMsg(msg: WireMsg): Uint8Array {
  return enc.encode(JSON.stringify(msg));
}

export function decodeMsg(data: Uint8Array): WireMsg {
  return JSON.parse(dec.decode(data)) as WireMsg;
}
