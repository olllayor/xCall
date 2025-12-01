# Drift Video Chat

A WebRTC-powered random video chat application with dual deployment options: Bun for local development and Cloudflare Workers with Durable Objects for production.

## Tech Stack

- **Runtime**: Bun (local) / Cloudflare Workers (production)
- **Backend**: TypeScript with native WebSocket support
- **Frontend**: Vanilla JavaScript with WebRTC APIs
- **Signaling**: WebSocket-based (Bun) or Durable Objects (Cloudflare)

## Features

- 🎥 One-on-one random video chat
- 🔄 Automatic matchmaking queue
- 🌐 WebRTC peer-to-peer connections
- 📊 Adaptive quality based on network conditions
- 🎛️ Camera/microphone controls
- 📱 Mobile-friendly responsive design

## Quick Start

### Local Development (Bun)

```bash
# Install dependencies
bun install

# Run the development server
bun run dev

# Server will start at http://localhost:3000
```

Open two browser tabs to `http://localhost:3000` to test the video chat.

### Cloudflare Workers Deployment

```bash
# Run locally with Wrangler
bun run dev:cf

# Deploy to Cloudflare
bun run deploy

# View logs
bun run tail
```

## Project Structure

```
/
├── server/               # Bun-based local server
│   ├── index.ts         # HTTP/WebSocket server
│   ├── config.ts        # Configuration
│   └── signal/          # Signaling & matchmaking
│       ├── signaling.ts
│       └── roomManager.ts
├── src/                 # Cloudflare Workers
│   ├── worker.ts        # Worker entry point
│   └── signaling.ts     # Durable Object signaling
├── public/              # Static frontend
│   ├── index.html       # UI
│   └── main.js          # WebRTC client logic
├── wrangler.toml        # Cloudflare config
└── package.json
```

## Configuration

### Environment Variables

- `SERVER_PORT`: Port for Bun server (default: 3000)

### ICE Servers

By default, the app uses free Google STUN servers for NAT traversal. For production, consider adding TURN servers for better connectivity in restrictive network environments.

Edit `server/config.ts` or update the client's `ICE_SERVERS` in `public/main.js`.

## Architecture

### Local Development (Bun)
- Single process HTTP + WebSocket server
- In-memory queue and room management
- Fast iteration and debugging

### Production (Cloudflare)
- Globally distributed edge network
- Durable Objects for persistent WebSocket state
- Automatic scaling and reliability

## Development Notes

- The app uses **Trickle ICE** for faster connection establishment
- Media constraints start high (up to 4K) and adapt based on network
- Connection quality is monitored every 2 seconds
- Auto-reconnect on peer disconnect

## Browser Support

- Chrome/Edge 89+
- Firefox 90+
- Safari 15+
- Mobile browsers with WebRTC support

## License

MIT

---

Created with [Bun](https://bun.sh) and ☕
