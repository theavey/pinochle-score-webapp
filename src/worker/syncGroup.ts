import { DurableObject } from 'cloudflare:workers';
import {
  AUTH_TOKEN_PATTERN,
  LIVE_AUTH_PREFIX,
  LIVE_PROTOCOL,
  MAX_BODY_BYTES,
  constantTimeEqual,
  isSyncPut,
} from '../sync/protocol';
import type { LiveNotice, SyncGet, SyncPutOk } from '../sync/protocol';
import { json } from './http';

/** Groups nobody has written to for this long are deleted. */
const IDLE_LIMIT_MS = 400 * 24 * 60 * 60 * 1000;

interface Row extends Record<string, SqlStorageValue> {
  auth_hash: string;
  version: number;
  data: string;
  updated_at: number;
}

/**
 * One sync group: the latest encrypted copy of a group's data, plus the
 * devices currently listening for changes. It can't read the data (it's
 * encrypted on the devices) and stores only a hash of the access token.
 */
export class SyncGroup extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ensureTable();
  }

  private ensureTable(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sync (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auth_hash TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }

  /** Erase everything this group stored (the object itself lives on, empty). */
  private async erase(reason: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, reason);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ensureTable();
  }

  override async fetch(request: Request): Promise<Response> {
    const live = new URL(request.url).pathname.endsWith('/live');
    const token = live ? liveToken(request) : bearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const hash = await sha256Hex(token);
    const row = this.row();
    const authorized = row !== null && constantTimeEqual(row.auth_hash, hash);

    if (live) {
      if (request.headers.get('Upgrade') !== 'websocket')
        return json({ error: 'Expected WebSocket' }, 426);
      if (!authorized) return json({ error: row ? 'Unauthorized' : 'Not found' }, row ? 401 : 404);
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { 'Sec-WebSocket-Protocol': LIVE_PROTOCOL },
      });
    }

    switch (request.method) {
      case 'GET': {
        if (!row) return json({ error: 'Not found' }, 404);
        if (!authorized) return json({ error: 'Unauthorized' }, 401);
        return json({ version: row.version, data: row.data } satisfies SyncGet);
      }
      case 'PUT':
        return this.put(request, row, authorized, hash);
      case 'DELETE': {
        if (!row) return new Response(null, { status: 204 });
        if (!authorized) return json({ error: 'Unauthorized' }, 401);
        await this.erase('Sync group reset');
        return new Response(null, { status: 204 });
      }
      default:
        return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, PUT, DELETE' });
    }
  }

  private async put(
    request: Request,
    row: Row | null,
    authorized: boolean,
    hash: string,
  ): Promise<Response> {
    if (row && !authorized) return json({ error: 'Unauthorized' }, 401);
    const declared = Number(request.headers.get('Content-Length') ?? '0');
    if (declared > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'Bad request' }, 400);
    }
    if (!isSyncPut(body)) return json({ error: 'Bad request' }, 400);

    const current = row?.version ?? 0;
    if (body.baseVersion !== current) return json({ version: current }, 409);

    const version = current + 1;
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO sync (id, auth_hash, version, data, updated_at) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data,
         updated_at = excluded.updated_at`,
      hash,
      version,
      body.data,
      now,
    );
    await this.ctx.storage.setAlarm(now + IDLE_LIMIT_MS);

    const notice = JSON.stringify({ version } satisfies LiveNotice);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(notice);
      } catch {
        /* closing; the device re-syncs when it reconnects */
      }
    }
    return json({ version } satisfies SyncPutOk);
  }

  /** Devices only listen; nothing they send is needed. */
  override webSocketMessage(): void {
    /* ignore */
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code === 1005 ? 1000 : code, 'Closed');
    } catch {
      /* already closed */
    }
  }

  /** Delete groups that have been idle for over a year. */
  override async alarm(): Promise<void> {
    const row = this.row();
    if (!row) return;
    if (Date.now() - row.updated_at >= IDLE_LIMIT_MS) {
      await this.erase('Sync group expired');
    } else {
      await this.ctx.storage.setAlarm(row.updated_at + IDLE_LIMIT_MS);
    }
  }

  private row(): Row | null {
    return this.ctx.storage.sql.exec<Row>('SELECT * FROM sync WHERE id = 1').toArray()[0] ?? null;
  }
}

function bearerToken(request: Request): string | null {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '');
  const token = m?.[1];
  return token && AUTH_TOKEN_PATTERN.test(token) ? token : null;
}

/** Browsers can't set headers on a WebSocket, so the token comes as a subprotocol. */
function liveToken(request: Request): string | null {
  const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
    .split(',')
    .map((s) => s.trim());
  if (!offered.includes(LIVE_PROTOCOL)) return null;
  const token = offered.find((p) => p.startsWith(LIVE_AUTH_PREFIX))?.slice(LIVE_AUTH_PREFIX.length);
  return token && AUTH_TOKEN_PATTERN.test(token) ? token : null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
