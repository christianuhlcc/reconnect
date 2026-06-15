'use client';
import type { AvatarMeta } from '@/lib/realtime';
import AvatarEditor from '@/components/AvatarEditor';
import { saveAvatarMeta } from '@/lib/avatarMeta';

// Re-exported for existing importers (e.g. RoomLoader).
export { loadAvatarMeta, saveAvatarMeta } from '@/lib/avatarMeta';

export default function Onboarding({ onEnter }: { onEnter: (meta: AvatarMeta) => void }) {
  const handleSubmit = (meta: AvatarMeta) => {
    saveAvatarMeta(meta);
    onEnter(meta);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100 py-8 overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight">Join room</h1>

      <AvatarEditor submitLabel="Enter room →" onSubmit={handleSubmit} />

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
