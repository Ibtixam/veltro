import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './config/env-validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ── 1. Validate env before anything else ─────────────────────────────
  validateEnv(process.env);

  // ── 2. Create app with Fastify ────────────────────────────────────────
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger:     process.env.NODE_ENV !== 'production',
      trustProxy: true,
    }),
    { rawBody: true },   // native raw body for webhook signature verification
  );

  app.setGlobalPrefix('api');

  // ── 3. CORS — never wildcard ──────────────────────────────────────────
  const origin = process.env.APP_URL;
  if (!origin) logger.warn('APP_URL not set — CORS will block all cross-origin requests');
  app.enableCors({
    origin:      origin ?? false,
    credentials: true,
    methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  });

  // ── 4. Global validation pipe ─────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist:            true,
    transform:            true,
    forbidNonWhitelisted: true,
  }));

  // ── 5. Raw body for webhook signature verification ────────────────────
  // Enabled natively via { rawBody: true } in NestFactory.create above.
  // Access in controllers with @Req() req: RawBodyRequest<Request> → req.rawBody

  // ── 6. Graceful shutdown ──────────────────────────────────────────────
  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  // ── 7. Start ──────────────────────────────────────────────────────────
  const port = parseInt(process.env.API_PORT ?? '4000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Veltro API running on port ${port} [${process.env.NODE_ENV}]`);
}

bootstrap();
