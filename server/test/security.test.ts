import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import type { QueryResult, QueryResultRow } from 'pg';
import { createApp } from '../src/app.js';
import type { Database } from '../src/db.js';
import { hashPassword, tokenHash, verifyPassword } from '../src/security.js';
import { postInput } from '../src/validation.js';

const userId = '00000000-0000-4000-8000-000000000001';
const universityId = '00000000-0000-4000-8000-000000000002';
const otherUniversityId = '00000000-0000-4000-8000-000000000003';
const facultyId = '00000000-0000-4000-8000-000000000004';
const postId = '00000000-0000-4000-8000-000000000005';
const otherUserId = '00000000-0000-4000-8000-000000000006';
const actor = { id: userId, name: 'Student', email: 'student@example.edu', email_verified: true };
const membership = { role: 'student', status: 'approved', faculty_id: facultyId };
const validPost = {
  type: 'Question',
  title: 'Where is the library?',
  body: 'Looking for the main university library.',
  tags: ['campus'],
  details: { topic: 'Campus' },
};

type QueryCall = { sql: string; values: unknown[] };
function fakeDatabase(resolve: (call: QueryCall) => QueryResultRow[] | undefined = () => []) {
  const calls: QueryCall[] = [];
  const db: Database = {
    async query<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
      const call = { sql, values };
      calls.push(call);
      const rows = resolve(call) ?? [];
      return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult<T>;
    },
    transaction: async (work) => work(db),
    close: async () => {},
  };
  return { db, calls };
}

function authenticatedRows(call: QueryCall): QueryResultRow[] | undefined {
  if (call.sql.includes('FROM sessions s JOIN users')) return [actor];
  if (call.sql.includes('SELECT role, faculty_id, status')) return [membership];
  return undefined;
}

test('password hashing uses fresh salts and verifies without storing plaintext', async () => {
  const one = await hashPassword('a-long-and-private-password');
  const two = await hashPassword('a-long-and-private-password');
  assert.notEqual(one, two);
  assert(!one.includes('a-long-and-private-password'));
  assert.equal(await verifyPassword('a-long-and-private-password', one), true);
  assert.equal(await verifyPassword('incorrect', one), false);
  assert.equal(await verifyPassword('incorrect', 'invalid'), false);
});

test('health works without a database; data endpoints fail clearly', async () => {
  const app = createApp({ environment: 'test' });
  const health = await request(app).get('/api/v1/health').expect(200);
  assert.equal(health.body.data.database, 'not_configured');
  const failure = await request(app).get('/api/v1/universities').expect(503);
  assert.equal(failure.body.error.code, 'DATABASE_NOT_CONFIGURED');
  await request(app).get('/api/v1/health/ready').expect(503);
  assert.equal(health.headers['x-powered-by'], undefined);
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.match(health.headers['content-security-policy'], /img-src 'self' data: https:/);
});

test('cross-site and sibling-origin writes are denied before database access', async () => {
  const { db, calls } = fakeDatabase();
  const app = createApp({ db, environment: 'test', appOrigin: 'https://campus.example' });
  for (const origin of ['https://evil.example', 'https://student.campus.example']) {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'x@example.edu', password: 'password' })
      .expect(403);
    assert.equal(response.body.error.code, 'ORIGIN_FORBIDDEN');
  }
  await request(app).post('/api/v1/auth/logout').set('Sec-Fetch-Site', 'cross-site').expect(403);
  assert.equal(calls.length, 0);
});

test('malformed JSON and non-JSON mutation bodies have structured client errors', async () => {
  const { db } = fakeDatabase();
  const app = createApp({ db, environment: 'test' });
  const malformed = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const body = await request(app)
    .post('/api/v1/auth/login')
    .type('form')
    .send({ email: 'test@example.edu' })
    .expect(415);
  assert.equal(body.body.error.code, 'JSON_REQUIRED');
});

test('private content requires an authenticated server session', async () => {
  const { db } = fakeDatabase();
  const response = await request(createApp({ db, environment: 'test' }))
    .get(`/api/v1/universities/${universityId}/posts`)
    .expect(401);
  assert.equal(response.body.error.code, 'UNAUTHENTICATED');
});

