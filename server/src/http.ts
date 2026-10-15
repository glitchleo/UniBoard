import type { NextFunction, Request, Response } from 'express';
import type { Database } from './db.js';
import { tokenHash } from './security.js';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Actor {
  id: string;
  email: string;
  email_verified: boolean;
  name: string;
}
export interface Membership {
  role: 'student' | 'moderator' | 'admin';
  faculty_id: string | null;
  status: string;
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      membership?: Membership;
      universityId?: string;
    }
  }
}

export function requireDatabase(db?: Database) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!db)
      return next(
        new ApiError(
          503,
          'DATABASE_NOT_CONFIGURED',
          'Set DATABASE_URL and run the database migrations to use the API.',
        ),
      );
    next();
  };
}

export function requireAuth(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.uniboard_session;
    if (typeof token !== 'string' || token.length > 128)
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in.');
    const result = await db.query<Actor>(
      `SELECT u.id, u.email, u.email_verified, u.name FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now()`,
      [tokenHash(token)],
    );
    if (!result.rows[0])
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please log in.');
    req.actor = result.rows[0];
    next();
  };
}

export const uuid = z.uuid();
export function requireMembership(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const universityId = uuid.parse(req.params.universityId);
    const result = await db.query<Membership>(
      'SELECT role, faculty_id, status FROM memberships WHERE user_id=$1 AND university_id=$2',
      [req.actor!.id, universityId],
    );
    const member = result.rows[0];
    if (!member || member.status !== 'approved')
      throw new ApiError(
        403,
        'MEMBERSHIP_REQUIRED',
        'Approved membership at this university is required.',
      );
    if (!req.actor!.email_verified)
      throw new ApiError(
        403,
        'EMAIL_UNVERIFIED',
        'Verify your account email before accessing campus content.',
      );
    req.universityId = universityId;
    req.membership = member;
    next();
  };
}

export function requireModerator(req: Request, _res: Response, next: NextFunction) {
  if (!req.membership || !['moderator', 'admin'].includes(req.membership.role))
    throw new ApiError(403, 'FORBIDDEN', 'A university moderator is required.');
  next();
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted fields.',
        details: error.issues,
      },
    });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }
  const pgError = error as { code?: string; type?: string; status?: number };
  if (pgError.code === '23505') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'That record already exists.' } });
    return;
  }
  if (['23503', '23514', '22P02'].includes(pgError.code ?? '')) {
    res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'A referenced record is invalid for this university.',
      },
    });
    return;
  }
  if (pgError.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body must contain valid JSON.' },
    });
    return;
  }
  if (pgError.status === 413) {
    res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }
  if (
    pgError.code?.startsWith('08') ||
    ['ECONNREFUSED', 'ENOTFOUND', '57P01'].includes(pgError.code ?? '')
  ) {
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is temporarily unavailable.',
      },
    });
    return;
  }
  console.error('API request failed:', error);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
}
