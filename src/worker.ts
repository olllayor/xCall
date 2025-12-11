export { SignalingServer } from './signaling';

interface Env {
	SIGNALING: DurableObjectNamespace;
	ASSETS: Fetcher;
	ENVIRONMENT: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
			const id = env.SIGNALING.idFromName('global-signaling');
			const stub = env.SIGNALING.get(id);

			return stub.fetch(request);
		}

		if (url.pathname === '/stats') {
			const id = env.SIGNALING.idFromName('global-signaling');
			const stub = env.SIGNALING.get(id);
			return stub.fetch(request);
		}

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

		try {
			const response = await env.ASSETS.fetch(request);

			if (response.status !== 404) {
				return response;
			}
		} catch (e) {
			throw e;
		}

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
			throw e;
		}

		return new Response('Not Found', { status: 404 });
	},
};
