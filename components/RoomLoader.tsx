'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Onboarding, { loadAvatarMeta } from '@/components/Onboarding';
import type { AvatarMeta } from '@/lib/realtime';

const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

export default function RoomLoader({ room }: { room: string }) {
  const [meta, setMeta] = useState<AvatarMeta | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadAvatarMeta();
    if (saved) setMeta(saved);
    setReady(true);
  }, []);

  // Avoid hydration mismatch — localStorage is not available on the server
  if (!ready) return null;

  if (!meta) {
    return <Onboarding onEnter={(m) => setMeta(m)} />;
  }

  return <GameCanvas room={room} meta={meta} />;
}
