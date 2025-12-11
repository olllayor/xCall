/**
 * Main Client - WebRTC Video Chat
 *
 * This file handles:
 * 1. Camera/microphone access
 * 2. WebSocket connection to signaling server
 * 3. WebRTC peer connection (the actual video call)
 *
 * Flow:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. Get camera/mic access                                    │
 * │ 2. Connect to WebSocket                                     │
 * │ 3. Send "join" to find a partner                            │
 * │ 4. When matched:                                            │
 * │    - Offerer: Create offer → send via WebSocket             │
 * │    - Answerer: Wait for offer → create answer → send        │
 * │ 5. Exchange ICE candidates (connection paths)               │
 * │ 6. Video starts flowing directly between browsers (P2P)     │
 * └──────────────────────────────────────────────────────────────┘
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * ICE Servers - Help browsers find each other across the internet
 *
 * STUN servers: Free, help discover your public IP
 * TURN servers: Relay traffic when direct connection fails (required for symmetric NAT)
 *
 * Using Open Relay Project (free 20GB/month) + Google STUN servers
 */
const ICE_SERVERS = [
	// STUN servers (free, for NAT traversal)
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
	{ urls: 'stun:stun2.l.google.com:19302' },
	{ urls: 'stun:stun3.l.google.com:19302' },
	{ urls: 'stun:stun4.l.google.com:19302' },

	// TURN servers (relay for when direct connection fails)
	// Open Relay Project - free, production-ready TURN server
	{
		urls: 'turn:openrelay.metered.ca:80',
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
	{
		urls: 'turn:openrelay.metered.ca:443',
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
	{
		urls: 'turn:openrelay.metered.ca:443?transport=tcp',
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
	// TURNS (TLS) for strict firewalls
	{
		urls: 'turns:openrelay.metered.ca:443',
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
];

/**
 * Media Constraints - Camera/mic settings
 *
 * Strategy: Capture at HIGH quality, let WebRTC adapt for network
 * - We request the best the device can offer
 * - WebRTC will automatically lower quality if bandwidth is limited
 * - iPhone 16 Pro Max can do 4K, older phones will give what they can
 */
const MEDIA_CONSTRAINTS = {
	video: {
		// Request high quality - device will give its best
		width: { ideal: 1920, max: 3840 }, // Up to 4K
		height: { ideal: 1080, max: 2160 }, // Up to 4K
		frameRate: { ideal: 30, max: 60 }, // Smooth video
		facingMode: 'user', // Front camera
	},
	audio: {
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: true, // Normalize volume levels
	},
};

/**
 * Bandwidth limits for different quality levels
 * WebRTC will try to stay within these limits
 */
const QUALITY_PRESETS = {
	high: {
		maxBitrate: 2500000, // 2.5 Mbps - Great quality
		maxFramerate: 30,
	},
	medium: {
		maxBitrate: 1000000, // 1 Mbps - Good quality
		maxFramerate: 24,
	},
	low: {
		maxBitrate: 500000, // 500 Kbps - Acceptable
		maxFramerate: 15,
	},
};

// =============================================================================
// STATE - Variables that track our current state
// =============================================================================

let localStream = null; // Our camera/mic stream
let peerConnection = null; // WebRTC connection to the other person
let ws = null; // WebSocket connection to signaling server
let myRole = null; // 'offerer' or 'answerer'
let searchTimer = null; // Timer for searching state
let searchSeconds = 0; // Seconds spent searching

// =============================================================================
// DOM ELEMENTS
// =============================================================================

// Videos
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Containers & Overlays
const mainArea = document.getElementById('mainArea');
const localContainer = document.getElementById('localContainer');
const remoteContainer = document.getElementById('remoteContainer');
const localPlaceholder = document.getElementById('localPlaceholder');
const remotePlaceholder = document.getElementById('remotePlaceholder');
const searchingOverlay = document.getElementById('searchingOverlay');
const searchTimerEl = document.getElementById('searchTimer');

// Labels
const localLabel = document.getElementById('localLabel');
const remoteLabel = document.getElementById('remoteLabel');

// Status
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Online counter
const onlineCount = document.getElementById('onlineCount');

// Quality badge
const qualityBadge = document.getElementById('qualityBadge');
const qualityDot = document.getElementById('qualityDot');
const qualityText = document.getElementById('qualityText');

// Buttons
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const stopBtn = document.getElementById('stopBtn');
const micBtn = document.getElementById('micBtn');
const videoToggleBtn = document.getElementById('videoToggleBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// =============================================================================
// UI STATE MANAGEMENT
// =============================================================================

/**
 * App states: 'idle' | 'searching' | 'connected'
 */
let appState = 'idle';

/**
 * Update the entire UI based on app state
 */
function updateUI(state) {
	appState = state;

	switch (state) {
		case 'idle':
			// Status
			statusIndicator.className = 'status-indicator ready';
			statusText.textContent = 'Ready to connect';

			// Placeholders
			remotePlaceholder.classList.remove('hidden');
			searchingOverlay.classList.remove('active');
			remoteLabel.classList.add('hidden');

			// Buttons
			startBtn.classList.remove('hidden');
			skipBtn.classList.add('hidden');
			stopBtn.classList.add('hidden');

			// Quality badge
			qualityBadge.classList.remove('visible');

			// PIP mode off and reset swap
			mainArea.classList.remove('pip-mode');
			mainArea.classList.remove('swapped');

			// Stop timer
			stopSearchTimer();
			break;

		case 'searching':
			// Status
			statusIndicator.className = 'status-indicator searching';
			statusText.textContent = 'Searching...';

			// Placeholders
			remotePlaceholder.classList.add('hidden');
			searchingOverlay.classList.add('active');
			remoteLabel.classList.add('hidden');

			// Reset swap state when searching
			mainArea.classList.remove('swapped');

			// Buttons
			startBtn.classList.add('hidden');
			skipBtn.classList.add('hidden');
			stopBtn.classList.remove('hidden');

			// Start timer
			startSearchTimer();
			break;

		case 'connected':
			// Status
			statusIndicator.className = 'status-indicator connected';
			statusText.textContent = 'Connected';

			// Placeholders
			remotePlaceholder.classList.add('hidden');
			searchingOverlay.classList.remove('active');
			remoteLabel.classList.remove('hidden');

			// Show remote video
			remoteVideo.classList.add('active');

			// Buttons
			startBtn.classList.add('hidden');
			skipBtn.classList.remove('hidden');
			stopBtn.classList.remove('hidden');

			// Quality badge
			qualityBadge.classList.add('visible');

			// PIP mode on mobile
			mainArea.classList.add('pip-mode');

			// Stop timer
			stopSearchTimer();
			break;
	}
}

/**
 * Update status text (for intermediate states)
 */
function setStatus(text, state = '') {
	statusText.textContent = text;

	// Map old states to new indicator classes
	if (state === 'waiting') {
		statusIndicator.className = 'status-indicator searching';
	} else if (state === 'connected') {
		statusIndicator.className = 'status-indicator connected';
	} else if (state === 'disconnected' || state === 'error') {
		statusIndicator.className = 'status-indicator error';
	}
}

/**
 * Update quality indicator
 */
function updateQualityBadge(quality) {
	qualityDot.className = 'quality-dot';

	switch (quality) {
		case 'high':
			qualityText.textContent = 'HD';
			break;
		case 'medium':
			qualityText.textContent = 'SD';
			qualityDot.classList.add('medium');
			break;
		case 'low':
			qualityText.textContent = 'Low';
			qualityDot.classList.add('low');
			break;
	}
}

// =============================================================================
// SEARCH TIMER
// =============================================================================

function startSearchTimer() {
	searchSeconds = 0;
	searchTimerEl.textContent = '0:00';

	searchTimer = setInterval(() => {
		searchSeconds++;
		const mins = Math.floor(searchSeconds / 60);
		const secs = searchSeconds % 60;
		searchTimerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
	}, 1000);
}

function stopSearchTimer() {
	if (searchTimer) {
		clearInterval(searchTimer);
		searchTimer = null;
	}
	searchSeconds = 0;
}

// =============================================================================
// MEDIA - Camera and Microphone
// =============================================================================

/**
 * Get access to camera and microphone
 *
 * Returns a MediaStream that we can:
 * 1. Display in our local video element
 * 2. Send to the other person via WebRTC
 */
async function getLocalMedia() {
	try {
		// If we already have a stream (from auto-preview), reuse it
		if (localStream && localStream.active) {
			console.log('[Media] Reusing existing stream');
			return true;
		}

		setStatus('Requesting camera access...');

		localStream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);

		// Show our own video (muted so we don't hear ourselves)
		localVideo.srcObject = localStream;

		// Explicitly call play() for Safari and older browsers
		try {
			await localVideo.play();
		} catch (playErr) {
			console.log('[Media] Auto-play handled by browser:', playErr.message);
		}

		console.log('[Media] Got local stream');
		return true;
	} catch (err) {
		console.error('[Media] Failed to get media:', err);
		setStatus('Camera access denied. Please allow camera access.', 'disconnected');
		return false;
	}
}

/**
 * Stop all media tracks (camera/mic off)
 */
function stopLocalMedia() {
	if (localStream) {
		localStream.getTracks().forEach((track) => track.stop());
		localStream = null;
		localVideo.srcObject = null;
	}
}

// =============================================================================
// WEBSOCKET - Connection to Signaling Server
// =============================================================================

let wsReconnectAttempts = 0;
let wsIntentionalClose = false; // Flag to prevent reconnection after user clicks Stop
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_BASE_DELAY = 1000; // 1 second

/**
 * Connect to the signaling server via WebSocket
 */
function connectWebSocket() {
	// Build WebSocket URL (same host as the page, but /ws path)
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const wsUrl = `${protocol}//${window.location.host}/ws`;

	console.log('[WebSocket] Connecting to', wsUrl);

	try {
		ws = new WebSocket(wsUrl);
	} catch (err) {
		console.error('[WebSocket] Failed to create connection:', err);
		handleWsReconnect();
		return;
	}

	// ----- WebSocket Event Handlers -----

	ws.onopen = () => {
		console.log('[WebSocket] Connected');
		wsReconnectAttempts = 0; // Reset on successful connection
		setStatus('Connected to server. Finding a partner...', 'waiting');

		// Immediately request to join the queue
		sendMessage({ type: 'join' });
	};

	ws.onmessage = (event) => {
		const message = JSON.parse(event.data);
		handleServerMessage(message);
	};

	ws.onclose = (event) => {
		console.log(
			'[WebSocket] Disconnected, code:',
			event.code,
			'reason:',
			event.reason,
			'intentional:',
			wsIntentionalClose,
		);

		// If we were intentionally disconnected (user clicked stop), don't reconnect
		if (wsIntentionalClose || event.code === 1000 || event.wasClean) {
			wsIntentionalClose = false; // Reset flag
			setStatus('Disconnected from server', 'disconnected');
			updateUI('idle');
			return;
		}

		// Otherwise, try to reconnect
		handleWsReconnect();
	};

	ws.onerror = (err) => {
		console.error('[WebSocket] Error:', err);
		// onerror is always followed by onclose, so reconnect will be handled there
	};
}

/**
 * Handle WebSocket reconnection with exponential backoff
 */
function handleWsReconnect() {
	if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
		console.error('[WebSocket] Max reconnect attempts reached');
		setStatus('Connection failed. Please refresh the page.', 'disconnected');
		updateUI('idle');
		return;
	}

	wsReconnectAttempts++;
	const delay = WS_RECONNECT_BASE_DELAY * Math.pow(2, wsReconnectAttempts - 1); // Exponential backoff
	console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${wsReconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})`);

	setStatus(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`, 'waiting');

	setTimeout(() => {
		if (!ws || ws.readyState === WebSocket.CLOSED) {
			connectWebSocket();
		}
	}, delay);
}

/**
 * Send a message to the signaling server
 */
function sendMessage(message) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
		console.log('[WebSocket] Sent:', message.type);
	}
}

