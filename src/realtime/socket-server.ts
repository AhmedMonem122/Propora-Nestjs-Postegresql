import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function roomFor(organizationId: string): string {
  return `org:${organizationId}`;
}

export interface SocketAuthContext {
  userId: string;
  organizationId: string | null;
  email: string;
}

/**
 * Attaches a Socket.IO server to a long-lived HTTP server (local dev,
 * Docker, VPS). This is intentionally NOT used on Vercel: serverless
 * functions cannot hold the persistent connections Socket.IO needs, so
 * Vercel deployments use Supabase Realtime broadcast instead
 * (see RealtimeService). The event names and payloads are identical,
 * so one frontend client works against both transports.
 */
export function attachSocketServer(
  httpServer: HttpServer,
  opts: {
    corsOrigins: (string | RegExp)[];
    verifyToken: (token: string) => Promise<SocketAuthContext>;
    canAccessOrganization: (
      user: SocketAuthContext,
      organizationId: string,
    ) => Promise<boolean>;
  },
): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: opts.corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const fromAuth = socket.handshake.auth?.token as string | undefined;
      const fromQuery = socket.handshake.query?.token as string | undefined;
      const token = fromAuth ?? fromQuery;
      if (!token) {
        next(new Error('Missing auth token'));
        return;
      }
      socket.data.user = await opts.verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on(
      'join',
      async (
        organizationId: unknown,
        ack?: (response: { ok: boolean; error?: string }) => void,
      ) => {
        const user = socket.data.user as SocketAuthContext;
        const allowed =
          typeof organizationId === 'string' &&
          (await opts
            .canAccessOrganization(user, organizationId)
            .catch(() => false));

        if (!allowed) {
          ack?.({ ok: false, error: 'Access denied' });
          return;
        }

        await socket.join(roomFor(organizationId as string));
        ack?.({ ok: true });
      },
    );
  });

  return io;
}

/** No-op until attachSocketServer() runs — safe to call on serverless. */
export function emitToOrganization(
  organizationId: string,
  event: string,
  payload: unknown,
): void {
  io?.to(roomFor(organizationId)).emit(event, payload);
}
