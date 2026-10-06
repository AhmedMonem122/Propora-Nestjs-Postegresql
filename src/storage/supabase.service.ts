import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {}

  get bucket(): string {
    return this.configService.get<string>('SUPABASE_BUCKET', 'documents');
  }

  async ensureBucket(): Promise<void> {
    const client = this.getClient();
    const { data, error } = await client.storage.listBuckets();

    if (error) {
      throw new BadRequestException(
        `Supabase storage error: ${error.message}`,
      );
    }

    if (!data.some((bucket) => bucket.name === this.bucket)) {
      const { error: createError } = await client.storage.createBucket(
        this.bucket,
        { public: true },
      );

      if (createError) {
        throw new BadRequestException(
          `Failed to create storage bucket: ${createError.message}`,
        );
      }
    }
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
      throw new BadRequestException(
        `File upload to Supabase failed: ${error.message}`,
      );
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

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('SUPABASE_URL') &&
        this.configService.get<string>('SUPABASE_ANON_KEY'),
    );
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = this.configService.get<string>('SUPABASE_URL');
      const key = this.configService.get<string>('SUPABASE_ANON_KEY');

      if (!url || !key) {
        throw new BadRequestException(
          'Supabase is not configured on this server',
        );
      }

      this.client = createClient(url, key);
    }

    return this.client;
  }
}
