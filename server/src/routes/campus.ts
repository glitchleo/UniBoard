import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Database, Queryable } from '../db.js';
import { ApiError, requireAuth, requireMembership, requireModerator, uuid } from '../http.js';
import {
  commentInput,
  email,
  feedQuery,
  httpsUrl,
  pagination,
  postInput,
  reasonInput,
} from '../validation.js';
import { tokenHash } from '../security.js';
import { assertMailAvailable, deliverToken, issueToken, type AuthOptions } from './auth.js';

const postColumns = `p.*,u.name AS author_name,u.avatar_url AS author_avatar,f.name AS faculty_name,
  (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id AND c.university_id=p.university_id AND c.deleted_at IS NULL) AS comment_count`;
const postJoins =
  'JOIN users u ON u.id=p.author_id LEFT JOIN faculties f ON f.id=p.faculty_id AND f.university_id=p.university_id';
const isModerator = (req: Request) => req.membership!.role !== 'student';

async function visiblePost(
  db: Queryable,
  req: Request,
  postId: string,
  lock: boolean | 'share' = false,
) {
  const post = (
    await db.query(
      `SELECT * FROM posts WHERE id=$1 AND university_id=$2 AND deleted_at IS NULL
      AND (faculty_id IS NULL OR faculty_id=$3 OR $4::boolean)${lock === 'share' ? ' FOR SHARE' : lock ? ' FOR UPDATE' : ''}`,
      [uuid.parse(postId), req.universityId, req.membership!.faculty_id, isModerator(req)],
    )
  ).rows[0];
  if (!post) throw new ApiError(404, 'NOT_FOUND', 'This post was not found.');
  return post;
}

async function notification(
  client: Queryable,
  universityId: string,
  userId: string,
  title: string,
  body: string,
  postId: string | null = null,
) {
  await client.query(
    'INSERT INTO notifications(university_id,user_id,title,body,post_id) VALUES($1,$2,$3,$4,$5)',
    [universityId, userId, title, body, postId],
  );
}

async function audit(
  client: Queryable,
  req: Request,
  action: string,
  targetId: string,
  reason: string,
) {
  await client.query(
    'INSERT INTO moderation_audit(university_id,actor_id,action,target_id,reason) VALUES($1,$2,$3,$4,$5)',
    [req.universityId, req.actor!.id, action, targetId, reason],
  );
}

function assertAudience(req: Request, facultyId: string | null | undefined) {
  if (facultyId && !isModerator(req) && facultyId !== req.membership!.faculty_id)
    throw new ApiError(
      403,
      'FACULTY_FORBIDDEN',
      'You can post to your own faculty or the whole university.',
    );
}

