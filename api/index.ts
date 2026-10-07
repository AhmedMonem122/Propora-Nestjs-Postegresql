import serverlessHttp from 'serverless-http';
import express from 'express';

let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    const { NestFactory } = await import('@nestjs/core');
    const { ExpressAdapter } = await import('@nestjs/platform-express');
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/configure-app.js');
    const helmet = (await import('helmet')) as any;
    const compression = (await import('compression')) as any;
    const cookieParser = (await import('cookie-parser')) as any;

    const server = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(server),
    );

    app.use((helmet.default ?? helmet)());
    app.use((compression.default ?? compression)());
    app.use((cookieParser.default ?? cookieParser)());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    await configureApp(app);

    await app.init();
    cachedHandler = serverlessHttp(server);
  }
  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const handler = await bootstrap();
  return handler(event, context);
};
