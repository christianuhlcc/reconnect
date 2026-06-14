import { AccessToken } from 'livekit-server-sdk';

// In-memory rate limiter — protects against token-farming abuse.
// This works per warm serverless instance. For multi-instance prod
// upgrade to Upstash Redis + @upstash/ratelimit.
const ipHits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function isAllowed(ip: string): boolean {
  const now = Date.now();
  const prev = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_PER_WINDOW) return false;
  ipHits.set(ip, [...prev, now]);
  return true;
}

export async function GET(req: Request) {
  // Rate limit by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!isAllowed(ip)) {
    return Response.json({ error: 'too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const room = searchParams.get('room');
  const identity = searchParams.get('identity');

  if (!room || !identity) {
    return Response.json({ error: 'room and identity are required' }, { status: 400 });
  }

  // Optional room secret — set LIVEKIT_ROOM_SECRET in prod to make links non-guessable.
  // Share the full link including ?s=<secret> with your team.
  const roomSecret = process.env.LIVEKIT_ROOM_SECRET;
  if (roomSecret) {
    const provided = searchParams.get('s');
    if (provided !== roomSecret) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity }
  );
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
  });

  return Response.json({ token: await at.toJwt() });
}
