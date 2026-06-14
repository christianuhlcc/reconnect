# reconnect

A proximity-audio virtual office for remote teams. Open a link, pick an avatar, walk over to a colleague and talk. Audio fades with distance. No account required.

Built with Next.js 16 · Phaser · LiveKit · Web Audio API.

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` at the project root:

```env
# LiveKit Cloud (free Build tier — create a project at https://cloud.livekit.io)
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, pick a name and colour, move with WASD or arrow keys.

To test multiplayer locally: open a second tab in the same browser — each tab gets a distinct identity via `sessionStorage`.

---

## Deploying the app to Vercel

```bash
npx vercel
```

Set these in the Vercel dashboard under **Settings → Environment Variables**:

| Variable | Scope | Purpose |
|---|---|---|
| `LIVEKIT_URL` | Server | Token route (server SDK) |
| `LIVEKIT_API_KEY` | Server | Token signing |
| `LIVEKIT_API_SECRET` | Server | Token signing |
| `NEXT_PUBLIC_LIVEKIT_URL` | Client | WebSocket connection URL |
| `LIVEKIT_ROOM_SECRET` | Server | Optional room guard (see below) |
| `NEXT_PUBLIC_ROOM_SECRET` | Client | Appended to token requests |

For development point these at **LiveKit Cloud**. For production point them at your **self-hosted instance**.

---

## Self-hosting LiveKit on AWS Frankfurt

LiveKit Cloud's free tier covers development (~5 000 participant-minutes/month). One team of six meeting 8 h/day hits ~60 000 participant-minutes — well beyond the free tier. Cloud EU data-residency only starts at the $500/mo Scale plan. The answer is to self-host.

**What you get:** flat EC2 cost, all audio stays in `eu-central-1`, full GDPR residency.

### Server sizing

| Team size | Instance |
|---|---|
| ≤ 10 people | `t3.small` (2 vCPU, 2 GB) |
| 10–30 people | `t3.medium` (2 vCPU, 4 GB) |

### Security group — open these ports

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (Caddy → HTTPS redirect) |
| 443 | TCP | HTTPS / WSS |
| 7881 | TCP | LiveKit RTC TCP fallback |
| 50000–60000 | UDP | LiveKit media streams |

### Step 1 — DNS

Point an A record at the instance public IP:

```
livekit.yourdomain.com  →  <EC2 public IP>
```

### Step 2 — Install Docker on the instance

```bash
# Ubuntu 22.04
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

### Step 3 — Create the config files

**`livekit.yaml`**

```yaml
port: 7880
log_level: info

keys:
  # Must match LIVEKIT_API_KEY : LIVEKIT_API_SECRET in your Vercel env vars
  your-api-key: your-api-secret

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true   # detects EC2 public IP automatically

# Uncomment if users are behind strict firewalls / symmetric NATs
# turn:
#   enabled: true
#   domain: livekit.yourdomain.com
#   tls_port: 5349
#   udp_port: 3478
#   external_tls: true
```

**`docker-compose.yml`**

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    network_mode: host
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro

volumes:
  caddy_data:
  caddy_config:
```

**`Caddyfile`**

```
livekit.yourdomain.com {
    reverse_proxy localhost:7880
}
```

### Step 4 — Start

```bash
docker compose up -d
docker compose logs -f   # Caddy will provision a Let's Encrypt cert on first request
```

### Step 5 — Update Vercel env vars

```
LIVEKIT_URL=wss://livekit.yourdomain.com
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.yourdomain.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

Trigger a redeploy. All audio now flows through Frankfurt.

### Verify

Open the app → DevTools → Network. The WebSocket upgrade should connect to `livekit.yourdomain.com`. In `docker compose logs livekit` you should see your participant join.

---

## Optional: room access secret

Without a secret, anyone who guesses `/r/team-alpha` can join. To add a shared passphrase:

```env
# Set the same value in both scopes so the client can append it to token requests
LIVEKIT_ROOM_SECRET=a-long-random-string
NEXT_PUBLIC_ROOM_SECRET=a-long-random-string
```

The server rejects token requests that don't include `?s=<secret>` matching `LIVEKIT_ROOM_SECRET`. The client appends it automatically.

> `NEXT_PUBLIC_*` variables are embedded in the client bundle. This guards against casual discovery, not a determined attacker who inspects the bundle. For proper auth add sign-in in a future phase.

---

## Rate limiting

`/api/token` is limited to **20 requests per minute per IP** (in-memory). This works per warm serverless instance.

For multi-instance production, replace the `isAllowed` function in `app/api/token/route.ts` with [Upstash Rate Limit](https://github.com/upstash/ratelimit-js) (free tier covers small teams):

```bash
npm install @upstash/ratelimit @upstash/redis
```

---

## Architecture overview

```
Browser (Next.js + Phaser)
  ├─ GET /api/token?room=&identity=   → mints LiveKit JWT (Vercel serverless)
  ├─ connect to LiveKit room over WSS
  ├─ publish mic track (always on, mutable)
  ├─ subscribe to remote audio tracks
  │    └─ Web Audio GainNode per peer — proximity attenuation
  │         gain = clamp((360 − dist) / 240, 0, 1)
  │         full volume < 120 px · silent > 360 px
  ├─ WASD/arrow movement → PosMsg on lossy data channel ~10 Hz
  ├─ remote PosMsg → avatar lerp + gain update
  └─ chat → ChatMsg on reliable data channel (topic "chat")
```

No database. No auth server. No persistent state. The room exists while participants are connected.

---

## Privacy

- Audio is transmitted in real time via WebRTC and is **not recorded**.
- Display names live in LiveKit participant metadata for the session duration and are discarded on disconnect.
- No cookies, no analytics, no third-party scripts.
- Self-hosted deployment: all media stays within your `eu-central-1` region.