/**
 * Handle messages from the signaling server
 *
 * This is where we react to different events:
 * - queued: We're waiting for a partner
 * - matched: Found a partner, start WebRTC
 * - offer/answer/ice: WebRTC signaling data
 * - peer-left: Partner disconnected
 */
function handleServerMessage(message) {
	console.log('[WebSocket] Received:', message.type);

	switch (message.type) {
		case 'queued':
			setStatus('Looking for someone...', 'waiting');
			updateUI('searching');
			break;

		case 'matched':
			// We found a partner!
			myRole = message.role;
			setStatus(`Matched! Connecting...`, 'waiting');

			// Create the WebRTC connection
			createPeerConnection();

			// If we're the offerer, we initiate the connection
			if (myRole === 'offerer') {
				createAndSendOffer();
			}
			// If answerer, we wait for the offer
			break;

		case 'offer':
			// We received an offer from the other person
			handleOffer(message.sdp);
			break;

		case 'answer':
			// We received an answer to our offer
			handleAnswer(message.sdp);
			break;

		case 'ice':
			// We received an ICE candidate
			handleIceCandidate(message.candidate);
			break;

		case 'peer-left':
			// Partner disconnected
			closePeerConnection();
			setStatus('Partner left. Searching...', 'waiting');
			// Auto-search for new partner
			sendMessage({ type: 'join' });
			updateUI('searching');
			break;

		case 'error':
			console.error('[Server Error]', message.message);
			setStatus('Error: ' + message.message, 'disconnected');
			break;
	}
}

