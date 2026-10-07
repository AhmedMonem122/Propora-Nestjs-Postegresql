import serverlessHttp from 'serverless-http';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    const { NestFactory } = await import('@nestjs/core');
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    const { AppModule } = await import('../dist/app.module.js');

    const server = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

    app.use(helmet());
    app.use(compression());
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    app.setGlobalPrefix('api/v1');

    await app.init();
    cachedHandler = serverlessHttp(server);
  }
  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const handler = await bootstrap();
  return handler(event, context);
};
