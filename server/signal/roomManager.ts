/**
 * Room Manager - Handles user matchmaking for video chat
 *
 * Think of this like a waiting room at a speed-dating event:
 * 1. Users join and wait in a queue
 * 2. When 2 users are waiting, they get paired together
 * 3. When someone leaves, their partner is notified
 */

import type { ServerWebSocket } from 'bun';

// =============================================================================
// TYPES - Define what our data looks like
// =============================================================================

/**
 * WebSocket data - Bun lets us attach custom data to each WebSocket
 * We use this to store the visitorId so we can identify who sent a message
 */
export type WebSocketData = {
	userId: string;
};

/**
 * Represents a connected user (we call them "Peer" in WebRTC world)
 *
 * Each peer has:
 * - id: A unique identifier (random string)
 * - ws: Their WebSocket connection (how we send messages to them)
 * - joinedAt: When they connected (useful for debugging)
 */
export type Peer = {
	id: string;
	ws: ServerWebSocket<WebSocketData>;
	joinedAt: number;
};

/**
 * Represents a room with two matched peers
 *
 * A room contains:
 * - id: Unique room identifier
 * - peer1: The first peer (was waiting, becomes the "answerer" in WebRTC)
 * - peer2: The second peer (just joined, becomes the "offerer" in WebRTC)
 */
export type Room = {
	id: string;
	peer1: Peer; // The one who waited → will be "answerer"
	peer2: Peer; // The one who joined → will be "offerer"
};

// =============================================================================
// STORAGE - In-memory data structures
// =============================================================================

// Queue of peers waiting to be matched (FIFO - First In, First Out)
const queue: Peer[] = [];

// Active rooms: visitorId → Room (we store twice, once for each peer)
const rooms = new Map<string, Room>();

// All connected peers: visitorId → Peer
const peers = new Map<string, Peer>();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Generate a simple unique ID (good enough for MVP) */
export function generateId(): string {
	return Math.random().toString(36).substring(2, 12);
}

// =============================================================================
// CORE FUNCTIONS - The matchmaking logic
// =============================================================================

/**
 * Create and register a new peer
 *
 * Called when a WebSocket connection is established.
 * We store the peer so we can find them later by ID.
 */
export function createPeer(ws: ServerWebSocket<WebSocketData>): Peer {
	const peer: Peer = {
		id: ws.data.userId,
		ws,
		joinedAt: Date.now(),
	};

	peers.set(peer.id, peer);
	console.log(`[RoomManager] Peer created: ${peer.id}`);

	return peer;
}

/**
 * Add peer to queue and try to match with someone
 *
 * This is the main matchmaking function:
 * - If someone is waiting → create a room and return it
 * - If no one is waiting → add to queue and return null
 *
 * Returns: Room if matched, null if now waiting
 */
export function enqueue(peer: Peer): Room | null {
	// Is someone already waiting?
	if (queue.length > 0) {
		// Yes! Get the first waiting peer (FIFO)
		const waitingPeer = queue.shift()!;

		// Create a room for them
		const room = createRoom(waitingPeer, peer);
		console.log(`[RoomManager] ✓ Match! Room ${room.id}: ${waitingPeer.id} ↔ ${peer.id}`);

		return room;
	}

	// No one waiting - add this peer to queue
	queue.push(peer);
	console.log(`[RoomManager] Peer ${peer.id} queued. Waiting: ${queue.length}`);

	return null;
}

/**
 * Create a room for two matched peers
 */
function createRoom(peer1: Peer, peer2: Peer): Room {
	const room: Room = {
		id: generateId(),
		peer1, // Was waiting → answerer
		peer2, // Just joined → offerer
	};

	// Store room for both peers (so we can look up by either ID)
	rooms.set(peer1.id, room);
	rooms.set(peer2.id, room);

	return room;
}

/**
 * Get the room a peer is in (if any)
 */
export function getRoom(userId: string): Room | undefined {
	return rooms.get(userId);
}

/**
 * Get the other peer in a room
 *
 * Example: If Alice asks "who am I chatting with?", return Bob
 */
export function getPartner(userId: string): Peer | undefined {
	const room = rooms.get(userId);
	if (!room) return undefined;

	// Return the OTHER peer
	return room.peer1.id === userId ? room.peer2 : room.peer1;
}

/**
 * Remove a peer from the system
 *
 * Called when WebSocket disconnects. Cleans up:
 * 1. The peers map
 * 2. The waiting queue (if they were waiting)
 * 3. The room (if they were in one)
 *
 * Returns: The partner peer (so signaling can notify them)
 */
export function removePeer(userId: string): Peer | undefined {
	const peer = peers.get(userId);
	if (!peer) return undefined;

	console.log(`[RoomManager] Removing peer: ${userId}`);

	// Remove from peers map
	peers.delete(userId);

	// Remove from queue if waiting
	const queueIndex = queue.findIndex((p) => p.id === userId);
	if (queueIndex !== -1) {
		queue.splice(queueIndex, 1);
		console.log(`[RoomManager] Removed from queue. Waiting: ${queue.length}`);
		return undefined; // No partner to notify
	}

	// Check if in a room
	const room = rooms.get(userId);
	if (room) {
		const partner = room.peer1.id === userId ? room.peer2 : room.peer1;

		// Clean up room
		rooms.delete(room.peer1.id);
		rooms.delete(room.peer2.id);

		console.log(`[RoomManager] Room ${room.id} closed. Partner ${partner.id} notified.`);
		return partner;
	}

	return undefined;
}

/**
 * Get current stats (for debugging/monitoring)
 */
export function getStats() {
	return {
		connectedPeers: peers.size,
		waitingInQueue: queue.length,
		activeRooms: rooms.size / 2, // Divided by 2 (we store 2 entries per room)
	};
}
