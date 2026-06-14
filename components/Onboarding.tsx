'use client';
import { useState } from 'react';
import type { AvatarMeta } from '@/lib/realtime';

const SHIRT_COLORS = ['#4488FF', '#FF4444', '#44CC44', '#FF8800', '#AA44FF', '#FF44AA'];
const SKIN_TONES   = ['#FFDBB4', '#F5C09A', '#D4956B', '#9C6642', '#5C3317'];
const HAIR_STYLES  = ['short', 'long', 'curly', 'bun', 'mohawk', 'bald'] as const;
const HAIR_COLORS  = ['#1A1A1A', '#5C3317', '#8B4513', '#DAA520', '#B22222', '#AAAAAA', '#FF69B4', '#6495ED'];
const BEARD_OPTIONS = ['none', 'stubble', 'full'] as const;
const STORAGE_KEY = 'reconnect-avatar-meta';

const DEFAULT_META: Omit<AvatarMeta, 'name'> = {
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

type SwatchProps = {
  bg: string;
  selected: boolean;
  onClick: () => void;
};

function Swatch({ bg, selected, onClick }: SwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
      style={{ backgroundColor: bg, borderColor: selected ? '#ffffff' : 'transparent' }}
    />
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
};

function Chip({ label, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
        selected
          ? 'bg-zinc-200 text-zinc-900'
          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
      }`}
    >
      {label}
    </button>
  );
}

export default function Onboarding({ onEnter }: { onEnter: (meta: AvatarMeta) => void }) {
  const [name, setName]           = useState('');
  const [skinTone, setSkinTone]   = useState(SKIN_TONES[0]);
  const [hairStyle, setHairStyle] = useState<typeof HAIR_STYLES[number]>('short');
  const [hairColor, setHairColor] = useState(HAIR_COLORS[0]);
  const [beard, setBeard]         = useState<typeof BEARD_OPTIONS[number]>('none');
  const [color, setColor]         = useState(SHIRT_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const meta: AvatarMeta = {
      name: trimmed,
      sprite: 'player',
      color,
      skinTone,
      hairStyle,
      hairColor,
      beard,
    };
    saveAvatarMeta(meta);
    onEnter(meta);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100 py-8 overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight">Join room</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80">

        <div className="flex flex-col gap-1">
          <label className="text-sm text-zinc-400">Display name</label>
          <input
            autoFocus
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-zinc-400">Skin tone</label>
          <div className="flex gap-2">
            {SKIN_TONES.map((c) => (
              <Swatch key={c} bg={c} selected={skinTone === c} onClick={() => setSkinTone(c)} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-zinc-400">Hair style</label>
          <div className="flex flex-wrap gap-2">
            {HAIR_STYLES.map((s) => (
              <Chip key={s} label={s} selected={hairStyle === s} onClick={() => setHairStyle(s)} />
            ))}
          </div>
        </div>

        {hairStyle !== 'bald' && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-zinc-400">Hair colour</label>
            <div className="flex gap-2 flex-wrap">
              {HAIR_COLORS.map((c) => (
                <Swatch key={c} bg={c} selected={hairColor === c} onClick={() => setHairColor(c)} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm text-zinc-400">Beard</label>
          <div className="flex gap-2">
            {BEARD_OPTIONS.map((b) => (
              <Chip key={b} label={b} selected={beard === b} onClick={() => setBeard(b)} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-zinc-400">Shirt colour</label>
          <div className="flex gap-2">
            {SHIRT_COLORS.map((c) => (
              <Swatch key={c} bg={c} selected={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          Enter room →
        </button>
      </form>

      <p className="mt-2 text-xs text-zinc-500 max-w-xs text-center">
        Audio is transmitted in real time and is not recorded.
        Your display name is visible only to others in this room
        and is discarded when you disconnect.
      </p>
      <p className="text-xs text-zinc-600 max-w-xs text-center">
        In-room: press <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">1</kbd>–<kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">6</kbd> to express yourself
        (joy · anger · sadness · sleepy · bored · frustrated)
      </p>
    </div>
  );
}
