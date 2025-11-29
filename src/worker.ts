/**
 * Cloudflare Worker Entry Point
 *
 * This worker handles:
 * 1. Static file serving from /public (via Cloudflare Assets)
 * 2. WebSocket upgrade requests routed to Durable Object
 * 3. API endpoints (stats, health checks)
 *
 * Architecture:
 * - Worker: Handles HTTP routing, serves static files
 * - Durable Object (SignalingServer): Handles WebSocket state
 */

// Re-export the Durable Object class
export { SignalingServer } from './signaling';

// Environment bindings
interface Env {
	SIGNALING: DurableObjectNamespace;
	ASSETS: Fetcher;
	ENVIRONMENT: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// ----- WebSocket endpoints -> Durable Object -----
		if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
			// Get a single global instance of the Durable Object
			// Using a fixed ID so all users connect to the same matchmaking pool
			const id = env.SIGNALING.idFromName('global-signaling');
			const stub = env.SIGNALING.get(id);

			// Forward request to Durable Object
			return stub.fetch(request);
		}

		// ----- Stats endpoint -----
		if (url.pathname === '/stats') {
			const id = env.SIGNALING.idFromName('global-signaling');
			const stub = env.SIGNALING.get(id);
			return stub.fetch(request);
		}

		// ----- Health check -----
		if (url.pathname === '/health') {
			return new Response(
				JSON.stringify({
					status: 'ok',
					environment: env.ENVIRONMENT,
					timestamp: new Date().toISOString(),
				}),
				{
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}

		// ----- Static files from /public -----
		// Cloudflare Assets handles this automatically based on wrangler.toml [assets]
		try {
			// Try to serve static asset
			const response = await env.ASSETS.fetch(request);

			// If asset found, return it
			if (response.status !== 404) {
				return response;
			}
		} catch (e) {
			// Asset fetching failed, continue to fallback
		}

		// ----- SPA Fallback: serve index.html for client-side routing -----
		// This handles direct navigation to routes like /room/123
		try {
			const indexUrl = new URL('/index.html', request.url);
			const indexRequest = new Request(indexUrl.toString(), request);
			const indexResponse = await env.ASSETS.fetch(indexRequest);
			if (indexResponse.status === 200) {
				return new Response(indexResponse.body, {
					headers: {
						...Object.fromEntries(indexResponse.headers),
						'Content-Type': 'text/html; charset=utf-8',
					},
				});
			}
		} catch (e) {
			// Index.html not found
		}

		// ----- 404 Not Found -----
		return new Response('Not Found', { status: 404 });
	},
};
