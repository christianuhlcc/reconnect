'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '@/lib/realtime';

const MAX_BODY = 500;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

type Props = {
  messages: ChatMsg[];
  open: boolean;
  unread: number;
  onOpen: () => void;
  onClose: () => void;
  onSend: (body: string) => void;
};

export default function ChatPanel({ messages, open, unread, onOpen, onClose, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages, open]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  };

  if (!open) {
    return (
      <button
        onClick={onOpen}
        className="pointer-events-auto rounded-full bg-zinc-700/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-zinc-600"
      >
        {unread > 0 ? `Chat (${unread})` : 'Chat'}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto flex h-80 w-72 flex-col rounded-xl bg-zinc-900/95 shadow-xl ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-sm font-semibold text-zinc-100">Chat</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-sm space-y-2">
        {messages.length === 0 && (
          <p className="text-zinc-500 text-xs">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <span className="font-semibold text-zinc-300">{m.name}</span>
            <span className="ml-1 text-zinc-500 text-xs">{formatTime(m.ts)}</span>
            <p className="text-zinc-100 break-words">{m.body}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 border-t border-white/10 px-3 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          placeholder="Message…"
          className="flex-1 rounded bg-zinc-800 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
