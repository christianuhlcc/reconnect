import type { AvatarMeta } from '@/lib/realtime';

export const SHIRT_COLORS = ['#4488FF', '#FF4444', '#44CC44', '#FF8800', '#AA44FF', '#FF44AA'];
export const SKIN_TONES   = ['#FFDBB4', '#F5C09A', '#D4956B', '#9C6642', '#5C3317'];
export const HAIR_STYLES  = ['short', 'long', 'curly', 'bun', 'mohawk', 'bald'] as const;
export const HAIR_COLORS  = ['#1A1A1A', '#5C3317', '#8B4513', '#DAA520', '#B22222', '#AAAAAA', '#FF69B4', '#6495ED'];
export const BEARD_OPTIONS = ['none', 'stubble', 'full'] as const;

const STORAGE_KEY = 'reconnect-avatar-meta';

export const DEFAULT_META: Omit<AvatarMeta, 'name'> = {
  sprite: 'player',
  color: SHIRT_COLORS[0],
  skinTone: SKIN_TONES[0],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[0],
  beard: 'none',
};

export function loadAvatarMeta(): AvatarMeta | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<AvatarMeta>;
    if (!saved.name) return null;
    // Back-fill defaults for saves that pre-date customisation fields
    return { ...DEFAULT_META, ...saved, name: saved.name } as AvatarMeta;
  } catch {}
  return null;
}

export function saveAvatarMeta(meta: AvatarMeta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}
