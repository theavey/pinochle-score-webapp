import { DurableObject } from 'cloudflare:workers';
import { INVITE_TTL_MS, inviteLive, isInvitePut } from '../sync/protocol';
import type { InviteClaim } from '../sync/protocol';
import { json } from './http';

interface Row extends Record<string, SqlStorageValue> {
  data: string;
  expires_at: number;
}

/**
 * One invite: a sync code encrypted with a key only the invite code can
 * derive. It can be claimed once, and is deleted when claimed or after an
 * hour, whichever comes first.
 */
export class Invite extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ensureTable();
  }

  private ensureTable(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS invite (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  }

  private async forget(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ensureTable();
  }

  override async fetch(request: Request): Promise<Response> {
    const claim = new URL(request.url).pathname.endsWith('/claim');
    const now = Date.now();
    const row = this.row();
    const live = row !== null && inviteLive(row.expires_at, now);

    if (claim) {
      if (request.method !== 'POST')
        return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      if (row) await this.forget(); // one claim only, whether or not it's still live
      if (!row || !live) return json({ error: 'Not found' }, 404);
      return json({ data: row.data } satisfies InviteClaim);
    }

    if (request.method !== 'PUT')
      return json({ error: 'Method not allowed' }, 405, { Allow: 'PUT' });
    if (live) return json({ error: 'Exists' }, 409);
    const text = await request.text();
    if (text.length > 2_000) return json({ error: 'Too large' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'Bad request' }, 400);
    }
    if (!isInvitePut(body)) return json({ error: 'Bad request' }, 400);
    const expiresAt = now + INVITE_TTL_MS;
    this.ctx.storage.sql.exec(
      `INSERT INTO invite (id, data, expires_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
      body.data,
      expiresAt,
    );
    await this.ctx.storage.setAlarm(expiresAt);
    return json({ expiresAt }, 201);
  }

  override async alarm(): Promise<void> {
    await this.forget();
  }

  private row(): Row | null {
    return this.ctx.storage.sql.exec<Row>('SELECT * FROM invite WHERE id = 1').toArray()[0] ?? null;
  }
}
