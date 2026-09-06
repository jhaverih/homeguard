import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Standard security headers (X-Content-Type-Options, X-Frame-Options,
  // etc.) — CSP left at helmet's permissive default rather than a strict
  // custom policy, since the admin/vendor Next.js apps aren't served by
  // this app and a strict CSP here isn't the API's job.
  app.use(helmet());

  // Traffic path is client -> Cloudflare -> Tunnel -> nginx -> here. nginx
  // is the only proxy hop Express itself sees (it already resolves the
  // real client IP from Cloudflare's CF-Connecting-IP header before
  // forwarding — see nginx.conf's real_ip config), so trusting exactly one
  // hop lets req.ip resolve to the actual client instead of nginx's own
  // container IP. Matters for the service-area endpoint's rate limiter,
  // which keys on req.ip.
  app.set('trust proxy', 1);

  // The two rendered legal documents are deliberately excluded from the
  // 'api' prefix — apps/mobile/src/services/api.ts's TERMS_URL/VENDOR_TERMS_URL
  // build these as plain links (opened in a browser via Linking.openURL,
  // not called through the authenticated axios instance) and strip '/api'
  // off the base URL before appending them. GET /legal/versions is NOT
  // excluded — it's called through that same axios instance as every other
  // endpoint, so it belongs under the normal prefix.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'legal/customer-terms.html', method: RequestMethod.GET },
      { path: 'legal/vendor-terms.html', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // No wildcard fallback outside plain local development — api.attenteve.com
  // is now genuinely public, so an unset ALLOWED_ORIGINS in staging/production
  // should fail closed (empty allow-list) rather than silently open CORS to
  // every origin.
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',')
      ?? (process.env.NODE_ENV === 'development' ? '*' : []),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('HomeGuard API')
    .setDescription('HomeGuard home services platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`HomeGuard API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
