/**
 * SignalingServer - Cloudflare Durable Object for WebRTC Signaling
 *
 * This Durable Object handles:
 * - WebSocket connections from clients
 * - Matchmaking queue (pairing users together)
 * - Room management (forwarding WebRTC signaling between peers)
 *
 * Why Durable Objects?
 * - Persistent WebSocket connections (unlike serverless functions)
 * - Shared state across all connections (queue, rooms)
 * - Single instance handles all signaling globally
 */

interface Peer {
    id: string;
    ws: WebSocket;
    roomId: string | null;
}

interface Room {
    id: string;
    peer1: string;
    peer2: string;
}

// Message types from client
interface ClientMessage {
    type: 'join' | 'leave' | 'offer' | 'answer' | 'ice';
    sdp?: { type: string; sdp: string };
    candidate?: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
}

// Message types to client
interface ServerMessage {
    type: 'queued' | 'matched' | 'offer' | 'answer' | 'ice' | 'peer-left' | 'error';
    role?: 'offerer' | 'answerer';
    sdp?: { type: string; sdp: string };
    candidate?: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
    message?: string;
}

export class SignalingServer implements DurableObject {
    private ctx: DurableObjectState;

    // In-memory state (persists as long as DO is alive)
    private peers: Map<string, Peer> = new Map();
    private rooms: Map<string, Room> = new Map();
    private queue: string[] = [];

    constructor(ctx: DurableObjectState, env: unknown) {
        this.ctx = ctx;
    }

    /**
     * Handle incoming HTTP requests (WebSocket upgrades)
     */
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // WebSocket upgrade for /ws endpoint
        if (url.pathname === '/ws') {
            const upgradeHeader = request.headers.get('Upgrade');
            if (upgradeHeader !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426 });
            }

            // Create WebSocket pair
            const pair = new WebSocketPair();
            const client = pair[0];
            const server = pair[1];

            // Accept the WebSocket and handle it
            this.handleWebSocket(server);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        // Stats endpoint for debugging
        if (url.pathname === '/stats') {
            return new Response(
                JSON.stringify({
                    peers: this.peers.size,
                    rooms: this.rooms.size,
                    queue: this.queue.length,
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        return new Response('Not Found', { status: 404 });
    }

    /**
     * Handle a WebSocket connection
     */
    private handleWebSocket(ws: WebSocket): void {
        // Accept the connection
        ws.accept();

        // Generate unique peer ID
        const peerId = crypto.randomUUID();

        // Create peer object
        const peer: Peer = {
            id: peerId,
            ws,
            roomId: null,
        };

        this.peers.set(peerId, peer);
        console.log(`[WS] Peer connected: ${peerId}`);

        // Handle messages
        ws.addEventListener('message', (event) => {
            try {
                const message: ClientMessage = JSON.parse(event.data as string);
                this.handleMessage(peerId, message);
            } catch (err) {
                console.error('[WS] Invalid message:', err);
                this.sendToPeer(peerId, { type: 'error', message: 'Invalid message format' });
            }
        });

        // Handle disconnect
        ws.addEventListener('close', () => {
            console.log(`[WS] Peer disconnected: ${peerId}`);
            this.handleLeave(peerId);
            this.peers.delete(peerId);
        });

        ws.addEventListener('error', (err) => {
            console.error(`[WS] Error for peer ${peerId}:`, err);
        });
    }

    /**
     * Handle incoming messages from a peer
     */
    private handleMessage(peerId: string, message: ClientMessage): void {
        console.log(`[Message] ${peerId}: ${message.type}`);

        switch (message.type) {
            case 'join':
                this.handleJoin(peerId);
                break;

            case 'leave':
                this.handleLeave(peerId);
                break;

            case 'offer':
            case 'answer':
            case 'ice':
                this.forwardToPartner(peerId, message);
                break;

            default:
                this.sendToPeer(peerId, { type: 'error', message: 'Unknown message type' });
        }
    }

    /**
     * Handle join request - add to queue or match with waiting peer
     */
    private handleJoin(peerId: string): void {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        // Already in a room? Leave first
        if (peer.roomId) {
            this.handleLeave(peerId);
        }

        // Remove from queue if already there
        this.queue = this.queue.filter((id) => id !== peerId);

        // Try to match with someone in queue
        if (this.queue.length > 0) {
            const partnerId = this.queue.shift()!;
            const partner = this.peers.get(partnerId);

            if (partner && partner.ws.readyState === WebSocket.OPEN) {
                // Create room
                const roomId = crypto.randomUUID();
                const room: Room = {
                    id: roomId,
                    peer1: partnerId,
                    peer2: peerId,
                };

                this.rooms.set(roomId, room);
                peer.roomId = roomId;
                partner.roomId = roomId;

                console.log(`[Match] Room ${roomId}: ${partnerId} <-> ${peerId}`);

                // Notify both peers
                this.sendToPeer(partnerId, { type: 'matched', role: 'answerer' });
                this.sendToPeer(peerId, { type: 'matched', role: 'offerer' });
            } else {
                // Partner disconnected, try again
                this.handleJoin(peerId);
            }
        } else {
            // No one waiting, add to queue
            this.queue.push(peerId);
            this.sendToPeer(peerId, { type: 'queued' });
            console.log(`[Queue] ${peerId} added. Queue size: ${this.queue.length}`);
        }
    }

    /**
     * Handle leave request - notify partner and clean up
     */
    private handleLeave(peerId: string): void {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        // Remove from queue
        this.queue = this.queue.filter((id) => id !== peerId);

        // Leave room if in one
        if (peer.roomId) {
            const room = this.rooms.get(peer.roomId);
            if (room) {
                // Notify partner
                const partnerId = room.peer1 === peerId ? room.peer2 : room.peer1;
                this.sendToPeer(partnerId, { type: 'peer-left' });

                // Clear partner's room reference
                const partner = this.peers.get(partnerId);
                if (partner) {
                    partner.roomId = null;
                }

                // Delete room
                this.rooms.delete(peer.roomId);
                console.log(`[Room] Deleted: ${peer.roomId}`);
            }

            peer.roomId = null;
        }
    }

    /**
     * Forward signaling message to partner
     */
    private forwardToPartner(peerId: string, message: ClientMessage): void {
        const peer = this.peers.get(peerId);
        if (!peer || !peer.roomId) {
            this.sendToPeer(peerId, { type: 'error', message: 'Not in a room' });
            return;
        }

        const room = this.rooms.get(peer.roomId);
        if (!room) {
            this.sendToPeer(peerId, { type: 'error', message: 'Room not found' });
            return;
        }

        const partnerId = room.peer1 === peerId ? room.peer2 : room.peer1;

        // Forward the message
        const forwardMessage: ServerMessage = {
            type: message.type as 'offer' | 'answer' | 'ice',
            sdp: message.sdp,
            candidate: message.candidate,
        };

        this.sendToPeer(partnerId, forwardMessage);
    }

    /**
     * Send message to a specific peer
     */
    private sendToPeer(peerId: string, message: ServerMessage): void {
        const peer = this.peers.get(peerId);
        if (peer && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify(message));
        }
    }
}
