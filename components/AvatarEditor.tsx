'use client';
import { useState } from 'react';
import type { AvatarMeta } from '@/lib/realtime';
import {
  SHIRT_COLORS,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  BEARD_OPTIONS,
  DEFAULT_META,
} from '@/lib/avatarMeta';

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

type Props = {
  /** Existing look to edit; when omitted the form starts from defaults. */
  initial?: AvatarMeta | null;
  submitLabel: string;
  onSubmit: (meta: AvatarMeta) => void;
  /** When provided, renders a Cancel button (e.g. for the in-room redesign modal). */
  onCancel?: () => void;
};

/**
 * Self-contained avatar customisation form. Used both for first-time
 * onboarding and for re-designing your character from inside the room.
 */
export default function AvatarEditor({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName]           = useState(initial?.name ?? '');
  const [skinTone, setSkinTone]   = useState(initial?.skinTone ?? DEFAULT_META.skinTone);
  const [hairStyle, setHairStyle] = useState<typeof HAIR_STYLES[number]>(
    (initial?.hairStyle as typeof HAIR_STYLES[number]) ?? DEFAULT_META.hairStyle as typeof HAIR_STYLES[number]
  );
  const [hairColor, setHairColor] = useState(initial?.hairColor ?? DEFAULT_META.hairColor);
  const [beard, setBeard]         = useState<typeof BEARD_OPTIONS[number]>(
    (initial?.beard as typeof BEARD_OPTIONS[number]) ?? DEFAULT_META.beard as typeof BEARD_OPTIONS[number]
  );
  const [color, setColor]         = useState(initial?.color ?? DEFAULT_META.color);

  // Restart customisation: wipe every choice back to the defaults so the user
  // can rebuild their character from scratch. The name is kept.
  const handleReset = () => {
    setSkinTone(DEFAULT_META.skinTone);
    setHairStyle(DEFAULT_META.hairStyle as typeof HAIR_STYLES[number]);
    setHairColor(DEFAULT_META.hairColor);
    setBeard(DEFAULT_META.beard as typeof BEARD_OPTIONS[number]);
    setColor(DEFAULT_META.color);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      sprite: 'player',
      color,
      skinTone,
      hairStyle,
      hairColor,
      beard,
    });
  };

  return (
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
        type="button"
        onClick={handleReset}
        className="self-start text-xs font-medium text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
      >
        ↺ Start over
      </button>

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-zinc-700 px-6 py-2 font-medium text-white transition-colors hover:bg-zinc-600"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex-1 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
