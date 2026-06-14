'use client';
import { useEffect, useRef, useState } from 'react';
import type PhaserType from 'phaser';
import type { Room } from 'livekit-client';
import Hud from '@/components/Hud';
import type { ParticipantInfo, ConnectionStatus } from '@/components/Hud';
import ChatPanel from '@/components/ChatPanel';
import { encodeMsg, decodeMsg } from '@/lib/realtime';
import type { AvatarMeta, ChatMsg } from '@/lib/realtime';

export default function GameCanvas({ room: roomSlug, meta }: { room: string; meta: AvatarMeta }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lkRoomRef = useRef<Room | null>(null);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    let mounted = true;
    let game: PhaserType.Game | null = null;

    if (!containerRef.current) return;

    document.body.style.overflow = 'hidden';

    // Unlock AudioContext on first interaction anywhere on the page
    const unlockAudio = () => {
      import('@/lib/audio').then(({ resumeContext }) => resumeContext());
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    (async () => {
      const [
        { default: Phaser },
        { OfficeScene },
        { getOrCreateIdentity, connectToRoom },
        { addPeer, removePeer },
        { RoomEvent, Track },
      ] = await Promise.all([
        import('phaser'),
        import('@/game/scenes/OfficeScene'),
        import('@/lib/livekit'),
        import('@/lib/audio'),
        import('livekit-client'),
      ]);

      if (!mounted || !containerRef.current) return;

      // Connect to LiveKit
      const identity = getOrCreateIdentity();
      const lkRoom = await connectToRoom(roomSlug, identity, meta);
      lkRoomRef.current = lkRoom;

      if (!mounted) {
        lkRoom.disconnect();
        return;
      }

      // Register listeners BEFORE enabling mic — renegotiation from setMicrophoneEnabled
      // fires TrackSubscribed immediately; listeners must already be in place.
      lkRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        if (track.mediaStreamTrack) addPeer(participant.identity, track.mediaStreamTrack);
      });

      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        removePeer(participant.identity);
      });

      // Handle audio tracks from participants already in the room
      const syncExistingAudio = () => {
        lkRoom.remoteParticipants.forEach((participant) => {
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack) {
              addPeer(participant.identity, pub.track.mediaStreamTrack);
            }
          });
        });
      };
      syncExistingAudio();

      // ── Participant list ────────────────────────────────────────────────────
      const parseName = (metadata?: string, fallback = '??') => {
        if (!metadata) return fallback;
        try { return (JSON.parse(metadata) as { name?: string }).name || fallback; }
        catch { return fallback; }
      };

      const refreshParticipants = () => {
        const list: ParticipantInfo[] = [];
        lkRoom.remoteParticipants.forEach((p) =>
          list.push({ identity: p.identity, name: parseName(p.metadata, p.identity.slice(0, 6)) })
        );
        setParticipants(list);
      };
      refreshParticipants();

      lkRoom.on(RoomEvent.ParticipantConnected, (p: { identity: string; metadata?: string }) => {
        setParticipants((prev) => [
          ...prev,
          { identity: p.identity, name: parseName(p.metadata, p.identity.slice(0, 6)) },
        ]);
      });

      lkRoom.on(RoomEvent.ParticipantDisconnected, (p: { identity: string }) => {
        setParticipants((prev) => prev.filter((x) => x.identity !== p.identity));
      });

      lkRoom.on(
        RoomEvent.ParticipantMetadataChanged,
        (_prev: unknown, p: { identity: string; metadata?: string }) => {
          setParticipants((prev) =>
            prev.map((x) =>
              x.identity === p.identity ? { ...x, name: parseName(p.metadata, x.name) } : x
            )
          );
        }
      );

      // ── Connection state ────────────────────────────────────────────────────
      lkRoom.on(RoomEvent.Reconnecting, () => setConnectionStatus('reconnecting'));

      lkRoom.on(RoomEvent.Reconnected, () => {
        setConnectionStatus('connected');
        syncExistingAudio();
        refreshParticipants();
      });

      lkRoom.on(RoomEvent.Disconnected, () => {
        if (!mounted) return; // intentional disconnect on unmount — ignore
        setConnectionStatus('disconnected');
      });

      // Chat: receive messages from the reliable data channel
      lkRoom.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = decodeMsg(payload);
          if (msg.t !== 'chat') return;
          setMessages((prev) => [...prev, msg]);
          if (!chatOpenRef.current) setUnread((u) => u + 1);
        } catch { /* ignore malformed */ }
      });

      // Create Phaser game and pass the connected Room into the scene FIRST,
      // then enable mic as fire-and-forget. This ensures the scene always
      // receives a connected room — mic negotiation failures are handled by
      // livekit's auto-reconnect and don't block position broadcasting.
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        backgroundColor: '#1a1a2e',
        pixelArt: true,
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [],
      });

      game.events.once('ready', () => {
        if (!mounted) return;
        game!.scene.add('OfficeScene', OfficeScene, true, { room: roomSlug, lkRoom, meta });
        // Fire-and-forget after scene is running so it doesn't race with scene init
        lkRoom.localParticipant.setMicrophoneEnabled(true).catch((e) => {
          console.warn('Mic unavailable:', e);
        });
      });
    })();

    return () => {
      mounted = false;
      document.body.style.overflow = '';
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      lkRoomRef.current?.disconnect();
      lkRoomRef.current = null;
      game?.destroy(true);
    };
  }, [roomSlug]);

  const openChat = () => {
    chatOpenRef.current = true;
    setChatOpen(true);
    setUnread(0);
  };

  const closeChat = () => {
    chatOpenRef.current = false;
    setChatOpen(false);
  };

  const sendChat = (body: string) => {
    const room = lkRoomRef.current;
    if (!room) return;
    const msg: ChatMsg = {
      t: 'chat',
      id: crypto.randomUUID(),
      name: meta.name,
      body: body.slice(0, 500),
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    room.localParticipant.publishData(encodeMsg(msg), { reliable: true, topic: 'chat' }).catch(() => {});
  };

  const handleToggleMute = async () => {
    const room = lkRoomRef.current;
    if (!room) return;
    const next = !muted;

    // Find the mic track and mute/unmute it without unpublishing.
    // setMicrophoneEnabled(false) would unpublish the track, forcing a
    // re-publish on unmute which requires re-negotiating the publisher PC.
    let micTrack: { mute(): Promise<unknown>; unmute(): Promise<unknown> } | undefined;
    room.localParticipant.audioTrackPublications.forEach((pub) => {
      if (pub.source === 'microphone' && pub.track) {
        micTrack = pub.track as { mute(): Promise<unknown>; unmute(): Promise<unknown> };
      }
    });

    if (!micTrack) {
      console.warn('Mic track not published yet');
      return;
    }

    try {
      if (next) {
        await micTrack.mute();
      } else {
        await micTrack.unmute();
      }
      setMuted(next);
    } catch (e) {
      console.warn('Mute toggle failed:', e);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      <Hud
        muted={muted}
        onToggle={handleToggleMute}
        localName={meta.name}
        participants={participants}
        connectionStatus={connectionStatus}
      />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-5">
        <ChatPanel
          messages={messages}
          open={chatOpen}
          unread={unread}
          onOpen={openChat}
          onClose={closeChat}
          onSend={sendChat}
        />
      </div>
    </div>
  );
}
