'use client';
import { useState } from 'react';
import type { AvatarMeta } from '@/lib/realtime';

const COLORS = ['#4488FF', '#FF4444', '#44CC44', '#FF8800', '#AA44FF', '#FF44AA'];
const STORAGE_KEY = 'reconnect-avatar-meta';

export function loadAvatarMeta(): AvatarMeta | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw) as AvatarMeta;
    if (meta.name && meta.sprite && meta.color) return meta;
  } catch {}
  return null;
}

export function saveAvatarMeta(meta: AvatarMeta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export default function Onboarding({ onEnter }: { onEnter: (meta: AvatarMeta) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const meta: AvatarMeta = { name: trimmed, sprite: 'player', color };
    saveAvatarMeta(meta);
    onEnter(meta);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100">
      <h1 className="text-2xl font-bold tracking-tight">Join room</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-72">
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
        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">Avatar colour</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? '#fff' : 'transparent',
                }}
              />
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
      <p className="mt-6 text-xs text-zinc-500 max-w-xs text-center">
        Audio is transmitted in real time and is not recorded.
        Your display name is visible only to others in this room
        and is discarded when you disconnect.
      </p>
    </div>
  );
}
