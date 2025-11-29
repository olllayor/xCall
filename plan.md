# Random Video Chat — Backend & WebRTC Coding Plan

> Focus: backend + WebRTC core (P2P-first) with minimal HTML UI. Runtime: **Bun**.

---

## 1. Project structure

```
random-video-chat/
│
├─ server/
│   ├─ index.ts              # Entry point, Bun native HTTP + WS server
│   ├─ config.ts             # Configuration (ports, ICE servers, feature flags)
│   ├─ signal/
│   │   ├─ signaling.ts      # WebSocket signaling logic
│   │   └─ roomManager.ts    # Manage users, matchmaking, rooms
│   └─ utils/
│       └─ network.ts        # Helpers: connection-quality heuristics, pings
│
├─ public/                   # Minimal UI for testing
│   ├─ index.html
│   └─ main.js               # Client WebRTC logic (Trickle ICE, adaptive constraints)
│
├─ infra/                    # Optional: docker-compose, bun scripts, deployment manifests
│   ├─ docker-compose.yml
│   └─ co-turn/              # coTURN deployment config (if used)
│
├─ package.json
├─ bun.lockb
└─ tsconfig.json
```

---

## 1.1 Implementation order (recommended)

Build components in this sequence for smooth development:

1. **`server/config.ts`** — Configuration first (ports, ICE servers)
2. **`server/signal/roomManager.ts`** — User queue + matchmaking (foundation)
3. **`server/signal/signaling.ts`** — WebSocket message handling (uses roomManager)
4. **`server/index.ts`** — Bun native HTTP/WS server + static file serving
5. **`public/index.html`** — Minimal UI (video elements, buttons, status)
6. **`public/main.js`** — WebRTC client (Trickle ICE, offer/answer, stats monitoring)

---

## 2. Core components (what to implement and why)

### Signaling server (`server/signaling/signaling.ts`)

* WebSocket-based endpoint for ultra-low-latency message exchange.
* Minimal message types: `join`, `queued`, `matched`, `offer`, `answer`, `ice`, `leave`, `peer-left`, `error`.
* Keep messages tiny (JSON) and avoid extra RTTs (no heavy auth handshake during matchmaking).

### Room manager (`server/signaling/roomManager.ts`)

* In-memory FIFO queue for single-node MVP.
* Redis-backed queue option for multi-node production (LPUSH/BRPOP or streams).
* Responsibilities: enqueue, dequeue, pair two peers, metadata (region tag, client capabilities), cleanup.

### WebRTC exchange (client ↔ signaling)

* Use **Trickle ICE** (send ICE candidates as they come). Set local description early.
* Role assignment: `offerer` / `answerer` to reduce negotiation complexity.
* Fast path: try direct P2P first. If NAT blocks, use TURN servers.

### ICE servers (STUN / TURN)

* STUN: public servers (Google) OK for early testing.
* TURN: coTURN (self-host) or commercial (Twilio / Xirsys) for strict NATs; run multi-region for latency.
* Expose TURN on 80/443 (TCP/TLS) to pass restrictive networks.

### Media quality & adaptation

* Start with conservative constraints (e.g., 640×360 @ 15fps) for fast time-to-first-frame.
* Implement `getStats()`-based monitoring on client; progressively lower bitrate / fps / resolution on packet loss.
* Use `RTCRtpSender.setParameters()` for bitrate caps; attempt encodings/simulcast when available.

### Minimal UI (public/index.html + main.js)

* Join/Leave buttons, local video, remote video, connection status, basic controls (force audio-only).
* Keep UI minimal; focus on metrics and connect speed during development.

---

## 3. Bun-specific notes

* **Use Bun's native HTTP server and WebSocket API** — avoid `express` and `ws` packages for minimal overhead.
* TypeScript supported in Bun — write `server/index.ts` and run via `bun run` / `bun start`.
* Avoid large Node-only dependencies; prefer lightweight libs or pure Bun APIs.
* Use Bun's fast startup and keep the signaling server single-threaded but scalable via process managers or k8s.
* Bun's `Bun.serve()` handles both HTTP and WebSocket in a single server instance.

### Bun WebSocket server pattern

```typescript
Bun.serve({
  port: 3000,
  fetch(req, server) {
    // Upgrade to WebSocket if path matches
    if (new URL(req.url).pathname === "/ws") {
      server.upgrade(req);
      return;
    }
    // Serve static files
    return new Response(Bun.file("./public/index.html"));
  },
  websocket: {
    open(ws) { /* handle connection */ },
    message(ws, message) { /* handle message */ },
    close(ws) { /* handle disconnect */ },
  },
});
```