// =============================================================================
// WEBRTC - The actual video connection
// =============================================================================

/**
 * Create a new RTCPeerConnection
 *
 * This is the core WebRTC object that:
 * - Manages the connection to the other person
 * - Handles video/audio tracks
 * - Deals with network traversal (ICE)
 */
function createPeerConnection() {
	console.log('[WebRTC] Creating peer connection');

	peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

	// ----- Add our local tracks -----
	// Send our video/audio to the other person
	localStream.getTracks().forEach((track) => {
		peerConnection.addTrack(track, localStream);
	});

	// ----- Handle incoming tracks -----
	// When we receive video/audio from the other person
	peerConnection.ontrack = (event) => {
		console.log('[WebRTC] Received remote track');
		remoteVideo.srcObject = event.streams[0];

		// Explicitly call play() for Safari and older browsers
		remoteVideo.play().catch((err) => {
			console.log('[WebRTC] Remote video auto-play handled by browser:', err.message);
		});

		updateUI('connected');

		// Start monitoring connection quality after connected
		startQualityMonitoring();
	};

	// ----- ICE Candidate Handling (Trickle ICE) -----
	// ICE candidates are potential connection paths (IP addresses, ports)
	// We send each one to the other person as they're discovered
	peerConnection.onicecandidate = (event) => {
		if (event.candidate) {
			console.log('[WebRTC] New ICE candidate');
			sendMessage({
				type: 'ice',
				candidate: event.candidate.toJSON(),
			});
		}
	};

	// ----- Connection State Monitoring -----
	peerConnection.onconnectionstatechange = () => {
		console.log('[WebRTC] Connection state:', peerConnection.connectionState);

		switch (peerConnection.connectionState) {
			case 'connected':
				updateUI('connected');
				// Apply initial bandwidth limits (start with high quality)
				applyBandwidthLimit('high');
				break;
			case 'disconnected':
			case 'failed':
				setStatus('Connection lost', 'disconnected');
				stopQualityMonitoring();
				break;
		}
	};

	// Log ICE connection state and handle failures
	peerConnection.oniceconnectionstatechange = () => {
		const state = peerConnection.iceConnectionState;
		console.log('[WebRTC] ICE state:', state);

		if (state === 'failed') {
			console.log('[WebRTC] ICE failed, attempting restart...');
			attemptIceRestart();
		} else if (state === 'disconnected') {
			// Give it a moment to recover before attempting restart
			setTimeout(() => {
				if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
					console.log('[WebRTC] ICE still disconnected, attempting restart...');
					attemptIceRestart();
				}
			}, 3000);
		}
	};
}

