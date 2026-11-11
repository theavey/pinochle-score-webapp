import { GROUP_ID_PATTERN } from '../sync/protocol';
import { json } from './http';

export { SyncGroup } from './syncGroup';

/**
 * Only /api/* reaches this code (see run_worker_first in wrangler.jsonc); the
 * app itself is served from static assets.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/sync\/([^/]+)(\/live)?$/.exec(url.pathname);
    const groupId = match?.[1];
    if (!groupId || !GROUP_ID_PATTERN.test(groupId)) return json({ error: 'Not found' }, 404);

    // Same-site only. (Auth is a bearer token, not cookies, so this is defense
    // in depth rather than CSRF protection.)
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== url.origin) return json({ error: 'Forbidden' }, 403);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.SYNC_RATE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'Too many requests' }, 429);

    const stub = env.SYNC_GROUPS.get(env.SYNC_GROUPS.idFromName(groupId));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
