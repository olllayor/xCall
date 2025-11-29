/**
 * Signaling - WebSocket message handler
 *
 * This file handles all the messages between browser clients and our server.
 * It's the "translator" between what clients want and what roomManager does.
 *
 * Message Flow:
 * ┌──────────┐                    ┌──────────┐                    ┌──────────┐
 * │ Client A │ ←──── WebSocket ────→ │ Server   │ ←──── WebSocket ────→ │ Client B │
 * └──────────┘                    └──────────┘                    └──────────┘
 *
 * The server doesn't handle video/audio - it just passes WebRTC signals between peers.
 */

import type { ServerWebSocket } from 'bun';
import { createPeer, enqueue, getPartner, removePeer, type Peer, type WebSocketData } from './roomManager';

// =============================================================================
// MESSAGE TYPES - Define the shape of messages
// =============================================================================

/**
 * ICE Candidate - represents a possible connection path
 * (We define this ourselves since RTCIceCandidateInit is a browser-only type)
 */
type IceCandidate = {
	candidate: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
};

/**
 * Messages the CLIENT can send to the server
 */
type ClientMessage =
	| { type: 'join' } // "I want to chat with someone"
	| { type: 'leave' } // "I'm leaving"
	| { type: 'offer'; sdp: string } // WebRTC offer (connection request)
	| { type: 'answer'; sdp: string } // WebRTC answer (connection response)
	| { type: 'ice'; candidate: IceCandidate }; // ICE candidate (connection path)

/**
 * Messages the SERVER sends to clients
 */
type ServerMessage =
	| { type: 'queued' } // "You're waiting for a match"
	| { type: 'matched'; role: 'offerer' | 'answerer'; peerId: string } // "Found a match!"
	| { type: 'offer'; sdp: string } // Forward offer from peer
	| { type: 'answer'; sdp: string } // Forward answer from peer
	| { type: 'ice'; candidate: IceCandidate } // Forward ICE from peer
	| { type: 'peer-left' } // "Your chat partner left"
	| { type: 'error'; message: string }; // Something went wrong

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send a message to a specific client
 *
 * We JSON.stringify because WebSocket sends text/binary, not objects
 */
function send(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): void {
	ws.send(JSON.stringify(message));
}

/**
 * Send a message to a peer (using their Peer object)
 */
function sendToPeer(peer: Peer, message: ServerMessage): void {
	peer.ws.send(JSON.stringify(message));
}

// =============================================================================
// MAIN MESSAGE HANDLER
// =============================================================================

/**
 * Handle incoming WebSocket messages
 *
 * This is the main function - called every time a client sends a message.
 * We parse the message and decide what to do based on its type.
 */
export function handleMessage(ws: ServerWebSocket<WebSocketData>, raw: string | Buffer): void {
	// Step 1: Parse the JSON message
	let message: ClientMessage;
	try {
		message = JSON.parse(raw.toString());
	} catch {
		send(ws, { type: 'error', message: 'Invalid JSON' });
		return;
	}

	const userId = ws.data.userId;

	// Step 2: Handle based on message type
	switch (message.type) {
		case 'join':
			handleJoin(ws);
			break;

		case 'leave':
			handleLeave(userId);
			break;

		case 'offer':
			forwardToPartner(userId, { type: 'offer', sdp: message.sdp });
			break;

		case 'answer':
			forwardToPartner(userId, { type: 'answer', sdp: message.sdp });
			break;

		case 'ice':
			forwardToPartner(userId, { type: 'ice', candidate: message.candidate });
			break;

		default:
			send(ws, { type: 'error', message: 'Unknown message type' });
	}
}

// =============================================================================
// MESSAGE HANDLERS - One function per message type
// =============================================================================

/**
 * Handle "join" - User wants to find a chat partner
 *
 * Flow:
 * 1. Create a Peer for this user
 * 2. Try to match with someone in the queue
 * 3. If matched → tell both peers, assign roles
 * 4. If not matched → tell user they're waiting
 */
function handleJoin(ws: ServerWebSocket<WebSocketData>): void {
	// Create peer object
	const peer = createPeer(ws);

	// Try to find a match
	const room = enqueue(peer);

	if (room) {
		// ✅ Match found! Notify both peers

		// peer1 was waiting → they become the "answerer"
		// peer2 just joined → they become the "offerer" (they initiate the WebRTC connection)
		sendToPeer(room.peer1, {
			type: 'matched',
			role: 'answerer',
			peerId: room.peer2.id,
		});

		sendToPeer(room.peer2, {
			type: 'matched',
			role: 'offerer',
			peerId: room.peer1.id,
		});
	} else {
		// ⏳ No match yet - user is now in queue
		send(ws, { type: 'queued' });
	}
}

/**
 * Handle "leave" - User is leaving voluntarily
 *
 * Same as disconnect, but initiated by the user
 */
function handleLeave(userId: string): void {
	const partner = removePeer(userId);

	if (partner) {
		// Tell the partner their chat buddy left
		sendToPeer(partner, { type: 'peer-left' });
	}
}

/**
 * Forward a message to the user's chat partner
 *
 * Used for WebRTC signaling (offer, answer, ICE candidates)
 * The server doesn't understand these - it just passes them along
 */
function forwardToPartner(userId: string, message: ServerMessage): void {
	const partner = getPartner(userId);

	if (partner) {
		sendToPeer(partner, message);
	}
	// If no partner, silently ignore (they might have disconnected)
}

// =============================================================================
// CONNECTION LIFECYCLE HANDLERS
// =============================================================================

/**
 * Handle new WebSocket connection
 *
 * Called by Bun when a client connects.
 * We don't do much here - actual logic starts when they send "join"
 */
export function handleOpen(ws: ServerWebSocket<WebSocketData>): void {
	console.log(`[Signaling] Client connected: ${ws.data.userId}`);
}

/**
 * Handle WebSocket disconnect
 *
 * Called by Bun when connection closes (user closes tab, network error, etc.)
 * We clean up and notify the partner if there was one
 */
export function handleClose(ws: ServerWebSocket<WebSocketData>): void {
	const userId = ws.data.userId;
	console.log(`[Signaling] Client disconnected: ${userId}`);

	// Clean up and get partner (if any)
	const partner = removePeer(userId);

	if (partner) {
		// Tell the partner
		sendToPeer(partner, { type: 'peer-left' });
	}
}
