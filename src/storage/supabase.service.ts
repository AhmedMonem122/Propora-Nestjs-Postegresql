import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Server-side storage (bucket admin, uploads, deletes) prefers
   * SUPABASE_SERVICE_KEY, which bypasses storage RLS policies. The anon
   * key only works when the dashboard has matching storage policies, so a
   * missing service key degrades to anon with the same API.
   */

  get bucket(): string {
    return this.configService.get<string>('SUPABASE_BUCKET', 'documents');
  }

  /**
   * Best-effort bucket bootstrap. Returns true when the bucket is usable.
   *
   * Why not throw: with a restricted (anon) key, `listBuckets` is blinded
   * by RLS and returns `[]` even when the bucket EXISTS in the dashboard —
   * throwing here would block uploads that would otherwise succeed. So a
   * failure only logs guidance and the upload itself produces the
   * definitive error.
   */
  async ensureBucket(): Promise<boolean> {
    let client: SupabaseClient;
    try {
      client = this.getClient();
    } catch (error) {
      this.logger.warn(
        `Supabase bucket check skipped: ${(error as Error)?.message}`,
      );
      return false;
    }

    const { data, error } = await client.storage.listBuckets();

    if (error) {
      this.logger.warn(`Supabase listBuckets failed: ${error.message}`);
      return false;
    }

    if (data.some((bucket) => bucket.name === this.bucket)) {
      return true;
    }

    const { error: createError } = await client.storage.createBucket(
      this.bucket,
      { public: true },
    );

    if (createError) {
      this.logger.warn(
        `Supabase bucket "${this.bucket}" is not reachable (${createError.message}). ` +
          'It may already exist but be invisible to this key (RLS), or this key may lack permission to create it. ' +
          'Set SUPABASE_SERVICE_KEY or create the bucket plus storage policies in the dashboard.',
      );
      return false;
    }

    return true;
  }

  async upload(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const client = this.getClient();

    const { error } = await client.storage
      .from(this.bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });

    if (error) {
      throw new BadRequestException(this.describeStorageError(error.message));
    }

    return this.publicUrl(path);
  }

  async delete(path: string): Promise<void> {
    const client = this.getClient();

    const { error } = await client.storage.from(this.bucket).remove([path]);

    if (error) {
      this.logger.warn(
        `Failed to delete file from Supabase storage: ${path} - ${error.message}`,
      );
    }
  }

  publicUrl(path: string): string {
    const client = this.getClient();
    const { data } = client.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Sends a Realtime broadcast message (server → subscribed frontends).
   * Opens a throwaway channel, waits for the join (bounded), sends,
   * then cleans up — safe to call from short-lived serverless functions.
   */
  async broadcast(
    channelName: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const client = this.getClient();
    const channel = client.channel(channelName);

    try {
      await this.waitForSubscribed(channel);
      const result = await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
      return result === 'ok';
    } finally {
      await client.removeChannel(channel).catch(() => undefined);
    }
  }

  private waitForSubscribed(channel: {
    subscribe: (callback: (status: string) => void) => unknown;
  }): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const timer = setTimeout(done, 5000);
      try {
        channel.subscribe((status: string) => {
          if (
            status === 'SUBSCRIBED' ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            clearTimeout(timer);
            done();
          }
        });
      } catch {
        clearTimeout(timer);
        done();
      }
    });
  }

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('SUPABASE_URL') &&
        (this.configService.get<string>('SUPABASE_SERVICE_KEY') ||
          this.configService.get<string>('SUPABASE_ANON_KEY')),
    );
  }

  usesServiceKey(): boolean {
    return Boolean(this.configService.get<string>('SUPABASE_SERVICE_KEY'));
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = this.configService.get<string>('SUPABASE_URL');
      const serviceKey =
        this.configService.get<string>('SUPABASE_SERVICE_KEY');
      const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
      const key = serviceKey ?? anonKey;

      if (!url || !key) {
        throw new BadRequestException(
          'Supabase is not configured on this server',
        );
      }

      if (serviceKey) {
        this.logger.log('Supabase storage uses the service key (RLS bypass)');
      }
      this.client = this.createRawClient(url, key);
    }

    return this.client;
  }

  /** Separated for tests (avoids real network clients). */
  protected createRawClient(url: string, key: string): SupabaseClient {
    return createClient(url, key);
  }

  private describeStorageError(message: string): string {
    if (/row-level security|policy|permission|unauthorized|JWT/i.test(message)) {
      return (
        'Supabase rejected the storage operation (RLS/policy). ' +
        'Fix with ONE of: (1) set SUPABASE_SERVICE_KEY (service_role, server-side only) and redeploy; ' +
        `(2) in the Supabase dashboard create the "${this.bucket}" bucket plus storage policies allowing SELECT/INSERT/UPDATE/DELETE on it. ` +
        `Provider detail: ${message}`
      );
    }
    if (/bucket not found|bucket_not_found/i.test(message)) {
      return (
        `Storage bucket "${this.bucket}" does not exist. ` +
        'Create it in the Supabase dashboard (Storage → New bucket) or set SUPABASE_SERVICE_KEY so the API can create it. ' +
        `Provider detail: ${message}`
      );
    }
    return `File upload to Supabase failed: ${message}`;
  }
}
