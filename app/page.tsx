'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [roomName, setRoomName] = useState('');
  const router = useRouter();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const slug =
      roomName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') || crypto.randomUUID().slice(0, 8);
    router.push(`/r/${encodeURIComponent(slug)}`);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-950 text-zinc-100">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-tight">reconnect</h1>
        <p className="text-zinc-400">A virtual office for remote teams.</p>
      </div>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Room name (e.g. team-alpha)"
          className="rounded-lg bg-zinc-800 px-4 py-2 text-white w-60 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-500"
        >
          Create room →
        </button>
      </form>
    </div>
  );
}
