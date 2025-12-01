/**
 * Main Server Entry Point
 *
 * This is where everything starts! We use Bun's built-in server which handles:
 * - HTTP requests (serving our HTML/JS files)
 * - WebSocket connections (for signaling)
 *
 * All in ONE server - no need for Express or ws package!
 */

import { handleClose, handleMessage, handleOpen } from './signal/signaling';
import { generateId, getStats, type WebSocketData } from './signal/roomManager';
import { SERVER_PORT } from './config';

// =============================================================================
// SERVER SETUP
// =============================================================================

/**
 * Bun.serve() creates a server that handles both HTTP and WebSocket
 *
 * - fetch: handles normal HTTP requests (like loading the webpage)
 * - websocket: handles WebSocket connections (for real-time signaling)
 */
const server = Bun.serve<WebSocketData>({
    port: SERVER_PORT,

    /**
     * HTTP Request Handler
     *
     * This runs for every HTTP request. We use it to:
     * 1. Upgrade WebSocket connections (when client connects to /ws)
     * 2. Serve static files (HTML, JS) from the public folder
     */
    fetch(req, server) {
        const url = new URL(req.url);

        // ----- WebSocket Upgrade -----
        // When client connects to /ws, upgrade to WebSocket
        if (url.pathname === '/ws') {
            // Generate a unique ID for this user
            const userId = generateId();

            // Upgrade the HTTP connection to WebSocket
            // The { data: { userId } } is attached to the WebSocket
            // so we can identify this user in message handlers
            const upgraded = server.upgrade(req, {
                data: { userId },
            });

            if (upgraded) {
                // Upgrade successful - Bun will now call websocket handlers
                return undefined;
            }

            // Upgrade failed
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // ----- Health Check Endpoint -----
        if (url.pathname === '/health') {
            return new Response(
                JSON.stringify({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        // ----- Stats Endpoint -----
        if (url.pathname === '/stats') {
            return new Response(JSON.stringify(getStats()), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // ----- Static File Serving -----
        // Serve files from the public folder

        // Map URL paths to file paths
        let filePath = url.pathname;

        // Default to index.html for root path
        if (filePath === '/') {
            filePath = '/index.html';
        }

        // Try to serve the file from public folder
        const file = Bun.file(`./public${filePath}`);

        return new Response(file);
    },

    /**
     * WebSocket Handlers
     *
     * These functions are called by Bun when WebSocket events happen.
     * We just forward them to our signaling module.
     */
    websocket: {
        /**
         * Called when a new WebSocket connection is established
         */
        open(ws) {
            handleOpen(ws);
        },

        /**
         * Called when we receive a message from a client
         *
         * @param ws - The WebSocket that sent the message
         * @param message - The message content (string or binary)
         */
        message(ws, message) {
            handleMessage(ws, message);
        },

        /**
         * Called when a WebSocket connection closes
         */
        close(ws) {
            handleClose(ws);
        },
    },
});

// =============================================================================
// STARTUP MESSAGE
// =============================================================================

console.log(`
🚀 Video Chat Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Server:    http://localhost:${server.port}
🔌 WebSocket: ws://localhost:${server.port}/ws

Open the URL in two browser tabs to test!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
