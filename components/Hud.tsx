'use client';

export type ParticipantInfo = { identity: string; name: string };
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

type Props = {
  muted: boolean;
  onToggle: () => void;
  localName: string;
  participants: ParticipantInfo[];
  connectionStatus: ConnectionStatus;
};

export default function Hud({ muted, onToggle, localName, participants, connectionStatus }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">

      {/* Participant list — top left */}
      <div className="absolute top-4 left-4 rounded-lg bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 backdrop-blur-sm min-w-[130px]">
        <div className="font-semibold text-zinc-400 mb-1.5">
          {participants.length + 1} in room
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          <span className="truncate">{localName} <span className="text-zinc-500">(you)</span></span>
        </div>
        {participants.map((p) => (
          <div key={p.identity} className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
            <span className="truncate">{p.name}</span>
          </div>
        ))}
      </div>

      {/* Reconnecting banner — top centre */}
      {connectionStatus === 'reconnecting' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-yellow-400/90 px-4 py-1.5 text-sm font-semibold text-black shadow-lg">
          Reconnecting…
        </div>
      )}

      {/* Disconnected overlay */}
      {connectionStatus === 'disconnected' && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-4">
          <p className="text-white text-xl font-semibold">Connection lost</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Reload to rejoin
          </button>
        </div>
      )}

      {/* Mute button — bottom centre */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
        <button
          onClick={onToggle}
          className={`pointer-events-auto rounded-full px-5 py-2 text-sm font-semibold shadow-lg transition-colors ${
            muted
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-zinc-700/90 text-white hover:bg-zinc-600'
          }`}
        >
          {muted ? 'Unmute mic' : 'Mute mic'}
        </button>
      </div>

    </div>
  );
}
