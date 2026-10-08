import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { json, raw, urlencoded } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { parseCorsSettings } from './config/cors.util.js';
import { PrismaService } from './database/prisma.service.js';
import { attachSocketServer } from './realtime/socket-server.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  // Stripe verifies webhooks against the EXACT raw bytes. body-parser skips
  // routes whose body was already parsed (req._body flag), so the raw
  // parser for the webhook route must be registered before express.json().
  app.use('/api/v1/billing/stripe/webhook', raw({ type: 'application/json' }));
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  await configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const server = await app.listen(port);

  const transports = configService
    .get<string>('REALTIME_TRANSPORT', 'supabase')
    .split(',')
    .map((transport) => transport.trim());
  if (transports.includes('socketio')) {
    const jwtService = app.get(JwtService);
    const prisma = app.get(PrismaService);
    const cors = parseCorsSettings(
      configService.get<string>('CORS_ORIGIN', '*'),
      configService.get<string>('NODE_ENV', 'development'),
    );
    const socketOrigins =
      cors.origin === '*'
        ? [/.*/]
        : Array.isArray(cors.origin)
          ? cors.origin
          : [cors.origin];

    attachSocketServer(server, {
      corsOrigins: socketOrigins,
      verifyToken: async (token) => {
        const payload = (await jwtService.verifyAsync(token)) as {
          sub?: string;
          organizationId?: string | null;
          email?: string;
          platformAdminId?: string;
        };
        if (!payload.sub || payload.platformAdminId) {
          throw new Error('Invalid socket credentials');
        }
        return {
          userId: payload.sub,
          organizationId: payload.organizationId ?? null,
          email: payload.email ?? '',
        };
      },
      canAccessOrganization: async (user, organizationId) => {
        if (!user.organizationId || user.organizationId !== organizationId) {
          return false;
        }
        const member = await prisma.user.findFirst({
          where: { id: user.userId, organizationId },
          select: { id: true },
        });
        return Boolean(member);
      },
    });
  }
}

await bootstrap();
