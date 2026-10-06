import serverlessHttp from 'serverless-http';
import express from 'express';

let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    const { NestFactory } = await import('@nestjs/core');
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    const { AppModule } = await import('../dist/app.module.js');

    const server = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(server),
    );

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    app.setGlobalPrefix('api/v1');

    await app.init();
    cachedHandler = serverlessHttp({ app: server });
  }
  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const handler = await bootstrap();
  return handler(event, context);
};
