import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import type { MailMessage } from '../src/routes/auth.js';
import { hashPassword } from '../src/security.js';

// Opt in with TEST_DATABASE_URL. A fresh private schema is created and dropped; never use a production database.
test(
  'PostgreSQL vertical slices: auth, university isolation, ownership, comments, saves, and moderation',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const connectionString = process.env.TEST_DATABASE_URL!;
    const admin = new pg.Pool({ connectionString });
    const schema = `uniboard_test_${randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = new URL(connectionString);
    scopedUrl.searchParams.set('options', `-c search_path=${schema},public`);
    const db = createDatabase(scopedUrl.toString());
    try {
      await db.query(
        await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'),
      );
      const universityA = (
        await db.query(
          "INSERT INTO universities(name,slug,email_domains) VALUES('University A','a',ARRAY['example.edu']) RETURNING id",
        )
      ).rows[0]!.id as string;
      const universityB = (
        await db.query(
          "INSERT INTO universities(name,slug,email_domains) VALUES('University B','b',ARRAY['example.edu']) RETURNING id",
        )
      ).rows[0]!.id as string;
      const facultyA = (
        await db.query(
          "INSERT INTO faculties(university_id,name) VALUES($1,'Sciences') RETURNING id",
          [universityA],
        )
      ).rows[0]!.id as string;
      const facultyB = (
        await db.query(
          "INSERT INTO faculties(university_id,name) VALUES($1,'Sciences') RETURNING id",
          [universityB],
        )
      ).rows[0]!.id as string;
      const delivered: MailMessage[] = [];
      const app = createApp({
        db,
        environment: 'test',
        sendMail: async (message) => {
          delivered.push(message);
        },
      });
      const student = request.agent(app);
      const peer = request.agent(app);
      const moderator = request.agent(app);
      const register = async (
        agent: ReturnType<typeof request.agent>,
        email: string,
        name: string,
      ) => {
        const response = await agent
          .post('/api/v1/auth/register')
          .send({ name, email, password: 'a-very-long-test-password' })
          .expect(201);
        const token = delivered.findLast(
          (message) => message.to === email && message.kind === 'verify_email',
        )!.token;
        await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
        await agent.post('/api/v1/auth/verify-email').send({ token }).expect(400);
        await agent
          .post('/api/v1/auth/login')
          .send({ email, password: 'a-very-long-test-password' })
          .expect(200);
        return response.body.data.id as string;
      };
      const studentId = await register(student, 'student@example.edu', 'Student One');
      const peerId = await register(peer, 'peer@example.edu', 'Student Two');
      const moderatorId = await register(moderator, 'moderator@example.edu', 'Moderator');
      for (const agent of [student, peer, moderator])
        await agent
          .post(`/api/v1/universities/${universityA}/membership`)
          .send({ facultyId: facultyA })
          .expect(201);
      await student
        .post(`/api/v1/universities/${universityB}/membership`)
        .send({ facultyId: facultyB })
        .expect(201);
      await db.query(
        "UPDATE memberships SET role='moderator' WHERE user_id=$1 AND university_id=$2",
        [moderatorId, universityA],
      );

      const manualApplicant = request.agent(app);
      const manualUserId = await register(
        manualApplicant,
        'personal@example.com',
        'Manual Applicant',
      );
      const pendingMembership = await manualApplicant
        .post(`/api/v1/universities/${universityA}/membership`)
        .send({
          facultyId: facultyA,
          evidence: 'My student number can be checked by student affairs.',
        })
        .expect(201);
      assert.equal(pendingMembership.body.data.status, 'pending');
      assert.equal(pendingMembership.body.data.verification_method, 'manual');
      await manualApplicant.get(`/api/v1/universities/${universityA}/posts`).expect(403);
      const membershipQueue = await moderator
        .get(`/api/v1/universities/${universityA}/moderation/memberships`)
        .expect(200);
      assert(
        membershipQueue.body.data.some(
          (member: { user_id: string }) => member.user_id === manualUserId,
        ),
      );
      await moderator
        .patch(`/api/v1/universities/${universityA}/moderation/memberships/${manualUserId}`)
        .send({
          status: 'approved',
          reason: 'Student enrollment confirmed with the student affairs office.',
        })
        .expect(200);
      await manualApplicant.get(`/api/v1/universities/${universityA}/posts`).expect(200);
      const membershipNotifications = await manualApplicant
        .get('/api/v1/notifications')
        .expect(200);
      assert(
        membershipNotifications.body.data.some(
          (item: { title: string; body: string }) =>
            item.title === 'Membership approved' &&
            item.body === 'Student enrollment confirmed with the student affairs office.',
        ),
      );

      const emailApplicant = request.agent(app);
      await register(emailApplicant, 'independent@example.net', 'Email Applicant');
      await emailApplicant
        .post(`/api/v1/universities/${universityA}/membership`)
        .send({ facultyId: facultyA, universityEmail: 'campus-alias@example.edu' })
        .expect(201);
      await emailApplicant.get(`/api/v1/universities/${universityA}/posts`).expect(403);
      const membershipToken = delivered.findLast(
        (message) =>
          message.kind === 'verify_membership' && message.to === 'campus-alias@example.edu',
      )!.token;
      await emailApplicant
        .post(`/api/v1/universities/${universityA}/membership/verify`)
        .send({ token: membershipToken })
        .expect(200);
      await emailApplicant
        .post(`/api/v1/universities/${universityA}/membership/verify`)
        .send({ token: membershipToken })
        .expect(400);
      await emailApplicant.get(`/api/v1/universities/${universityA}/posts`).expect(200);

      const post = (
        await student
          .post(`/api/v1/universities/${universityA}/posts`)
          .send({
            type: 'Question',
            title: 'Where is the campus library?',
            body: 'Could someone share the opening hours?',
            tags: ['library'],
            details: {},
          })
          .expect(201)
      ).body.data;
      await student.get(`/api/v1/universities/${universityB}/posts/${post.id}`).expect(404);
      await peer
        .put(`/api/v1/universities/${universityA}/posts/${post.id}`)
        .send({
          type: 'Question',
          title: 'An unauthorized edit',
          body: 'Should never be saved.',
          details: {},
        })
        .expect(403);
      await peer.get(`/api/v1/universities/${universityA}/moderation/reports`).expect(403);
      const comment = (
        await peer
          .post(`/api/v1/universities/${universityA}/posts/${post.id}/comments`)
          .send({ body: 'The main library opens at 08:00.' })
          .expect(201)
      ).body.data;
      await student
        .post(`/api/v1/universities/${universityA}/posts/${post.id}/comments`)
        .send({ body: 'Thank you!', parentId: comment.id })
        .expect(201);
      const notifications = await student
        .get(`/api/v1/universities/${universityA}/notifications`)
        .expect(200);
      assert.equal(notifications.body.data.length, 1);
      assert.equal(notifications.body.data[0].post_id, post.id);
      await student
        .patch(`/api/v1/universities/${universityA}/posts/${post.id}/comments-status`)
        .send({ closed: true })
        .expect(200);
      await peer
        .post(`/api/v1/universities/${universityA}/posts/${post.id}/comments`)
        .send({ body: 'A late comment' })
        .expect(409);
      await peer.put(`/api/v1/universities/${universityA}/bookmarks/${post.id}`).expect(200);
      assert.equal(
        (await peer.get(`/api/v1/universities/${universityA}/bookmarks`).expect(200)).body.data
          .length,
        1,
      );
      assert.equal(
        (await student.get(`/api/v1/universities/${universityB}/bookmarks`).expect(200)).body.data
          .length,
        0,
      );

      const pollInput = {
        type: 'Poll',
        title: 'Which workshop should we run?',
        body: 'Choose the workshop you would attend.',
        details: {
          options: ['Web development', 'Public speaking'],
          closingAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      };
      const poll = (
        await student.post(`/api/v1/universities/${universityA}/posts`).send(pollInput).expect(201)
      ).body.data;
      await peer
        .post(`/api/v1/universities/${universityA}/posts/${poll.id}/vote`)
        .send({ optionIndex: 1 })
        .expect(200);
      await peer
        .post(`/api/v1/universities/${universityA}/posts/${poll.id}/vote`)
        .send({ optionIndex: 0 })
        .expect(200);
      const results = (
        await peer.get(`/api/v1/universities/${universityA}/posts/${poll.id}/votes`).expect(200)
      ).body.data;
      assert.deepEqual(results.counts, [{ option_index: 0, votes: 1 }]);
      assert.equal(results.ownVote, 0);
      await student
        .put(`/api/v1/universities/${universityA}/posts/${poll.id}`)
        .send({
          ...pollInput,
          details: { ...pollInput.details, options: ['New choice', 'Different choice'] },
        })
        .expect(409);

      const report = (
        await peer
          .post(`/api/v1/universities/${universityA}/reports`)
          .send({ postId: post.id, reason: 'This post needs a moderator review.' })
          .expect(201)
      ).body.data;
      await student
        .post(`/api/v1/universities/${universityA}/reports`)
        .send({ commentId: comment.id, reason: 'Please review the wording of this comment.' })
        .expect(201);
      const reportQueue = (
        await moderator.get(`/api/v1/universities/${universityA}/moderation/reports`).expect(200)
      ).body.data;
      assert.equal(
        reportQueue.find((item: { id: string }) => item.id === report.id).reported_post_title,
        post.title,
      );
      const commentContext = reportQueue.find(
        (item: { comment_id: string }) => item.comment_id === comment.id,
      );
      assert.equal(commentContext.reported_comment_body, 'The main library opens at 08:00.');
      assert.equal(commentContext.related_post_id, post.id);
      await moderator
        .patch(`/api/v1/universities/${universityA}/moderation/reports/${report.id}`)
        .send({
          status: 'resolved',
          decision: 'Reviewed and removed according to campus guidelines.',
        })
        .expect(200);
      await moderator
        .post(`/api/v1/universities/${universityA}/moderation/content`)
        .send({ postId: post.id, reason: 'Removed after reviewing a student report.' })
        .expect(200);
      await student.get(`/api/v1/universities/${universityA}/posts/${post.id}`).expect(404);
      assert.equal(
        (await moderator.get(`/api/v1/universities/${universityA}/moderation/audit`).expect(200))
          .body.data.length,
        3,
      );

      // The database rejects cross-university references even if a future API route forgets a scope check.
      await assert.rejects(
        db.query('INSERT INTO bookmarks(user_id,university_id,post_id) VALUES($1,$2,$3)', [
          studentId,
          universityB,
          post.id,
        ]),
        { code: '23503' },
      );
      await assert.rejects(
        db.query(
          'INSERT INTO memberships(user_id,university_id,faculty_id,verification_method) VALUES($1,$2,$3,$4)',
          [peerId, universityB, facultyA, 'manual'],
        ),
        { code: '23503' },
      );

      await moderator
        .post(`/api/v1/universities/${universityA}/moderation/suspensions/${peerId}`)
        .send({ reason: 'Repeated violations after a documented review.' })
        .expect(200);
      await peer.get(`/api/v1/universities/${universityA}/posts`).expect(403);
      const suspendedNotifications = (await peer.get('/api/v1/notifications').expect(200)).body
        .data;
      assert(
        suspendedNotifications.some(
          (item: { title: string }) => item.title === 'University access suspended',
        ),
      );

      await student
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'student@example.edu' })
        .expect(200);
      const resetToken = delivered.findLast(
        (message) => message.to === 'student@example.edu' && message.kind === 'reset_password',
      )!.token;
      await student
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'a-new-long-test-password' })
        .expect(200);
      await student.get('/api/v1/auth/me').expect(401);
      await student
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'another-long-password' })
        .expect(400);
      await student
        .post('/api/v1/auth/login')
        .send({ email: 'student@example.edu', password: 'a-very-long-test-password' })
        .expect(401);
      await student
        .post('/api/v1/auth/login')
        .send({ email: 'student@example.edu', password: 'a-new-long-test-password' })
        .expect(200);
      await student.post('/api/v1/auth/logout').expect(204);
      await student.get('/api/v1/auth/me').expect(401);

      // Hold a password reset transaction open while an old-password login arrives.
      // Login must wait for the current hash, rather than verifying a stale hash and inserting a session later.
      const concurrentHash = await hashPassword('a-concurrent-reset-password');
      let releaseReset!: () => void;
      let resetReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        resetReady = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
      const heldReset = db.transaction(async (client) => {
        await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
          concurrentHash,
          studentId,
        ]);
        await client.query('DELETE FROM sessions WHERE user_id=$1', [studentId]);
        resetReady();
        await release;
      });
      await ready;
      const pendingLogin = student
        .post('/api/v1/auth/login')
        .send({ email: 'student@example.edu', password: 'a-new-long-test-password' })
        .then((response) => response);
      try {
        let blocked = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          const waiters = await db.query(
            "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND (query LIKE 'SELECT id,password_hash,email_verified FROM users%' OR query LIKE 'INSERT INTO sessions%')",
          );
          if (waiters.rowCount) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(blocked, true, 'Concurrent login should serialize behind the password reset.');
      } finally {
        releaseReset();
        await heldReset;
      }
      assert.equal((await pendingLogin).status, 401);
      await student.get('/api/v1/auth/me').expect(401);
    } finally {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
