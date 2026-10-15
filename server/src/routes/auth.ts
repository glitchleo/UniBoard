import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Database, Queryable } from '../db.js';
import { ApiError, requireAuth } from '../http.js';
import { email, password } from '../validation.js';
import {
  hashPassword,
  makeToken,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
  tokenHash,
  verifyPassword,
} from '../security.js';

export type MailMessage = {
  to: string;
  kind: 'verify_email' | 'reset_password' | 'verify_membership';
  token: string;
  universityId?: string;
};
export type MailSender = (message: MailMessage) => Promise<void>;
export interface AuthOptions {
  environment: string;
  sendMail?: MailSender;
}

export function assertMailAvailable(options: AuthOptions) {
  if (options.environment !== 'development' && !options.sendMail)
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'Email delivery must be configured for this operation.',
    );
}

export async function issueToken(
  db: Queryable,
  userId: string,
  kind: MailMessage['kind'],
  universityId?: string,
) {
  const token = makeToken();
  await db.query(
    'DELETE FROM auth_tokens WHERE user_id=$1 AND kind=$2 AND university_id IS NOT DISTINCT FROM $3',
    [userId, kind, universityId ?? null],
  );
  await db.query(
    `INSERT INTO auth_tokens(user_id,kind,university_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')`,
    [userId, kind, universityId ?? null, tokenHash(token)],
  );
  return token;
}

export async function deliverToken(options: AuthOptions, message: MailMessage) {
  if (options.sendMail) await options.sendMail(message);
  // Explicitly opting into development is the only mode that exposes secrets in API responses.
  return options.environment === 'development' ? { developmentToken: message.token } : {};
}

async function createSession(db: Queryable, userId: string, res: Response, options: AuthOptions) {
  const token = makeToken();
  await db.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [
    userId,
    tokenHash(token),
    new Date(Date.now() + SESSION_MAX_AGE_MS),
  ]);
  res.cookie('uniboard_session', token, sessionCookieOptions(options.environment === 'production'));
}

const publicUserColumns =
  'id,email,name,avatar_url,program,study_year,bio,email_verified,created_at';
const dummyHash = hashPassword('a-random-password-never-used-for-login');

export function authRouter(db: Database, options: AuthOptions) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const input = z
      .strictObject({ name: z.string().trim().min(2).max(100), email, password })
      .parse(req.body);
    assertMailAvailable(options);
    const hash = await hashPassword(input.password);
    const result = await db.transaction(async (client) => {
      const user = (
        await client.query(
          `INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING ${publicUserColumns}`,
          [input.name, input.email, hash],
        )
      ).rows[0]!;
      const token = await issueToken(client, user.id as string, 'verify_email');
      return { user, token };
    });
    const delivery = await deliverToken(options, {
      to: input.email,
      kind: 'verify_email',
      token: result.token,
    });
    res.status(201).json({
      data: result.user,
      ...delivery,
      message: 'Check your email to verify your account before logging in.',
    });
  });

  router.post('/login', async (req, res) => {
    const input = z.strictObject({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const userId = await db.transaction(async (client) => {
      // Serialize with password resets: an old password can never create a session after a reset commits.
      const user = (
        await client.query(
          'SELECT id,password_hash,email_verified FROM users WHERE email=$1 FOR UPDATE',
          [input.email],
        )
      ).rows[0];
      const valid = await verifyPassword(
        input.password,
        (user?.password_hash as string) ?? (await dummyHash),
      );
      if (!user || !valid)
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
      if (!user.email_verified)
        throw new ApiError(403, 'EMAIL_UNVERIFIED', 'Verify your email before logging in.');
      // Rotate a presented session, preventing session fixation.
      if (typeof req.cookies?.uniboard_session === 'string')
        await client.query('DELETE FROM sessions WHERE token_hash=$1', [
          tokenHash(req.cookies.uniboard_session),
        ]);
      await createSession(client, user.id as string, res, options);
      return user.id as string;
    });
    res.json({
      data: (await db.query(`SELECT ${publicUserColumns} FROM users WHERE id=$1`, [userId]))
        .rows[0],
    });
  });

  router.post('/logout', async (req, res) => {
    if (typeof req.cookies?.uniboard_session === 'string')
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [
        tokenHash(req.cookies.uniboard_session),
      ]);
    const { maxAge: _, ...clearOptions } = sessionCookieOptions(
      options.environment === 'production',
    );
    res.clearCookie('uniboard_session', clearOptions).status(204).end();
  });

  router.get('/me', requireAuth(db), async (req, res) => {
    const user = (
      await db.query(`SELECT ${publicUserColumns} FROM users WHERE id=$1`, [req.actor!.id])
    ).rows[0];
    const memberships = (
      await db.query(
        'SELECT m.*,u.name AS university_name FROM memberships m JOIN universities u ON u.id=m.university_id WHERE m.user_id=$1',
        [req.actor!.id],
      )
    ).rows;
    res.json({ data: { ...user, memberships } });
  });

  router.post('/verify-email', async (req, res) => {
    const input = z.strictObject({ token: z.string().min(20).max(128) }).parse(req.body);
    await db.transaction(async (client) => {
      const token = (
        await client.query(
          `DELETE FROM auth_tokens WHERE token_hash=$1 AND kind='verify_email' AND expires_at>now() RETURNING user_id`,
          [tokenHash(input.token)],
        )
      ).rows[0];
      if (!token)
        throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or expired.');
      await client.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1', [
        token.user_id,
      ]);
    });
    res.json({ data: { verified: true } });
  });

  for (const [path, kind] of [
    ['/resend-verification', 'verify_email'],
    ['/forgot-password', 'reset_password'],
  ] as const) {
    router.post(path, async (req, res) => {
      const input = z.strictObject({ email }).parse(req.body);
      assertMailAvailable(options);
      const user = (
        await db.query('SELECT id,email_verified FROM users WHERE email=$1', [input.email])
      ).rows[0];
      let delivery = {};
      if (user && (kind === 'reset_password' || !user.email_verified)) {
        const token = await db.transaction((client) => issueToken(client, user.id as string, kind));
        delivery = await deliverToken(options, { to: input.email, kind, token });
      }
      res.json({
        data: { message: 'If this account is eligible, an email has been sent.' },
        ...delivery,
      });
    });
  }

  router.post('/reset-password', async (req, res) => {
    const input = z.strictObject({ token: z.string().min(20).max(128), password }).parse(req.body);
    const hash = await hashPassword(input.password);
    await db.transaction(async (client) => {
      const token = (
        await client.query(
          `DELETE FROM auth_tokens WHERE token_hash=$1 AND kind='reset_password' AND expires_at>now() RETURNING user_id`,
          [tokenHash(input.token)],
        )
      ).rows[0];
      if (!token)
        throw new ApiError(400, 'INVALID_TOKEN', 'This reset link is invalid or expired.');
      await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [
        hash,
        token.user_id,
      ]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [token.user_id]);
      await client.query("DELETE FROM auth_tokens WHERE user_id=$1 AND kind='reset_password'", [
        token.user_id,
      ]);
    });
    res.json({ data: { message: 'Password updated. Log in with your new password.' } });
  });

  return router;
}