export function campusRouter(db: Database, options: AuthOptions) {
  const router = Router();

  router.get('/universities', async (_req, res) => {
    res.json({
      data: (await db.query('SELECT id,name,slug,email_domains FROM universities ORDER BY name'))
        .rows,
    });
  });
  router.get('/universities/:universityId/faculties', async (req, res) => {
    res.json({
      data: (
        await db.query('SELECT id,name FROM faculties WHERE university_id=$1 ORDER BY name', [
          uuid.parse(req.params.universityId),
        ])
      ).rows,
    });
  });

  router.use(requireAuth(db));

  router.get('/profile', async (req, res) => {
    res.json({
      data: (
        await db.query(
          'SELECT id,name,email,avatar_url,program,study_year,bio,email_verified FROM users WHERE id=$1',
          [req.actor!.id],
        )
      ).rows[0],
    });
  });
  router.patch('/profile', async (req, res) => {
    const input = z
      .strictObject({
        name: z.string().trim().min(2).max(100),
        avatarUrl: httpsUrl.nullable().optional(),
        program: z.string().trim().max(150).default(''),
        year: z.number().int().min(1).max(12).nullable().optional(),
        bio: z.string().trim().max(1000).default(''),
      })
      .parse(req.body);
    res.json({
      data: (
        await db.query(
          `UPDATE users SET name=$1,avatar_url=$2,program=$3,study_year=$4,bio=$5,updated_at=now() WHERE id=$6
       RETURNING id,name,email,avatar_url,program,study_year,bio,email_verified`,
          [
            input.name,
            input.avatarUrl ?? null,
            input.program,
            input.year ?? null,
            input.bio,
            req.actor!.id,
          ],
        )
      ).rows[0],
    });
  });

  // Account-level access lets rejected or suspended members still read moderation decisions.
  router.get('/notifications', async (req, res) => {
    const input = pagination.parse(req.query);
    res.json({
      data: (
        await db.query(
          'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',
          [req.actor!.id, input.limit, (input.page - 1) * input.limit],
        )
      ).rows,
      meta: input,
    });
  });
  router.patch('/notifications/:notificationId', async (req, res) => {
    z.strictObject({ read: z.literal(true) }).parse(req.body);
    const result = await db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *',
      [uuid.parse(req.params.notificationId), req.actor!.id],
    );
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
    res.json({ data: result.rows[0] });
  });

  router.get('/universities/:universityId/membership', async (req, res) => {
    const membership = (
      await db.query('SELECT * FROM memberships WHERE university_id=$1 AND user_id=$2', [
        uuid.parse(req.params.universityId),
        req.actor!.id,
      ])
    ).rows[0];
    res.json({ data: membership ?? null });
  });

  router.post('/universities/:universityId/membership', async (req, res) => {
    if (!req.actor!.email_verified)
      throw new ApiError(403, 'EMAIL_UNVERIFIED', 'Verify your account email first.');
    const universityId = uuid.parse(req.params.universityId);
    const input = z
      .strictObject({
        facultyId: z.uuid(),
        universityEmail: email.optional(),
        evidence: z.string().trim().min(10).max(2000).optional(),
      })
      .parse(req.body);
    const university = (
      await db.query('SELECT email_domains FROM universities WHERE id=$1', [universityId])
    ).rows[0];
    if (!university) throw new ApiError(404, 'NOT_FOUND', 'University not found.');
    const domains = university.email_domains as string[];
    const universityEmail =
      input.universityEmail ??
      (domains.includes(req.actor!.email.split('@')[1]!) ? req.actor!.email : undefined);
    if (universityEmail && !domains.includes(universityEmail.split('@')[1]!))
      throw new ApiError(
        400,
        'INVALID_UNIVERSITY_EMAIL',
        'Use a recognized university email or submit manual verification evidence.',
      );
    if (!universityEmail && !input.evidence)
      throw new ApiError(
        400,
        'EVIDENCE_REQUIRED',
        'Provide a university email or a short explanation for manual approval.',
      );
    const autoApproved = universityEmail === req.actor!.email;
    if (universityEmail && !autoApproved) assertMailAvailable(options);
    const result = await db.transaction(async (client) => {
      const membership = (
        await client.query(
          `INSERT INTO memberships(user_id,university_id,faculty_id,status,university_email,evidence,verification_method)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(user_id,university_id) DO UPDATE SET faculty_id=EXCLUDED.faculty_id,status=EXCLUDED.status,
           university_email=EXCLUDED.university_email,evidence=EXCLUDED.evidence,verification_method=EXCLUDED.verification_method,reviewed_at=NULL,reviewed_by=NULL
         WHERE memberships.status IN ('pending','rejected') RETURNING *`,
          [
            req.actor!.id,
            universityId,
            input.facultyId,
            autoApproved ? 'approved' : 'pending',
            universityEmail ?? null,
            input.evidence ?? null,
            universityEmail ? 'email' : 'manual',
          ],
        )
      ).rows[0];
      if (!membership)
        throw new ApiError(
          409,
          'MEMBERSHIP_EXISTS',
          'An approved or suspended membership cannot be replaced.',
        );
      await client.query(
        "DELETE FROM auth_tokens WHERE user_id=$1 AND university_id=$2 AND kind='verify_membership'",
        [req.actor!.id, universityId],
      );
      const token =
        universityEmail && !autoApproved
          ? await issueToken(client, req.actor!.id, 'verify_membership', universityId)
          : undefined;
      return { membership, token };
    });
    const delivery = result.token
      ? await deliverToken(options, {
          to: universityEmail!,
          kind: 'verify_membership',
          token: result.token,
          universityId,
        })
      : {};
    res.status(201).json({ data: result.membership, ...delivery });
  });

  router.post('/universities/:universityId/membership/verify', async (req, res) => {
    const universityId = uuid.parse(req.params.universityId);
    const input = z.strictObject({ token: z.string().min(20).max(128) }).parse(req.body);
    await db.transaction(async (client) => {
      const token = (
        await client.query(
          `DELETE FROM auth_tokens WHERE token_hash=$1 AND user_id=$2 AND university_id=$3 AND kind='verify_membership' AND expires_at>now() RETURNING user_id`,
          [tokenHash(input.token), req.actor!.id, universityId],
        )
      ).rows[0];
      if (!token)
        throw new ApiError(400, 'INVALID_TOKEN', 'This membership link is invalid or expired.');
      const result = await client.query(
        "UPDATE memberships SET status='approved',reviewed_at=now() WHERE user_id=$1 AND university_id=$2 AND status='pending' AND verification_method='email' RETURNING user_id",
        [req.actor!.id, universityId],
      );
      if (!result.rowCount)
        throw new ApiError(
          409,
          'MEMBERSHIP_STATE_CHANGED',
          'This membership request is no longer pending.',
        );
      await notification(
        client,
        universityId,
        req.actor!.id,
        'Membership verified',
        'Welcome! You can now take part in your campus community.',
      );
    });
    res.json({ data: { verified: true } });
  });

  // Every campus resource below uses the university captured by this approved-membership guard.
  router.use('/universities/:universityId', requireMembership(db));

  router.get('/universities/:universityId/posts', async (req, res) => {
    const input = feedQuery.parse(req.query);
    const values: unknown[] = [req.universityId, req.membership!.faculty_id, isModerator(req)];
    const conditions = [
      'p.university_id=$1',
      'p.deleted_at IS NULL',
      '(p.faculty_id IS NULL OR p.faculty_id=$2 OR $3::boolean)',
    ];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace('?', `$${values.length}`));
    };
    if (input.q)
      add("to_tsvector('simple',p.title || ' ' || p.body) @@ plainto_tsquery('simple',?)", input.q);
    if (input.type) add('p.type=?', input.type);
    if (input.facultyId) add('p.faculty_id=?', input.facultyId);
    if (input.tag) add('?=ANY(p.tags)', input.tag);
    if (input.from) add('p.created_at>=?', input.from);
    if (input.to) add('p.created_at<=?', input.to);
    if (input.mine === 'true') add('p.author_id=?', req.actor!.id);
    const where = conditions.join(' AND ');
    const count = (
      await db.query(`SELECT count(*)::int AS total FROM posts p WHERE ${where}`, values)
    ).rows[0]!.total;
    values.push(input.limit, (input.page - 1) * input.limit);
    const posts = (
      await db.query(
        `SELECT ${postColumns} FROM posts p ${postJoins} WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
    ).rows;
    res.json({ data: posts, meta: { page: input.page, limit: input.limit, total: count } });
  });

  router.post('/universities/:universityId/posts', async (req, res) => {
    const input = postInput.parse(req.body);
    assertAudience(req, input.facultyId);
    const post = (
      await db.query(
        `INSERT INTO posts(university_id,author_id,faculty_id,type,title,body,tags,details,image_url,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          req.universityId,
          req.actor!.id,
          input.facultyId ?? null,
          input.type,
          input.title,
          input.body,
          input.tags,
          JSON.stringify(input.details),
          input.imageUrl ?? null,
          input.status,
        ],
      )
    ).rows[0];
    res.status(201).json({ data: post });
  });

  router.get('/universities/:universityId/posts/:postId', async (req, res) => {
    // Authorize and fetch one snapshot; a concurrent audience change cannot slip between two reads.
    const post = (
      await db.query(
        `SELECT ${postColumns} FROM posts p ${postJoins} WHERE p.id=$1 AND p.university_id=$2
      AND p.deleted_at IS NULL AND (p.faculty_id IS NULL OR p.faculty_id=$3 OR $4::boolean)`,
        [
          uuid.parse(req.params.postId),
          req.universityId,
          req.membership!.faculty_id,
          isModerator(req),
        ],
      )
    ).rows[0];
    if (!post) throw new ApiError(404, 'NOT_FOUND', 'This post was not found.');
    res.json({ data: post });
  });

  router.put('/universities/:universityId/posts/:postId', async (req, res) => {
    const input = postInput.parse(req.body);
    assertAudience(req, input.facultyId);
    const result = await db.transaction(async (client) => {
      const post = await visiblePost(client, req, req.params.postId as string, true);
      if (post.author_id !== req.actor!.id)
        throw new ApiError(403, 'FORBIDDEN', 'Only the author can edit this post.');
      // Once votes exist, keep the poll choices stable so previous votes keep their meaning.
      if (post.type === 'Poll') {
        const votes = (
          await client.query(
            'SELECT 1 FROM poll_votes WHERE post_id=$1 AND university_id=$2 LIMIT 1',
            [post.id, req.universityId],
          )
        ).rowCount;
        if (
          votes &&
          (input.type !== 'Poll' ||
            JSON.stringify((post.details as { options: string[] }).options) !==
              JSON.stringify(input.details.options))
        )
          throw new ApiError(
            409,
            'POLL_HAS_VOTES',
            'Poll choices cannot change after voting begins.',
          );
      }
      return (
        await client.query(
          `UPDATE posts SET faculty_id=$1,type=$2,title=$3,body=$4,tags=$5,details=$6,image_url=$7,status=$8,updated_at=now()
         WHERE id=$9 AND university_id=$10 AND author_id=$11 RETURNING *`,
          [
            input.facultyId ?? null,
            input.type,
            input.title,
            input.body,
            input.tags,
            JSON.stringify(input.details),
            input.imageUrl ?? null,
            input.status,
            post.id,
            req.universityId,
            req.actor!.id,
          ],
        )
      ).rows[0];
    });
    res.json({ data: result });
  });

  router.delete('/universities/:universityId/posts/:postId', async (req, res) => {
    const result = await db.query(
      'UPDATE posts SET deleted_at=now(),updated_at=now() WHERE id=$1 AND university_id=$2 AND author_id=$3 AND deleted_at IS NULL RETURNING id',
      [uuid.parse(req.params.postId), req.universityId, req.actor!.id],
    );
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Your post was not found.');
    res.status(204).end();
  });

  router.patch('/universities/:universityId/posts/:postId/comments-status', async (req, res) => {
    const input = z.strictObject({ closed: z.boolean() }).parse(req.body);
    const result = await db.query(
      'UPDATE posts SET comments_closed=$1,updated_at=now() WHERE id=$2 AND university_id=$3 AND author_id=$4 AND deleted_at IS NULL RETURNING id,comments_closed',
      [input.closed, uuid.parse(req.params.postId), req.universityId, req.actor!.id],
    );
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Your post was not found.');
    res.json({ data: result.rows[0] });
  });

  router.get('/universities/:universityId/posts/:postId/comments', async (req, res) => {
    const input = pagination.parse(req.query);
    const rows = await db.transaction(async (client) => {
      await visiblePost(client, req, req.params.postId as string, 'share');
      return (
        await client.query(
          `SELECT c.id,c.post_id,c.author_id,c.parent_id,CASE WHEN c.deleted_at IS NULL THEN c.body ELSE '[removed]' END AS body,
       c.created_at,c.updated_at,c.deleted_at,u.name AS author_name,u.avatar_url AS author_avatar
       FROM comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 AND c.university_id=$2
       ORDER BY c.created_at,c.id LIMIT $3 OFFSET $4`,
          [req.params.postId, req.universityId, input.limit, (input.page - 1) * input.limit],
        )
      ).rows;
    });
    res.json({ data: rows, meta: input });
  });

  router.post('/universities/:universityId/posts/:postId/comments', async (req, res) => {
    const input = commentInput.parse(req.body);
    const comment = await db.transaction(async (client) => {
      const post = await visiblePost(client, req, req.params.postId as string, true);
      if (post.comments_closed)
        throw new ApiError(409, 'COMMENTS_CLOSED', 'The author has closed comments on this post.');
      let parentAuthor: string | undefined;
      if (input.parentId) {
        const parent = (
          await client.query(
            'SELECT author_id FROM comments WHERE id=$1 AND post_id=$2 AND university_id=$3 AND deleted_at IS NULL',
            [input.parentId, post.id, req.universityId],
          )
        ).rows[0];
        if (!parent)
          throw new ApiError(400, 'INVALID_PARENT', 'Reply to an existing comment on this post.');
        parentAuthor = parent.author_id as string;
      }
      const row = (
        await client.query(
          'INSERT INTO comments(university_id,post_id,author_id,parent_id,body) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [req.universityId, post.id, req.actor!.id, input.parentId ?? null, input.body],
        )
      ).rows[0];
      const recipients = new Set([
        post.author_id as string,
        ...(parentAuthor ? [parentAuthor] : []),
      ]);
      recipients.delete(req.actor!.id);
      for (const recipient of recipients)
        await notification(
          client,
          req.universityId!,
          recipient,
          recipient === parentAuthor
            ? 'Someone replied to your comment'
            : 'New comment on your post',
          `${req.actor!.name} commented on “${post.title as string}”.`,
          post.id as string,
        );
      return row;
    });
    res.status(201).json({ data: comment });
  });

  router.patch('/universities/:universityId/comments/:commentId', async (req, res) => {
    const input = z.strictObject({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
    const updated = await db.transaction(async (client) => {
      const comment = (
        await client.query(
          'SELECT post_id FROM comments WHERE id=$1 AND university_id=$2 AND author_id=$3 AND deleted_at IS NULL',
          [uuid.parse(req.params.commentId), req.universityId, req.actor!.id],
        )
      ).rows[0];
      if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Your comment was not found.');
      const post = await visiblePost(client, req, comment.post_id as string, true);
      if (post.comments_closed) throw new ApiError(409, 'COMMENTS_CLOSED', 'Comments are closed.');
      const row = (
        await client.query(
          'UPDATE comments SET body=$1,updated_at=now() WHERE id=$2 AND university_id=$3 AND author_id=$4 AND deleted_at IS NULL RETURNING *',
          [input.body, req.params.commentId, req.universityId, req.actor!.id],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Your comment was not found.');
      return row;
    });
    res.json({ data: updated });
  });

  router.delete('/universities/:universityId/comments/:commentId', async (req, res) => {
    const result = await db.query(
      'UPDATE comments SET deleted_at=now(),updated_at=now() WHERE id=$1 AND university_id=$2 AND author_id=$3 AND deleted_at IS NULL RETURNING id',
      [uuid.parse(req.params.commentId), req.universityId, req.actor!.id],
    );
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Your comment was not found.');
    res.status(204).end();
  });

  router.post('/universities/:universityId/posts/:postId/vote', async (req, res) => {
    const input = z.strictObject({ optionIndex: z.number().int().min(0).max(9) }).parse(req.body);
    await db.transaction(async (client) => {
      const post = await visiblePost(client, req, req.params.postId as string, true);
      if (post.type !== 'Poll')
        throw new ApiError(400, 'NOT_A_POLL', 'This post does not have a poll.');
      const details = post.details as { options: string[]; closingAt: string };
      if (new Date(details.closingAt) <= new Date() || post.status !== 'open')
        throw new ApiError(409, 'POLL_CLOSED', 'Voting has closed.');
      if (input.optionIndex >= details.options.length)
        throw new ApiError(400, 'INVALID_CHOICE', 'Choose an option from this poll.');
      await client.query(
        'INSERT INTO poll_votes(user_id,university_id,post_id,option_index) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,post_id) DO UPDATE SET option_index=EXCLUDED.option_index',
        [req.actor!.id, req.universityId, post.id, input.optionIndex],
      );
    });
    res.json({ data: { voted: true } });
  });
  router.get('/universities/:universityId/posts/:postId/votes', async (req, res) => {
    const data = await db.transaction(async (client) => {
      const post = await visiblePost(client, req, req.params.postId as string, 'share');
      if (post.type !== 'Poll')
        throw new ApiError(400, 'NOT_A_POLL', 'This post does not have a poll.');
      const counts = (
        await client.query(
          'SELECT option_index,count(*)::int AS votes FROM poll_votes WHERE post_id=$1 AND university_id=$2 GROUP BY option_index ORDER BY option_index',
          [post.id, req.universityId],
        )
      ).rows;
      const ownVote =
        (
          await client.query(
            'SELECT option_index FROM poll_votes WHERE post_id=$1 AND university_id=$2 AND user_id=$3',
            [post.id, req.universityId, req.actor!.id],
          )
        ).rows[0]?.option_index ?? null;
      return { counts, ownVote };
    });
    res.json({ data });
  });

  router.get('/universities/:universityId/bookmarks', async (req, res) => {
    const input = pagination.parse(req.query);
    const result = await db.query(
      `SELECT ${postColumns} FROM bookmarks b JOIN posts p ON p.id=b.post_id AND p.university_id=b.university_id ${postJoins}
      WHERE b.user_id=$1 AND b.university_id=$2 AND p.deleted_at IS NULL AND (p.faculty_id IS NULL OR p.faculty_id=$3 OR $4::boolean)
      ORDER BY b.created_at DESC,b.post_id DESC LIMIT $5 OFFSET $6`,
      [
        req.actor!.id,
        req.universityId,
        req.membership!.faculty_id,
        isModerator(req),
        input.limit,
        (input.page - 1) * input.limit,
      ],
    );
    res.json({ data: result.rows, meta: input });
  });
  router.put('/universities/:universityId/bookmarks/:postId', async (req, res) => {
    await visiblePost(db, req, req.params.postId as string);
    await db.query(
      'INSERT INTO bookmarks(user_id,university_id,post_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [req.actor!.id, req.universityId, req.params.postId],
    );
    res.json({ data: { saved: true } });
  });
  router.delete('/universities/:universityId/bookmarks/:postId', async (req, res) => {
    await db.query('DELETE FROM bookmarks WHERE user_id=$1 AND university_id=$2 AND post_id=$3', [
      req.actor!.id,
      req.universityId,
      uuid.parse(req.params.postId),
    ]);
    res.status(204).end();
  });

  router.get('/universities/:universityId/notifications', async (req, res) => {
    const input = pagination.parse(req.query);
    res.json({
      data: (
        await db.query(
          'SELECT * FROM notifications WHERE user_id=$1 AND university_id=$2 ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4',
          [req.actor!.id, req.universityId, input.limit, (input.page - 1) * input.limit],
        )
      ).rows,
      meta: input,
    });
  });
  router.patch('/universities/:universityId/notifications/:notificationId', async (req, res) => {
    z.strictObject({ read: z.literal(true) }).parse(req.body);
    const result = await db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 AND university_id=$3 RETURNING *',
      [uuid.parse(req.params.notificationId), req.actor!.id, req.universityId],
    );
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
    res.json({ data: result.rows[0] });
  });

  router.get('/universities/:universityId/clubs', async (req, res) => {
    const input = pagination.extend({ q: z.string().trim().max(100).optional() }).parse(req.query);
    const result = await db.query(
      `SELECT * FROM clubs WHERE university_id=$1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%') ORDER BY name LIMIT $3 OFFSET $4`,
      [req.universityId, input.q ?? null, input.limit, (input.page - 1) * input.limit],
    );
    res.json({ data: result.rows, meta: input });
  });

  router.post('/universities/:universityId/reports', async (req, res) => {
    const input = z
      .strictObject({
        postId: z.uuid().optional(),
        commentId: z.uuid().optional(),
        userId: z.uuid().optional(),
        reason: reasonInput,
      })
      .refine(
        (value) => [value.postId, value.commentId, value.userId].filter(Boolean).length === 1,
        'Report exactly one post, comment, or user.',
      )
      .parse(req.body);
    if (input.postId) await visiblePost(db, req, input.postId);
    if (input.commentId) {
      const comment = (
        await db.query(
          'SELECT post_id FROM comments WHERE id=$1 AND university_id=$2 AND deleted_at IS NULL',
          [input.commentId, req.universityId],
        )
      ).rows[0];
      if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Comment not found.');
      await visiblePost(db, req, comment.post_id as string);
    }
    if (input.userId) {
      const target = await db.query(
        'SELECT 1 FROM memberships WHERE user_id=$1 AND university_id=$2',
        [input.userId, req.universityId],
      );
      if (!target.rowCount) throw new ApiError(404, 'NOT_FOUND', 'University member not found.');
    }
    res.status(201).json({
      data: (
        await db.query(
          'INSERT INTO reports(university_id,reporter_id,post_id,comment_id,user_id,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at',
          [
            req.universityId,
            req.actor!.id,
            input.postId ?? null,
            input.commentId ?? null,
            input.userId ?? null,
            input.reason,
          ],
        )
      ).rows[0],
    });
  });

  router.use('/universities/:universityId/moderation', requireModerator);
  router.get('/universities/:universityId/moderation/reports', async (req, res) => {
    const input = pagination
      .extend({ status: z.enum(['pending', 'resolved', 'dismissed']).default('pending') })
      .parse(req.query);
    res.json({
      data: (
        await db.query(
          `SELECT r.*,p.title AS reported_post_title,c.body AS reported_comment_body,
      target_user.name AS reported_user_name,target_user.email AS reported_user_email,
      COALESCE(r.post_id,c.post_id) AS related_post_id
      FROM reports r LEFT JOIN posts p ON p.id=r.post_id AND p.university_id=r.university_id
      LEFT JOIN comments c ON c.id=r.comment_id AND c.university_id=r.university_id
      LEFT JOIN memberships target_membership ON target_membership.user_id=r.user_id AND target_membership.university_id=r.university_id
      LEFT JOIN users target_user ON target_user.id=target_membership.user_id
      WHERE r.university_id=$1 AND r.status=$2 ORDER BY r.created_at DESC,r.id DESC LIMIT $3 OFFSET $4`,
          [req.universityId, input.status, input.limit, (input.page - 1) * input.limit],
        )
      ).rows,
      meta: input,
    });
  });
  router.patch('/universities/:universityId/moderation/reports/:reportId', async (req, res) => {
    const input = z
      .strictObject({ status: z.enum(['resolved', 'dismissed']), decision: reasonInput })
      .parse(req.body);
    const reportId = uuid.parse(req.params.reportId);
    const report = await db.transaction(async (client) => {
      const row = (
        await client.query(
          "UPDATE reports SET status=$1,decision=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 AND university_id=$5 AND status='pending' RETURNING *",
          [input.status, input.decision, req.actor!.id, reportId, req.universityId],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Pending report not found.');
      await notification(
        client,
        req.universityId!,
        row.reporter_id as string,
        'Your report was reviewed',
        input.decision,
      );
      await audit(client, req, `report_${input.status}`, reportId, input.decision);
      return row;
    });
    res.json({ data: report });
  });

  router.get('/universities/:universityId/moderation/memberships', async (req, res) => {
    const input = pagination.parse(req.query);
    res.json({
      data: (
        await db.query(
          `SELECT m.*,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.university_id=$1 AND m.status='pending' ORDER BY m.created_at LIMIT $2 OFFSET $3`,
          [req.universityId, input.limit, (input.page - 1) * input.limit],
        )
      ).rows,
      meta: input,
    });
  });

  router.patch('/universities/:universityId/moderation/memberships/:userId', async (req, res) => {
    const input = z
      .strictObject({ status: z.enum(['approved', 'rejected']), reason: reasonInput })
      .parse(req.body);
    const userId = uuid.parse(req.params.userId);
    await db.transaction(async (client) => {
      const result = await client.query(
        "UPDATE memberships SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE user_id=$3 AND university_id=$4 AND status='pending' RETURNING user_id",
        [input.status, req.actor!.id, userId, req.universityId],
      );
      if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND', 'Pending membership not found.');
      await client.query(
        "DELETE FROM auth_tokens WHERE user_id=$1 AND university_id=$2 AND kind='verify_membership'",
        [userId, req.universityId],
      );
      await notification(
        client,
        req.universityId!,
        userId,
        `Membership ${input.status}`,
        input.reason,
      );
      await audit(client, req, `membership_${input.status}`, userId, input.reason);
    });
    res.json({ data: { status: input.status } });
  });

  router.post('/universities/:universityId/moderation/suspensions/:userId', async (req, res) => {
    const input = z.strictObject({ reason: reasonInput }).parse(req.body);
    const userId = uuid.parse(req.params.userId);
    if (userId === req.actor!.id)
      throw new ApiError(400, 'SELF_SUSPENSION', 'You cannot suspend your own account.');
    await db.transaction(async (client) => {
      const member = (
        await client.query(
          'SELECT role,status FROM memberships WHERE user_id=$1 AND university_id=$2 FOR UPDATE',
          [userId, req.universityId],
        )
      ).rows[0];
      if (!member) throw new ApiError(404, 'NOT_FOUND', 'University member not found.');
      if (
        member.role === 'admin' ||
        (member.role === 'moderator' && req.membership!.role !== 'admin')
      )
        throw new ApiError(403, 'FORBIDDEN', 'You cannot suspend this member.');
      await client.query(
        "UPDATE memberships SET status='suspended',reviewed_by=$1,reviewed_at=now() WHERE user_id=$2 AND university_id=$3",
        [req.actor!.id, userId, req.universityId],
      );
      await client.query(
        "DELETE FROM auth_tokens WHERE user_id=$1 AND university_id=$2 AND kind='verify_membership'",
        [userId, req.universityId],
      );
      await notification(
        client,
        req.universityId!,
        userId,
        'University access suspended',
        input.reason,
      );
      await audit(client, req, 'membership_suspended', userId, input.reason);
    });
    res.json({ data: { suspended: true } });
  });

  router.post('/universities/:universityId/moderation/content', async (req, res) => {
    const input = z
      .strictObject({
        postId: z.uuid().optional(),
        commentId: z.uuid().optional(),
        reason: reasonInput,
      })
      .refine(
        (value) => Boolean(value.postId) !== Boolean(value.commentId),
        'Choose exactly one content item.',
      )
      .parse(req.body);
    await db.transaction(async (client) => {
      const row = input.postId
        ? (
            await client.query(
              'UPDATE posts SET deleted_at=now(),updated_at=now() WHERE id=$1 AND university_id=$2 AND deleted_at IS NULL RETURNING author_id,id AS post_id',
              [input.postId, req.universityId],
            )
          ).rows[0]
        : (
            await client.query(
              'UPDATE comments SET deleted_at=now(),updated_at=now() WHERE id=$1 AND university_id=$2 AND deleted_at IS NULL RETURNING author_id,post_id',
              [input.commentId, req.universityId],
            )
          ).rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Content not found.');
      await notification(
        client,
        req.universityId!,
        row.author_id as string,
        'Your content was removed',
        input.reason,
        row.post_id as string,
      );
      await audit(
        client,
        req,
        input.postId ? 'post_removed' : 'comment_removed',
        (input.postId ?? input.commentId)!,
        input.reason,
      );
    });
    res.json({ data: { removed: true } });
  });

  router.get('/universities/:universityId/moderation/audit', async (req, res) => {
    const input = pagination.parse(req.query);
    res.json({
      data: (
        await db.query(
          'SELECT * FROM moderation_audit WHERE university_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
          [req.universityId, input.limit, (input.page - 1) * input.limit],
        )
      ).rows,
      meta: input,
    });
  });

  return router;
}
