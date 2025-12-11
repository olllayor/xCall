# xCall

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

xCall is an open-source random video chat application that connects users anonymously for peer-to-peer video conversations using WebRTC technology. Built with modern web technologies and deployed on Cloudflare Workers for global scalability and low latency.

## Features

- **Random Matching**: Instantly connect with random users worldwide
- **Peer-to-Peer Communication**: Direct WebRTC connections for privacy and performance
- **Real-time Signaling**: WebSocket-based signaling server using Cloudflare Durable Objects
- **Cross-platform**: Works on any modern web browser
- **Scalable Architecture**: Serverless deployment on Cloudflare's edge network

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime
- **Language**: TypeScript
- **Backend**: Cloudflare Workers with Durable Objects
- **Signaling**: WebSocket protocol
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **WebRTC**: Native browser APIs for real-time communication

## Prerequisites

- [Bun](https://bun.sh) installed
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) for Cloudflare Workers
- A Cloudflare account (for deployment)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ollayor/xCall.git
   cd xCall
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up Cloudflare Workers** (optional, for deployment)
   ```bash
   npx wrangler auth login
   ```

## Development

Start the development server with hot reloading:

```bash
bun run dev
```

This launches the Cloudflare Workers development environment. Open [http://localhost:8787](http://localhost:8787) in your browser to test the application.

## Deployment

Deploy to Cloudflare Workers:

```bash
bun run deploy
```

Monitor logs in production:

```bash
bun run tail
```

## Usage

1. Open the application in your web browser
2. Grant camera and microphone permissions when prompted
3. Click "Start Chat" to join the matchmaking queue
4. Wait for a random user to connect
5. Enjoy your anonymous video conversation!

## Project Structure

```
xCall/
├── src/
│   ├── signaling.ts    # WebRTC signaling server (Durable Object)
│   └── worker.ts       # Main Cloudflare Worker entry point
├── public/
│   ├── index.html      # Main UI
│   └── main.js         # Client-side WebRTC logic
├── package.json        # Project dependencies and scripts
├── wrangler.toml       # Cloudflare Workers configuration
└── tsconfig.json       # TypeScript configuration
```

## API Endpoints

- `GET /` - Serve the main application
- `GET /ws` - WebSocket endpoint for signaling
- `GET /health` - Health check endpoint
- `GET /stats` - Application statistics

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Contributing Guidelines](CONTRIBUTING.md) for more details.

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Bun](https://bun.sh) for fast development
- Powered by [Cloudflare Workers](https://workers.cloudflare.com/)
- WebRTC for peer-to-peer communication
- Inspired by random chat applications worldwide

## Support

If you have any questions or need help:

- Open an issue on GitHub
- Check the [documentation](docs/) (coming soon)
- Join our community discussions

---

**Disclaimer**: xCall is for entertainment purposes. Users are responsible for their own safety and privacy when using anonymous chat services.
