# Debugging Guide for Drift Video Chat

This document outlines common issues, debugging techniques, and recommendations for improving the video chat application.

## Critical Bug Fixes Applied

### 1. ✅ WebRTC Role Assignment Bug (FIXED)

**Issue**: The Cloudflare Durable Object signaling server (`src/signaling.ts`) was assigning WebRTC roles backwards compared to the Bun server implementation.

**Location**: `src/signaling.ts:204-205`

**Problem**:
- Partner waiting in queue was being assigned `offerer` role
- New joining peer was being assigned `answerer` role
- This is backwards from the intended flow

**Fix Applied**:
```typescript
// BEFORE (incorrect):
this.sendToPeer(partnerId, { type: 'matched', role: 'offerer' });
this.sendToPeer(peerId, { type: 'matched', role: 'answerer' });

// AFTER (correct):
this.sendToPeer(partnerId, { type: 'matched', role: 'answerer' });
this.sendToPeer(peerId, { type: 'matched', role: 'offerer' });
```

**Why This Matters**: In WebRTC, the offerer creates and sends the initial SDP offer. Having consistent role assignment across both signaling implementations is critical for proper connection establishment.

## Architecture Issues

### Dual Signaling Implementation

**Issue**: The project maintains two separate signaling implementations:
1. Bun server: `server/signal/signaling.ts` + `server/signal/roomManager.ts`
2. Cloudflare: `src/signaling.ts`

**Risk**: These can drift out of sync, leading to subtle bugs like the role assignment issue.

**Recommendation**:
- Extract shared types into a common module: `shared/types.ts`
- Create shared test suite that runs against both implementations
- Consider using the same codebase with adapter pattern

### Entry Point Confusion

**Issue**: Root `index.ts` is a placeholder stub, but README originally referenced it.

**Fixed**: Updated README to use `bun run dev` script which correctly points to `server/index.ts`.

## Testing & Validation

### Current State
- ❌ No automated tests
- ❌ No integration tests for signaling
- ❌ No WebRTC connection tests
- ✅ Manual testing possible with two browser tabs

### Recommended Testing Strategy

#### Unit Tests
```bash
# Add to package.json:
"test": "bun test",
"test:watch": "bun test --watch"
```

Key areas to test:
1. Room manager matchmaking logic
2. Queue operations (enqueue/dequeue)
3. Peer cleanup on disconnect
4. Role assignment consistency

#### Integration Tests
Test both signaling implementations:
- WebSocket connection/disconnection
- Join → Queue → Match flow
- SDP offer/answer exchange
- ICE candidate relay
- Peer leave notifications

#### E2E Tests
Use Playwright or Puppeteer:
- Automated browser tests with WebRTC
- Two-tab connection flow
- Connection quality under network conditions

## WebRTC Debugging

### Browser DevTools

#### Chrome/Edge
1. Navigate to `chrome://webrtc-internals/`
2. Watch connection state, ICE candidates, and stats
3. Monitor `getStats()` output in real-time

#### Firefox
1. Navigate to `about:webrtc`
2. View connection logs and statistics

### Common WebRTC Issues

#### 1. ICE Connection Failures

**Symptoms**:
- `peerConnection.connectionState` stays in `connecting`
- No video/audio even after matching

**Debug**:
```javascript
peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE state:', peerConnection.iceConnectionState);
};

peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering:', peerConnection.iceGatheringState);
};
```

**Common Causes**:
- Restrictive firewall/NAT (need TURN servers)
- Invalid ICE servers configuration
- ICE candidates not being relayed properly

**Solution**: Add TURN servers to `ICE_SERVERS` config

#### 2. Offer/Answer Timing Issues

**Symptoms**:
- Connection never establishes
- "InvalidStateError" in console

**Debug**:
```javascript
// Add timestamps to signaling
console.log('[Timing]', new Date().toISOString(), 'offer sent');
console.log('[Timing]', new Date().toISOString(), 'answer received');
```

**Solution**: Ensure proper sequencing:
1. Offerer: `createOffer()` → `setLocalDescription()` → send offer
2. Answerer: receive offer → `setRemoteDescription()` → `createAnswer()` → `setLocalDescription()` → send answer
3. Offerer: receive answer → `setRemoteDescription()`

#### 3. Trickle ICE Not Working

**Symptoms**:
- Long wait before connection
- Some candidates not being exchanged

**Debug**:
```javascript
peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        console.log('[ICE]', event.candidate.type, event.candidate.address);
    } else {
        console.log('[ICE] Gathering complete');
    }
};
```

