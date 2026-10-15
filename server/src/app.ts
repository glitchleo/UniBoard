import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Database } from './db.js';
import { ApiError, errorHandler, requireDatabase } from './http.js';
import { authRouter, type AuthOptions } from './routes/auth.js';
import { campusRouter } from './routes/campus.js';

export interface AppOptions extends AuthOptions {
  db?: Database;
  appOrigin?: string;
  trustProxy?: boolean;
  frontendPath?: string;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const allowedOrigin = options.appOrigin ?? 'http://127.0.0.1:5173';
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Browser cookies are same-site; exact Origin checking also protects against sibling subdomains.
    const origin = req.get('origin');
    if ((origin && origin !== allowedOrigin) || req.get('sec-fetch-site') === 'cross-site')
      throw new ApiError(
        403,
        'ORIGIN_FORBIDDEN',
        'This origin is not allowed to change campus data.',
      );
    if (
      req.get('content-length') &&
      req.get('content-length') !== '0' &&
      !req.is('application/json')
    )
      throw new ApiError(415, 'JSON_REQUIRED', 'Send request bodies as application/json.');
    next();
  });

  const limitHandler: express.RequestHandler = (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  };
  app.use(
    '/api',
    rateLimit({
      windowMs: 5 * 60_000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: limitHandler,
    }),
  );
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 40,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: limitHandler,
    }),
  );

  app.get('/api/v1/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        database: options.db ? 'configured' : 'not_configured',
        service: 'uniboard-api',
      },
    });
  });
  app.get('/api/v1/health/ready', async (_req, res) => {
    if (!options.db)
      throw new ApiError(
        503,
        'DATABASE_NOT_CONFIGURED',
        'Set DATABASE_URL and run database migrations.',
      );
    try {
      await options.db.query('SELECT 1');
    } catch {
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.');
    }
    res.json({ data: { status: 'ready' } });
  });
  app.use('/api/v1', requireDatabase(options.db));
  if (options.db) {
    app.use('/api/v1/auth', authRouter(options.db, options));
    app.use('/api/v1', campusRouter(options.db, options));
  }
  app.use('/api', (_req, _res) => {
    throw new ApiError(404, 'NOT_FOUND', 'API endpoint not found.');
  });

  if (options.frontendPath && existsSync(path.join(options.frontendPath, 'index.html'))) {
    app.use(express.static(options.frontendPath, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) =>
      res.sendFile(path.join(options.frontendPath!, 'index.html')),
    );
  }
  app.use((_req, _res) => {
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
  });
  app.use(errorHandler);
  return app;
}
