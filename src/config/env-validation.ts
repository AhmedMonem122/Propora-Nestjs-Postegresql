import { ConfigService } from '@nestjs/config';

export function validateEnvironment(configService: ConfigService): void {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const databaseUrl = configService.get<string>('DATABASE_URL');

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not defined. Copy .env.example to .env and set your Neon connection string.',
    );
  }

  const jwtSecret = configService.get<string>('JWT_ACCESS_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT_ACCESS_SECRET is not defined.');
  }

  if (nodeEnv === 'production' && jwtSecret === 'change-me-to-a-long-random-string-min-32-chars') {
    throw new Error('JWT_ACCESS_SECRET must be changed in production.');
  }
}