/**
 * Attempt to restart ICE when connection fails
 * This can help recover from temporary network issues
 */
async function attemptIceRestart() {
	if (!peerConnection || !ws || ws.readyState !== WebSocket.OPEN) {
		console.log('[WebRTC] Cannot restart ICE - no connection');
		return;
	}

	try {
		// Create a new offer with ICE restart flag
		const offer = await peerConnection.createOffer({ iceRestart: true });
		await peerConnection.setLocalDescription(offer);

		// Send the new offer to the peer
		sendMessage({
			type: 'offer',
			sdp: offer.sdp,
		});

		console.log('[WebRTC] ICE restart offer sent');
	} catch (err) {
		console.error('[WebRTC] ICE restart failed:', err);
		// If ICE restart fails, the connection is likely unrecoverable
		setStatus('Connection failed. Click Skip to find a new partner.', 'disconnected');
	}
}

// =============================================================================
// ADAPTIVE QUALITY - Adjust video quality based on network conditions
// =============================================================================

let qualityMonitorInterval = null;
let currentQuality = 'high';
let consecutiveBadStats = 0;

/**
 * Apply bandwidth limits to the video sender
 *
 * This tells WebRTC "don't send more than X bits per second"
 * WebRTC will automatically reduce resolution/framerate to stay within limit
 */
