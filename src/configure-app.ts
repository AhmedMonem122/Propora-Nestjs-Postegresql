import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { rateLimitMiddleware } from './common/middleware/rate-limit.middleware.js';
import { validateEnvironment } from './config/env-validation.js';

export async function configureApp(app: INestApplication): Promise<void> {
  const configService = app.get(ConfigService);

  validateEnvironment(configService);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // NOTE: CORS is applied by applyCors() in both bootstraps BEFORE any
  // middleware that can answer with an error (rate limiter, body parsers).
  app.use(rateLimitMiddleware);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (configService.get('SWAGGER_ENABLED', 'true') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Propora API')
      .setDescription(
        'Multi-tenant property management platform API - Properties, buildings, units, residents, leases, rent payments, maintenance, Supabase file storage, RBAC and tenant isolation.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'X-Organization-Id',
          description:
            'Platform admins only: scope the request to a tenant (org id). ' +
            'Lets one platform session drive the whole org API.',
        },
        'org-context',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    // Pin the Swagger UI assets to a CWD-relative path so it also resolves
    // inside the Vercel serverless bundle (where the files are shipped via
    // `functions."api/index.ts".includeFiles`), instead of relying on the
    // swagger-ui-dist package __dirname.
    SwaggerModule.setup('docs', app, document, {
      customSwaggerUiPath: 'node_modules/swagger-ui-dist',
    });
  }
}