---

## 4. Coding roadmap (tasks, priorities)

### Phase A — Local MVP (fastest path)

1. Initialize Bun project (`bun init`) and TypeScript config.
2. Implement lightweight WebSocket signaling server with in-memory queue.
3. Implement `public/index.html` and `public/main.js` client that:

   * Captures media with conservative constraints
   * Connects to signaling via WS
   * Implements Trickle ICE and role-based offer/answer
   * Monitors `getStats()` and auto-downgrades on high packet loss
4. Quick test: open two tabs (or two devices) connect and validate P2P path.

**Deliverables**: `server/index.ts`, `server/signaling/*`, `public/*`.

### Phase B — Reliability & NAT traversal

1. Add coTURN config and test with TURN in `public/main.js` iceServers.
2. Measure P2P success rate; collect `time-to-first-frame`, p2p vs TURN percentages.
3. Improve cleanup and reconnection strategies (graceful re-join, ICE restart if needed).

**Deliverables**: `infra/docker-compose.yml` with coTURN + signaling for local testing.

### Phase C — Production readiness (scaling)

1. Replace in-memory queue with Redis (optional feature flag). Implement cross-node pairing.
2. Add health checks, heartbeat (WS pings/pongs), and connection timeouts.
3. Implement metrics export (Prometheus-compatible simple counters: connect_time_seconds, p2p_success_total, turn_relay_total, active_sessions).
4. Add TLS (wss) support and token-based auth for signaling.

**Deliverables**: `infra/` manifests, `server/config.ts` with production flags.

### Phase D — Advanced features (post-MVP)

* Add SFU fallback (mediasoup) only if required (recording, moderation, or relaying when peers can’t p2p reliably).
* Implement region-aware matchmaking and nearest TURN/SFU routing.
* Integrate moderation tooling (AI-based or manual moderation) if needed.

---

## 5. Implementation details & code patterns (practical tips)

* **Signaling messages**: keep a small JSON envelope `{ type, payload }`.
* **Role assignment**: the peer that was waiting longest becomes `answerer`, incoming peer becomes `offerer` — assign deterministically.
* **Trickle ICE**: call `setLocalDescription()` before sending the offer to allow early candidate gathering.
* **Fast start constraint**: request low-res camera first (640×360 @ 15fps); upgrade parameters after `ontrack` / stats verify capacity.
* **Backoff policy**: on repeated failures, increase wait time and rotate TURN endpoints.

### Message type definitions

```typescript
// Server → Client messages
type ServerMessage =
  | { type: "queued" }                           // You're in queue, waiting for peer
  | { type: "matched"; role: "offerer" | "answerer"; peerId: string }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "peer-left" }
  | { type: "error"; message: string };

// Client → Server messages
type ClientMessage =
  | { type: "join" }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "leave" };
```

### Conservative media constraints (fast time-to-first-frame)

```javascript
const constraints = {
  video: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 360, max: 360 },
    frameRate: { ideal: 15, max: 15 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true
  }
};
```

### ICE server configuration

```javascript
const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Add TURN servers for production (Phase B)
  // { urls: "turn:your-turn-server.com:3478", username: "user", credential: "pass" }
];
```

---

## 6. Testing checklist

* [ ] Local P2P: two browser tabs connect, video & audio flows.
* [ ] Trickle ICE works: candidates exchanged incrementally, no long waits for all candidates.
* [ ] Fallback to TURN: verify relay path when direct P2P fails.
* [ ] Auto-downgrade: simulate packet loss and verify bitrate/frame rate reduction.
* [ ] Graceful peer leave: second peer receives `peer-left`, streams stop, resources freed.

---

## 7. Dependencies

### Required (use Bun built-ins)

```json
{
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

> **Note**: Remove `express` and `ws` from package.json — use Bun's native `Bun.serve()` instead.

### Optional (Phase C+)

* `redis` or `ioredis` — for multi-node queue (production scaling)
* `prom-client` — for Prometheus metrics export

---

## 8. Quick start commands

```bash
# Install dependencies
bun install

# Run development server
bun run server/index.ts

# Or add to package.json scripts:
# "dev": "bun run --watch server/index.ts"
```