async function applyBandwidthLimit(quality) {
	if (!peerConnection) return;

	const preset = QUALITY_PRESETS[quality];
	if (!preset) return;

	// Get the video sender
	const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
	if (!sender) return;

	try {
		const params = sender.getParameters();

		// Set encoding parameters
		if (!params.encodings || params.encodings.length === 0) {
			params.encodings = [{}];
		}

		params.encodings[0].maxBitrate = preset.maxBitrate;
		params.encodings[0].maxFramerate = preset.maxFramerate;

		await sender.setParameters(params);

		currentQuality = quality;
		updateQualityBadge(quality);
		console.log(`[Quality] Applied ${quality} preset: ${preset.maxBitrate / 1000}kbps @ ${preset.maxFramerate}fps`);
	} catch (err) {
		console.error('[Quality] Failed to apply bandwidth limit:', err);
	}
}

/**
 * Start monitoring connection quality
 *
 * Checks stats every 3 seconds and adjusts quality if needed
 */
function startQualityMonitoring() {
	if (qualityMonitorInterval) return;

	console.log('[Quality] Starting quality monitoring');

	qualityMonitorInterval = setInterval(async () => {
		if (!peerConnection) {
			stopQualityMonitoring();
			return;
		}

		try {
			const stats = await peerConnection.getStats();
			analyzeStats(stats);
		} catch (err) {
			console.error('[Quality] Failed to get stats:', err);
		}
	}, 3000); // Check every 3 seconds
}

/**
 * Stop quality monitoring
 */
function stopQualityMonitoring() {
	if (qualityMonitorInterval) {
		clearInterval(qualityMonitorInterval);
		qualityMonitorInterval = null;
		consecutiveBadStats = 0;
	}
}

/**
 * Analyze WebRTC stats and adjust quality if needed
 *
 * We look at:
 * - Packet loss: If > 5%, connection is struggling
 * - Round trip time: If > 300ms, connection is slow
 */