test('unapproved or suspended membership blocks campus content', async () => {
  for (const status of ['pending', 'suspended', 'rejected']) {
    const { db } = fakeDatabase(({ sql }) =>
      sql.includes('FROM sessions s JOIN users')
        ? [actor]
        : sql.includes('SELECT role, faculty_id, status')
          ? [{ ...membership, status }]
          : [],
    );
    const response = await request(createApp({ db, environment: 'test' }))
      .get(`/api/v1/universities/${universityId}/posts`)
      .set('Cookie', 'uniboard_session=opaque-session-token')
      .expect(403);
    assert.equal(response.body.error.code, 'MEMBERSHIP_REQUIRED');
  }
});

test('server session lookup hashes the presented token', async () => {
  const { db, calls } = fakeDatabase(authenticatedRows);
  await request(createApp({ db, environment: 'test' }))
    .get('/api/v1/auth/me')
    .set('Cookie', 'uniboard_session=my-secret-session')
    .expect(200);
  assert.equal(calls[0]!.values[0], tokenHash('my-secret-session'));
  assert(!calls.some((call) => call.values.includes('my-secret-session')));
});

test('login issues an HttpOnly SameSite cookie, storing only its hash', async () => {
  const passwordHash = await hashPassword('my-strong-login-password');
  const { db, calls } = fakeDatabase(({ sql }) => {
    if (sql.includes('SELECT id,password_hash,email_verified'))
      return [{ id: userId, password_hash: passwordHash, email_verified: true }];
    if (sql.includes('SELECT id,email,name')) return [actor];
    return [];
  });
  const response = await request(createApp({ db, environment: 'production' }))
    .post('/api/v1/auth/login')
    .send({ email: actor.email, password: 'my-strong-login-password' })
    .expect(200);
  const cookie = response.headers['set-cookie'][0] as string;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const token = decodeURIComponent(cookie.match(/uniboard_session=([^;]+)/)![1]!);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO sessions'))!;
  assert.equal(insert.values[1], tokenHash(token));
  assert.notEqual(insert.values[1], token);
  const passwordRead = calls.find((call) =>
    call.sql.includes('SELECT id,password_hash,email_verified'),
  )!;
  assert.match(passwordRead.sql, /FOR UPDATE$/);
});

test('production email flows require configured delivery and never expose development tokens', async () => {
  const missing = fakeDatabase();
  await request(createApp({ db: missing.db, environment: 'production' }))
    .post('/api/v1/auth/register')
    .send({ name: 'New Student', email: 'new@example.edu', password: 'a-valid-new-password' })
    .expect(503);
  assert.equal(missing.calls.length, 0);
  const { db } = fakeDatabase(({ sql }) => (sql.includes('INSERT INTO users') ? [actor] : []));
  const delivered: string[] = [];
  const response = await request(
    createApp({
      db,
      environment: 'production',
      sendMail: async (message) => {
        delivered.push(message.token);
      },
    }),
  )
    .post('/api/v1/auth/register')
    .send({ name: 'New Student', email: 'new@example.edu', password: 'a-valid-new-password' })
    .expect(201);
  assert.equal(delivered.length, 1);
  assert.equal(response.body.developmentToken, undefined);
  assert(!JSON.stringify(response.body).includes(delivered[0]!));
});

test('post type fields, safe URLs, and privilege fields are validated', () => {
  assert.equal(postInput.safeParse(validPost).success, true);
  assert.equal(postInput.safeParse({ ...validPost, type: 'Event' }).success, false);
  assert.equal(
    postInput.safeParse({ ...validPost, imageUrl: 'javascript:alert(1)' }).success,
    false,
  );
  assert.equal(postInput.safeParse({ ...validPost, imageUrl: 'not a url' }).success, false);
  assert.equal(
    postInput.safeParse({
      ...validPost,
      type: 'Event',
      details: {
        startsAt: '2026-11-01T12:00:00Z',
        location: 'Campus',
        organizer: 'Student Council',
        registrationUrl: 'not a url',
      },
    }).success,
    false,
  );
  assert.equal(postInput.safeParse({ ...validPost, pinned: true }).success, false);
  assert.equal(postInput.safeParse({ ...validPost, authorId: otherUserId }).success, false);
  assert.equal(
    postInput.safeParse({
      ...validPost,
      type: 'Poll',
      details: { options: ['Same', 'Same'], closingAt: '2026-11-01T12:00:00Z' },
    }).success,
    false,
  );
});