## Network Debugging

### Signaling Server

#### Check WebSocket Connection
```bash
# Using wscat
npm install -g wscat
wscat -c ws://localhost:3000/ws

# Send test message
{"type":"join"}
```

#### Monitor Signaling Traffic
Add logging middleware to see all messages:
```typescript
// In signaling.ts
console.log('[WS →]', message.type, JSON.stringify(message).length, 'bytes');
console.log('[WS ←]', message.type);
```

### Health Endpoints

#### Bun Server
```bash
# Health check
curl http://localhost:3000/health

# Connection stats
curl http://localhost:3000/stats
```

#### Cloudflare Worker
```bash
# Health check
curl https://your-worker.workers.dev/health

# Durable Object stats
curl https://your-worker.workers.dev/stats
```

## Performance Issues

### High Memory Usage

**Symptoms**: Server memory grows over time

**Debug**:
```typescript
// Add to roomManager.ts
export function debugMemory() {
    return {
        peers: peers.size,
        rooms: rooms.size,
        queue: queue.length,
        heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
    };
}
```

**Common Causes**:
- Peers not being cleaned up on disconnect
- Room references not being deleted
- WebSocket connections leaking

### Connection Latency

**Debug signaling latency**:
```javascript
// Client-side
const start = performance.now();
ws.send(JSON.stringify({ type: 'join' }));

ws.onmessage = (event) => {
    const latency = performance.now() - start;
    console.log('[Latency]', latency, 'ms');
};
```

## Production Monitoring Recommendations

### Metrics to Track

#### Signaling Server
- Active WebSocket connections
- Queue length over time
- Match success rate
- Average time to match
- Message throughput

#### WebRTC
- Connection success rate (P2P vs TURN)
- Time to first frame
- Average bitrate
- Packet loss percentage
- Connection drops

### Logging Best Practices

**Current**: Uses `console.log` everywhere

**Recommended**: Structured logging
```typescript
// logger.ts
export const logger = {
    info: (event: string, data?: Record<string, any>) => {
        console.log(JSON.stringify({ level: 'info', event, ...data, timestamp: Date.now() }));
    },
    error: (event: string, error: Error, data?: Record<string, any>) => {
        console.error(JSON.stringify({ level: 'error', event, error: error.message, stack: error.stack, ...data, timestamp: Date.now() }));
    },
};
```

### Error Tracking

Consider adding:
- Sentry for error tracking
- PostHog/Mixpanel for user analytics
- Custom metrics endpoint for Prometheus/Grafana

## Security Considerations

### Current Issues

1. **No rate limiting**: WebSocket connections not throttled
2. **No authentication**: Anyone can connect
3. **No CORS policy**: All origins accepted
4. **No input validation**: Message payloads not validated

### Recommended Improvements

#### Rate Limiting
```typescript
// Per-IP connection limits
const connectionCounts = new Map<string, number>();

function checkRateLimit(ip: string): boolean {
    const count = connectionCounts.get(ip) || 0;
    if (count > 10) return false; // Max 10 connections per IP
    connectionCounts.set(ip, count + 1);
    return true;
}
```

#### Input Validation
```typescript
// Validate message structure
function validateMessage(msg: unknown): msg is ClientMessage {
    if (typeof msg !== 'object' || msg === null) return false;
    // Add proper validation
    return true;
}
```

## Quick Debugging Checklist

When something doesn't work:

### Signaling Issues
- [ ] WebSocket connected? (Check browser network tab)
- [ ] Messages being sent/received? (Check WS frames)
- [ ] Server logs show proper state transitions?
- [ ] Both peers receiving `matched` event?
- [ ] Roles assigned correctly (offerer/answerer)?

### WebRTC Issues
- [ ] Camera permission granted?
- [ ] Local stream playing in preview?
- [ ] ICE candidates being generated?
- [ ] SDP offer/answer exchanged?
- [ ] `peerConnection.connectionState` reaches `connected`?
- [ ] Remote tracks being added?

### Network Issues
- [ ] Server running and accessible?
- [ ] No firewall blocking WebSocket/WebRTC?
- [ ] STUN servers reachable?
- [ ] Behind symmetric NAT? (need TURN)

## Further Resources

- [WebRTC API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [WebRTC samples](https://webrtc.github.io/samples/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Bun WebSocket API](https://bun.sh/docs/api/websockets)

## Getting Help

If you're stuck:
1. Check browser console for errors
2. Check server logs
3. Use `chrome://webrtc-internals/`
4. Review signaling message flow
5. Test with simplified two-tab setup locally
