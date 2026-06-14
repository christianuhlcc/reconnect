import { Room } from 'livekit-client';
import type { AvatarMeta } from './realtime';

export function getOrCreateIdentity(): string {
  // sessionStorage is per-tab, so two tabs in the same browser get distinct identities
  let id = sessionStorage.getItem('reconnect-identity');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('reconnect-identity', id);
  }
  return id;
}

export async function connectToRoom(
  roomName: string,
  identity: string,
  meta: AvatarMeta
): Promise<Room> {
  const secret = process.env.NEXT_PUBLIC_ROOM_SECRET;
  const secretParam = secret ? `&s=${encodeURIComponent(secret)}` : '';
  const res = await fetch(`/api/token?room=${encodeURIComponent(roomName)}&identity=${encodeURIComponent(identity)}${secretParam}`);
  if (!res.ok) throw new Error('Failed to fetch token');
  const { token } = await res.json();

  const room = new Room();
  await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL!, token);
  await room.localParticipant.setMetadata(JSON.stringify(meta));

  return room;
}