test('malformed profile URLs return a validation error instead of a server error', async () => {
  const { db } = fakeDatabase((call) => authenticatedRows(call) ?? []);
  const response = await request(createApp({ db, environment: 'test' }))
    .patch('/api/v1/profile')
    .set('Cookie', 'uniboard_session=opaque')
    .send({ name: 'Student', avatarUrl: 'not a url' })
    .expect(400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('post lookup binds both the university and faculty audience', async () => {
  const { db, calls } = fakeDatabase((call) => authenticatedRows(call) ?? []);
  await request(createApp({ db, environment: 'test' }))
    .get(`/api/v1/universities/${otherUniversityId}/posts/${postId}`)
    .set('Cookie', 'uniboard_session=opaque')
    .expect(404);
  const lookup = calls.find((call) => call.sql.includes('WHERE p.id=$1 AND p.university_id=$2'))!;
  assert.equal(lookup.values[1], otherUniversityId);
  assert.equal(lookup.values[2], facultyId);
  assert.equal(lookup.values[3], false);
  assert.match(lookup.sql, /p.university_id=\$2/);
  assert.match(lookup.sql, /p.deleted_at IS NULL/);
  assert.match(lookup.sql, /p.faculty_id=\$3/);
});

test('students cannot edit another author’s post or target another faculty', async () => {
  const { db } = fakeDatabase(
    (call) =>
      authenticatedRows(call) ??
      (call.sql.includes('SELECT * FROM posts')
        ? [{ id: postId, author_id: otherUserId, type: 'Question' }]
        : []),
  );
  const app = createApp({ db, environment: 'test' });
  await request(app)
    .put(`/api/v1/universities/${universityId}/posts/${postId}`)
    .set('Cookie', 'uniboard_session=opaque')
    .send(validPost)
    .expect(403);
  await request(app)
    .post(`/api/v1/universities/${universityId}/posts`)
    .set('Cookie', 'uniboard_session=opaque')
    .send({ ...validPost, facultyId: otherUniversityId })
    .expect(403);
});

test('student role cannot access moderation routes', async () => {
  const { db } = fakeDatabase((call) => authenticatedRows(call) ?? []);
  const response = await request(createApp({ db, environment: 'test' }))
    .get(`/api/v1/universities/${universityId}/moderation/reports`)
    .set('Cookie', 'uniboard_session=opaque')
    .expect(403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('feed search is parameterized and pagination rejects excessive limits', async () => {
  const { db, calls } = fakeDatabase(
    (call) =>
      authenticatedRows(call) ??
      (call.sql.includes('count(*)::int AS total') ? [{ total: 0 }] : []),
  );
  const app = createApp({ db, environment: 'test' });
  const query = "test'); DROP TABLE posts; --";
  await request(app)
    .get(`/api/v1/universities/${universityId}/posts`)
    .query({ q: query })
    .set('Cookie', 'uniboard_session=opaque')
    .expect(200);
  const search = calls.filter((call) => call.sql.includes('plainto_tsquery'));
  assert.equal(search.length, 2);
  for (const call of search) {
    assert(!call.sql.includes(query));
    assert(call.values.includes(query));
  }
  await request(app)
    .get(`/api/v1/universities/${universityId}/posts`)
    .query({ limit: 10001 })
    .set('Cookie', 'uniboard_session=opaque')
    .expect(400);
});

test('closed comments cannot receive new replies', async () => {
  const { db } = fakeDatabase(
    (call) =>
      authenticatedRows(call) ??
      (call.sql.includes('SELECT * FROM posts')
        ? [{ id: postId, author_id: otherUserId, comments_closed: true }]
        : []),
  );
  const response = await request(createApp({ db, environment: 'test' }))
    .post(`/api/v1/universities/${universityId}/posts/${postId}/comments`)
    .set('Cookie', 'uniboard_session=opaque')
    .send({ body: 'A useful comment' })
    .expect(409);
  assert.equal(response.body.error.code, 'COMMENTS_CLOSED');
});
