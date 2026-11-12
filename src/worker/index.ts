import { GROUP_ID_PATTERN, INVITE_ID_PATTERN } from '../sync/protocol';
import { json } from './http';

export { Invite } from './invite';
export { SyncGroup } from './syncGroup';

/**
 * Only /api/* reaches this code (see run_worker_first in wrangler.jsonc); the
 * app itself is served from static assets.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const sync = /^\/api\/sync\/([^/]+)(\/live)?$/.exec(url.pathname);
    const invite = /^\/api\/invite\/([^/]+)(\/claim)?$/.exec(url.pathname);
    const groupId = sync?.[1];
    const inviteId = invite?.[1];
    const target =
      groupId && GROUP_ID_PATTERN.test(groupId)
        ? { kind: 'sync' as const, id: groupId }
        : inviteId && INVITE_ID_PATTERN.test(inviteId)
          ? { kind: 'invite' as const, id: inviteId }
          : null;
    if (!target) return json({ error: 'Not found' }, 404);

    // Same-site only. (Auth is a bearer token, not cookies, so this is defense
    // in depth rather than CSRF protection.)
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== url.origin) return json({ error: 'Forbidden' }, 403);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.SYNC_RATE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'Too many requests' }, 429);

    if (target.kind === 'invite') {
      // Invites are short codes, so guessing is throttled much harder.
      const { success: ok } = await env.INVITE_RATE_LIMIT.limit({ key: ip });
      if (!ok) return json({ error: 'Too many requests' }, 429);
      return env.INVITES.get(env.INVITES.idFromName(target.id)).fetch(request);
    }
    return env.SYNC_GROUPS.get(env.SYNC_GROUPS.idFromName(target.id)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