function analyzeStats(stats) {
	let packetLoss = 0;
	let roundTripTime = 0;
	let bytesSent = 0;

	stats.forEach((report) => {
		// Get outbound video stats
		if (report.type === 'outbound-rtp' && report.kind === 'video') {
			if (report.packetsLost !== undefined && report.packetsSent > 0) {
				packetLoss = (report.packetsLost / report.packetsSent) * 100;
			}
			bytesSent = report.bytesSent || 0;
		}

		// Get round trip time from candidate-pair
		if (report.type === 'candidate-pair' && report.state === 'succeeded') {
			roundTripTime = report.currentRoundTripTime * 1000 || 0; // Convert to ms
		}
	});

	console.log(
		`[Quality] Stats - Loss: ${packetLoss.toFixed(1)}%, RTT: ${roundTripTime.toFixed(0)}ms, Sent: ${(
			bytesSent /
			1024 /
			1024
		).toFixed(1)}MB`,
	);

	// Decide if we need to change quality
	const isConnectionBad = packetLoss > 5 || roundTripTime > 300;
	const isConnectionGood = packetLoss < 1 && roundTripTime < 100;

	if (isConnectionBad) {
		consecutiveBadStats++;

		// Downgrade after 2 consecutive bad readings
		if (consecutiveBadStats >= 2) {
			if (currentQuality === 'high') {
				applyBandwidthLimit('medium');
				console.log('[Quality] ⬇️ Downgrading to medium quality');
			} else if (currentQuality === 'medium') {
				applyBandwidthLimit('low');
				console.log('[Quality] ⬇️ Downgrading to low quality');
			}
			consecutiveBadStats = 0;
		}
	} else if (isConnectionGood) {
		consecutiveBadStats = 0;

		// Upgrade if connection is consistently good
		if (currentQuality === 'low') {
			applyBandwidthLimit('medium');
			console.log('[Quality] ⬆️ Upgrading to medium quality');
		} else if (currentQuality === 'medium') {
			applyBandwidthLimit('high');
			console.log('[Quality] ⬆️ Upgrading to high quality');
		}
	} else {
		consecutiveBadStats = 0;
	}
}

/**
 * Create and send an offer (only called by offerer)
 *
 * The offer contains our media capabilities and starts the negotiation
 */
async function createAndSendOffer() {
	try {
		console.log('[WebRTC] Creating offer');

		// Create offer
		const offer = await peerConnection.createOffer();

		// Set as our local description (this starts ICE gathering)
		await peerConnection.setLocalDescription(offer);

		// Send offer to the other person via signaling server
		sendMessage({
			type: 'offer',
			sdp: peerConnection.localDescription.sdp,
		});
	} catch (err) {
		console.error('[WebRTC] Failed to create offer:', err);
	}
}

/**
 * Handle receiving an offer (only called by answerer)
 *
 * We set the offer as remote description, then create and send an answer
 */
async function handleOffer(sdp) {
	try {
		console.log('[WebRTC] Received offer, creating answer');

		// Set the offer as remote description
		await peerConnection.setRemoteDescription({
			type: 'offer',
			sdp: sdp,
		});

		// Create answer
		const answer = await peerConnection.createAnswer();

		// Set as our local description
		await peerConnection.setLocalDescription(answer);

		// Send answer back
		sendMessage({
			type: 'answer',
			sdp: peerConnection.localDescription.sdp,
		});
	} catch (err) {
		console.error('[WebRTC] Failed to handle offer:', err);
	}
}

/**
 * Handle receiving an answer (only called by offerer)
 *
 * This completes the offer/answer exchange
 */
async function handleAnswer(sdp) {
	try {
		console.log('[WebRTC] Received answer');

		await peerConnection.setRemoteDescription({
			type: 'answer',
			sdp: sdp,
		});
	} catch (err) {
		console.error('[WebRTC] Failed to handle answer:', err);
	}
}

/**
 * Handle receiving an ICE candidate
 *
 * Each ICE candidate is a potential path to connect to the other person
 */
async function handleIceCandidate(candidate) {
	try {
		if (peerConnection && candidate) {
			await peerConnection.addIceCandidate(candidate);
			console.log('[WebRTC] Added ICE candidate');
		}
	} catch (err) {
		console.error('[WebRTC] Failed to add ICE candidate:', err);
	}
}

/**
 * Close the peer connection
 */
