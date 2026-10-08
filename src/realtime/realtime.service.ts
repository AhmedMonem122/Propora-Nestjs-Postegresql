import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../storage/supabase.service.js';
import { emitToOrganization } from './socket-server.js';

/**
 * Fan-out for live UI updates. Two transports, one contract:
 * - Socket.IO rooms (self-hosted long-lived servers, zero extra deps), and
 * - Supabase Realtime broadcast (works on Vercel serverless, uses the
 *   already-configured Supabase project — no new infrastructure).
 *
 * Frontend: `supabase.channel('propora:org:<orgId>')
 *   .on('broadcast', { event: '*' }, handler).subscribe()`
 * or Socket.IO: `socket.emit('join', orgId)` then `.on(event, handler)`.
 *
 * Publishing never throws: a realtime outage must not fail the request.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly supabase: SupabaseService) {}

  channelFor(organizationId: string): string {
    return `propora:org:${organizationId}`;
  }

  async publish(
    organizationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      emitToOrganization(organizationId, event, payload);
    } catch (error) {
      this.logger.warn(
        `Socket emit failed for ${event}: ${(error as Error)?.message}`,
      );
    }

    try {
      if (this.supabase.isConfigured()) {
        await this.supabase.broadcast(
          this.channelFor(organizationId),
          event,
          payload,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Realtime broadcast failed for ${event}: ${(error as Error)?.message}`,
      );
    }
  }
}
