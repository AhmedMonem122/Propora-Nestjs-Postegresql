import serverlessHttp from 'serverless-http';
import express from 'express';
import { randomUUID } from 'node:crypto';

let cachedServer: any;
let cachedHandler: any;

async function bootstrap() {
  if (!cachedServer) {
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

    server.use((helmet.default ?? helmet)());
    server.use((compression.default ?? compression)());
    server.use((cookieParser.default ?? cookieParser)());
    // Stripe webhook signature verification needs the exact raw bytes;
    // must run before express.json() (see src/main.ts).
    server.use(
      '/api/v1/billing/stripe/webhook',
      express.raw({ type: 'application/json' }),
    );
    server.use(express.json({ limit: '10mb' }));
    server.use(express.urlencoded({ extended: true, limit: '10mb' }));

    await configureApp(app);
    await app.init();

    cachedServer = server;
    cachedHandler = serverlessHttp(server);
  }
  return cachedServer;
}

export default async function handler(request: any, response?: any) {
  const server = await bootstrap();

  if (
    request &&
    typeof request.arrayBuffer === 'function' &&
    typeof request.text === 'function'
  ) {
    return handleWebRequest(request);
  }

  if (response && typeof response.writeHead === 'function') {
    server(request, response);
    return;
  }

  if (request && typeof request.httpMethod === 'string') {
    return cachedHandler(request, response ?? {});
  }

  throw new Error(
    'Unsupported invocation: expected a Web Request or a Node.js (req, res) pair.',
  );
}

async function handleWebRequest(request: Request): Promise<Response> {
  const event = await toGatewayEvent(request);
  const result = await cachedHandler(event, {});

  const headers = new Headers(result.headers as Record<string, string>);
  const setCookies =
    (result.multiValueHeaders as Record<string, string[]> | undefined)
      ?.['set-cookie'] ?? [];
  for (const cookie of setCookies) {
    headers.append('set-cookie', cookie);
  }

  const body = result.isBase64Encoded
    ? Buffer.from(result.body, 'base64')
    : result.body;

  return new Response(body, {
    status: result.statusCode,
    headers,
  });
}

async function toGatewayEvent(request: Request) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const rawBody = await request.arrayBuffer();
  const forwardedFor = request.headers.get('x-forwarded-for');

  return {
    httpMethod: request.method,
    path: url.pathname,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: Buffer.from(rawBody),
    requestContext: {
      requestId: randomUUID(),
      identity: {
        sourceIp: forwardedFor
          ? forwardedFor.split(',')[0].trim()
          : '0.0.0.0',
      },
    },
  };
}