function closePeerConnection() {
	stopQualityMonitoring(); // Stop monitoring when closing

	if (peerConnection) {
		peerConnection.close();
		peerConnection = null;
	}
	remoteVideo.srcObject = null;
	myRole = null;
	currentQuality = 'high'; // Reset for next connection
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up everything when leaving
 */
function cleanup() {
	closePeerConnection();

	if (ws) {
		wsIntentionalClose = true; // Prevent auto-reconnect
		ws.close(1000, 'User disconnected'); // Close with normal closure code
		ws = null;
	}
}

// =============================================================================
// BUTTON HANDLERS
// =============================================================================

/**
 * "Start" button clicked - Begin chatting
 */
startBtn.onclick = async () => {
	// Reset reconnection state for fresh start
	wsReconnectAttempts = 0;
	wsIntentionalClose = false;

	// Step 1: Get camera access
	const hasMedia = await getLocalMedia();
	if (!hasMedia) return;

	// Show local video
	localVideo.classList.add('active');
	localPlaceholder.classList.add('hidden');
	localLabel.classList.remove('hidden');

	// Step 2: Connect to signaling server
	updateUI('searching');
	connectWebSocket();
};

/**
 * "Skip" button clicked - Find new partner
 */
skipBtn.onclick = () => {
	// Close current peer connection
	closePeerConnection();

	// Tell server we want a new partner
	sendMessage({ type: 'leave' });
	sendMessage({ type: 'join' });

	updateUI('searching');
	setStatus('Skipping... Looking for someone new', 'waiting');
};

/**
 * "Stop" button clicked - End session
 */
stopBtn.onclick = () => {
	// Tell server we're leaving
	sendMessage({ type: 'leave' });

	// Clean up
	cleanup();
	stopLocalMedia();

	// Reset videos and placeholders
	localVideo.classList.remove('active');
	localPlaceholder.classList.remove('hidden');
	localLabel.classList.add('hidden');
	remoteVideo.classList.remove('active');

	updateUI('idle');
	setStatus('Ready to connect', '');
};

/**
 * Mic toggle button
 */
micBtn.onclick = () => {
	if (!localStream) return;

	const audioTrack = localStream.getAudioTracks()[0];
	if (audioTrack) {
		audioTrack.enabled = !audioTrack.enabled;
		micBtn.classList.toggle('muted', !audioTrack.enabled);
	}
};

/**
 * Video toggle button
 */
videoToggleBtn.onclick = () => {
	if (!localStream) return;

	const videoTrack = localStream.getVideoTracks()[0];
	if (videoTrack) {
		videoTrack.enabled = !videoTrack.enabled;
		videoToggleBtn.classList.toggle('muted', !videoTrack.enabled);

		// Show/hide local video based on state
		if (!videoTrack.enabled) {
			localVideo.classList.remove('active');
			localPlaceholder.classList.remove('hidden');
		} else {
			localVideo.classList.add('active');
			localPlaceholder.classList.add('hidden');
		}
	}
};

/**
 * Fullscreen toggle button - Coming soon
 */
fullscreenBtn.onclick = () => {
	// Show coming soon message
	const originalTitle = fullscreenBtn.getAttribute('title');
	fullscreenBtn.setAttribute('title', 'Coming soon!');
	fullscreenBtn.classList.add('disabled');

	// Show a brief tooltip-style notification
	const tooltip = document.createElement('div');
	tooltip.textContent = 'Fullscreen coming soon!';
	tooltip.style.cssText = `
		position: fixed;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 14px;
		z-index: 1000;
		animation: fadeInOut 2s ease forwards;
	`;
	document.body.appendChild(tooltip);

	// Remove tooltip after animation
	setTimeout(() => {
		tooltip.remove();
		fullscreenBtn.setAttribute('title', originalTitle);
		fullscreenBtn.classList.remove('disabled');
	}, 2000);
};

/**
 * Listen for fullscreen changes to update icon
 */
function handleFullscreenChange() {
	const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
	fullscreenBtn.classList.toggle('fullscreen-active', isFullscreen);
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

// =============================================================================
// PIP VIDEO SWAP (Mobile only)
// =============================================================================

/**
 * Check if we're on a mobile device (small screen)
 */
function isMobileScreen() {
	return window.innerWidth <= 768;
}

/**
 * Toggle swap between local and remote video on mobile PIP mode
 * Tapping the small PIP video makes it the big one
 */
function setupVideoSwap() {
	// Local container click handler
	localContainer.addEventListener('click', (e) => {
		// Only work in PIP mode (connected state on mobile)
		if (!mainArea.classList.contains('pip-mode') || !isMobileScreen()) return;

		// If we're swapped (local is big), don't do anything on local click
		if (mainArea.classList.contains('swapped')) return;

		// Swap: make local big
		mainArea.classList.add('swapped');
	});

	// Remote container click handler
	remoteContainer.addEventListener('click', (e) => {
		// Only work in PIP mode (connected state on mobile)
		if (!mainArea.classList.contains('pip-mode') || !isMobileScreen()) return;

		// If we're not swapped (remote is big), don't do anything on remote click
		if (!mainArea.classList.contains('swapped')) return;

		// Unswap: make remote big again
		mainArea.classList.remove('swapped');
	});
}

// Initialize video swap functionality
setupVideoSwap();

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log('[App] drift. video chat loaded');
updateUI('idle');

/**
 * Auto-show camera preview on page load if permission was previously granted
 * This creates a better first impression - users see themselves immediately
 */
async function autoShowCameraPreview() {
	try {
		// Check if camera permission was already granted
		const permissionStatus = await navigator.permissions.query({ name: 'camera' });

		if (permissionStatus.state === 'granted') {
			console.log('[Auto Preview] Camera permission already granted, showing preview');

			// Get camera stream
			localStream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
			localVideo.srcObject = localStream;

			// Explicitly call play() for Safari and older browsers
			try {
				await localVideo.play();
			} catch (playErr) {
				console.log('[Auto Preview] Auto-play handled by browser:', playErr.message);
			}

			// Show local video
			localVideo.classList.add('active');
			localPlaceholder.classList.add('hidden');
			localLabel.classList.remove('hidden');

			console.log('[Auto Preview] Camera preview active');
		} else {
			console.log('[Auto Preview] Camera permission not yet granted, waiting for user action');
		}
	} catch (err) {
		// Permission API not supported or error - that's okay, user will click Start
		console.log('[Auto Preview] Could not auto-show camera:', err.message);
	}
}

// Try to show camera preview on load
autoShowCameraPreview();

// =============================================================================
// ONLINE USERS COUNTER
// =============================================================================

let onlineCounterInterval = null;

/**
 * Fetch and update online users count from the server
 */
async function updateOnlineCount() {
	try {
		const response = await fetch('/stats');
		if (!response.ok) throw new Error('Failed to fetch stats');

		const stats = await response.json();
		const count = stats.activePeers || stats.peers || 0;

		// Animate the count change
		if (onlineCount) {
			onlineCount.textContent = count;
		}
	} catch (err) {
		console.log('[Online] Failed to fetch online count:', err.message);
		// Keep showing last known value or dash
		if (onlineCount && onlineCount.textContent === '-') {
			onlineCount.textContent = '-';
		}
	}
}

/**
 * Start polling for online users count
 */
function startOnlineCounter() {
	// Fetch immediately
	updateOnlineCount();

	// Then poll every 10 seconds
	onlineCounterInterval = setInterval(updateOnlineCount, 10000);
}

/**
 * Stop polling (e.g., when tab is hidden to save resources)
 */
function stopOnlineCounter() {
	if (onlineCounterInterval) {
		clearInterval(onlineCounterInterval);
		onlineCounterInterval = null;
	}
}

// Start the online counter when page loads
startOnlineCounter();

// Pause when tab is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		stopOnlineCounter();
	} else {
		startOnlineCounter();
	}
});
