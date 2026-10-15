import assert from 'node:assert/strict';
import test from 'node:test';
import { mapComment, mapPost, mapProfile, postInput } from '../src/lib/api-mappers.ts';
import { apiRequest, ApiRequestError } from '../src/lib/api.ts';
import type { ApiPost, ApiUser, ApiUniversity, ApiFaculty } from '../src/lib/api.ts';
import { postInput as serverPostInput } from '../../server/src/validation.ts';

const facultyId = '11111111-1111-4111-8111-111111111111';
const faculties = [{ id: facultyId, name: 'Natural Sciences' }];
const base: ApiPost = {
  id: '22222222-2222-4222-8222-222222222222',
  university_id: '33333333-3333-4333-8333-333333333333',
  author_id: '44444444-4444-4444-8444-444444444444',
  author_name: 'Campus Student',
  author_avatar: null,
  faculty_id: null,
  faculty_name: null,
  type: 'Question',
  title: 'A useful campus post',
  body: 'A real description that remains intact.',
  tags: ['campus'],
  details: {},
  image_url: null,
  status: 'open',
  pinned: false,
  comments_closed: false,
  created_at: '2026-10-15T10:00:00Z',
  comment_count: 3,
};

const cases: [ApiPost['type'], Record<string, unknown>][] = [
  ['Announcement', { audience: 'All faculties', expiryDate: '2026-11-01T12:00:00Z' }],
  [
    'Club recruitment',
    {
      club: 'Tech Club',
      joiningInstructions: 'Meet us at the library.',
      applicationDeadline: '2026-11-01T12:00:00Z',
    },
  ],
  [
    'Event',
    {
      startsAt: '2026-11-01T12:00:00Z',
      endsAt: '2026-11-01T14:00:00Z',
      location: 'Room 12',
      organizer: 'Tech Club',
      registrationUrl: 'https://example.com/register',
    },
  ],
  [
    'Opportunity',
    {
      deadline: '2026-11-01T12:00:00Z',
      eligibility: 'Current students',
      organizer: 'Tech Club',
      applicationUrl: 'https://example.com/apply',
    },
  ],
  [
    'Find teammates',
    { skillsNeeded: ['React', 'Design'], peopleNeeded: 2, deadline: '2026-11-01T12:00:00Z' },
  ],
  [
    'Study group',
    {
      course: 'Databases',
      format: 'in-person',
      schedule: 'Fridays at 15:00',
      places: 6,
      location: 'Library',
    },
  ],
  ['Question', { topic: 'Exchange semesters' }],
  [
    'Lost & found',
    { item: 'Student card', location: 'Building B', foundAt: '2026-10-15T12:00:00Z' },
  ],
  ['Poll', { options: ['Coding', 'Design'], closingAt: '2026-11-01T12:00:00Z' }],
];

for (const [type, details] of cases)
  test(`${type}: server DTO round-trips into valid server input`, () => {
    const mapped = mapPost({ ...base, type, details });
    const payload = postInput(mapped, faculties);
    const parsed = serverPostInput.parse(payload);
    assert.equal(parsed.type, type);
    assert.equal(parsed.title, base.title);
    assert.equal(parsed.facultyId, null);
    assert.equal(mapped.commentCount, 3);
    // ISO formatting may normalize offsets, so compare structured non-date values individually.
    for (const [key, value] of Object.entries(details)) {
      const actual = (parsed.details as Record<string, unknown>)[key];
      if (/At$|Date$|Deadline$|^deadline$/.test(key))
        assert.equal(new Date(String(actual)).getTime(), new Date(String(value)).getTime());
      else assert.deepEqual(actual, value);
    }
  });

test('faculty audience uses current university IDs and rejects unknown faculties', () => {
  const mapped = mapPost({ ...base, faculty_id: facultyId, faculty_name: 'Natural Sciences' });
  assert.equal(postInput(mapped, faculties).facultyId, facultyId);
  assert.throws(() => postInput(mapped, []), /current university/);
});

test('invalid required dates fail before making a server request', () => {
  const post = mapPost({
    ...base,
    type: 'Event',
    details: { startsAt: 'not-a-date', location: 'Library', organizer: 'Students' },
  });
  assert.throws(() => postInput(post, faculties), /valid date and time/);
});

test('English date and time are normalized without changing other fields', () => {
  const post = mapPost({
    ...base,
    type: 'Event',
    details: { startsAt: 'October 23, 2026 at 17:00', location: 'Library', organizer: 'Students' },
  });
  assert.doesNotThrow(() => serverPostInput.parse(postInput(post, faculties)));
});

test('legacy composer aliases still map teammate and study group fields', () => {
  const teammates = mapPost({
    ...base,
    type: 'Find teammates',
    details: { skillsNeeded: ['React'], peopleNeeded: 2 },
  });
  teammates.details.Skills = teammates.details['Skills needed'];
  teammates.details.People = teammates.details['Open places'];
  delete teammates.details['Skills needed'];
  delete teammates.details['Open places'];
  assert.doesNotThrow(() => serverPostInput.parse(postInput(teammates, faculties)));
  const study = mapPost({
    ...base,
    type: 'Study group',
    details: { course: 'Databases', format: 'online', schedule: 'Fridays', places: 3 },
  });
  study.details.Places = study.details['Available places'];
  delete study.details['Available places'];
  assert.doesNotThrow(() => serverPostInput.parse(postInput(study, faculties)));
});

test('server validation catches missing API-required choices and unsafe image schemes', () => {
  const poll = mapPost({
    ...base,
    type: 'Poll',
    details: { options: ['One'], closingAt: '2026-11-01T12:00:00Z' },
  });
  assert.equal(serverPostInput.safeParse(postInput(poll, faculties)).success, false);
  const question = mapPost({ ...base, type: 'Question' });
  question.image = 'http://example.com/image.jpg';
  assert.equal(serverPostInput.safeParse(postInput(question, faculties)).success, false);
});

test('comments carry server identity; removed comments cannot acquire own controls', () => {
  const comment = {
    id: 'comment',
    author_id: base.author_id,
    author_name: 'Campus Student',
    author_avatar: null,
    parent_id: 'parent',
    body: 'Hello',
    created_at: base.created_at,
    deleted_at: null,
  };
  assert.equal(mapComment(comment).authorId, base.author_id);
  assert.equal(mapComment(comment).parentId, 'parent');
  assert.equal(
    mapComment({ ...comment, deleted_at: base.created_at, body: '[removed]' }).authorId,
    undefined,
  );
});

test('profile membership affiliation comes from server IDs', () => {
  const profile = mapProfile(
    {
      id: base.author_id,
      name: 'Campus Student',
      email: 'student@example.com',
      email_verified: true,
      avatar_url: null,
      program: 'Computing',
      study_year: 2,
      bio: '',
    },
    { id: base.university_id, name: 'University of Tirana', slug: 'ut', email_domains: [] },
    {
      user_id: base.author_id,
      university_id: base.university_id,
      faculty_id: facultyId,
      status: 'approved',
      role: 'student',
    },
    faculties,
  );
  assert.equal(profile.faculty, 'Natural Sciences');
  assert.equal(profile.avatar, 'CS');
});

test('API transport retains structured validation feedback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check fields.',
          details: [{ path: ['details', 'places'], message: 'At least one place.' }],
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  try {
    await assert.rejects(
      apiRequest('/test'),
      (error) =>
        error instanceof ApiRequestError &&
        error.code === 'VALIDATION_ERROR' &&
        error.message.includes('details.places'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API transport rejects malformed success envelopes with a consistent error', async () => {
  const originalFetch = globalThis.fetch;
  const invalidPayloads = [
    null,
    true,
    42,
    'ok',
    [],
    {},
    { data: [], meta: [] },
    { data: [], meta: { page: 1, limit: 0 } },
    { data: [], meta: { page: 1, limit: 100, total: -1 } },
    { data: [], developmentToken: 42 },
    { data: [], message: {} },
  ];
  try {
    for (const payload of invalidPayloads) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload));
      await assert.rejects(
        apiRequest('/test'),
        (error) =>
          error instanceof ApiRequestError &&
          error.status === 200 &&
          error.code === 'INVALID_RESPONSE',
        `Payload: ${JSON.stringify(payload)}`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API transport preserves valid response metadata and optional messages', async () => {
  const originalFetch = globalThis.fetch;
  const payload = {
    data: [],
    meta: { page: 1, limit: 100, total: 0 },
    developmentToken: 'development-only-token',
    message: 'Check your email.',
  };
  globalThis.fetch = async () => new Response(JSON.stringify(payload));
  try {
    assert.deepEqual(await apiRequest('/test'), payload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API transport falls back safely for malformed error payloads', async () => {
  const originalFetch = globalThis.fetch;
  const invalidPayloads = [
    null,
    true,
    'failed',
    [],
    { error: null },
    { error: { code: {}, message: [], details: {} } },
    { error: { code: '', message: '', details: [null, false, { message: {} }] } },
  ];
  try {
    for (const payload of invalidPayloads) {
      globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 502 });
      await assert.rejects(
        apiRequest('/test'),
        (error) =>
          error instanceof ApiRequestError &&
          error.status === 502 &&
          error.code === 'REQUEST_FAILED' &&
          error.message === 'The server returned 502. Please try again.',
        `Payload: ${JSON.stringify(payload)}`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API transport retains useful feedback when some validation details are malformed', async () => {
  const originalFetch = globalThis.fetch;
  let details: unknown = 'unexpected text';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { code: 'VALIDATION_ERROR', message: 'Check the form.', details },
      }),
      { status: 400 },
    );
  try {
    await assert.rejects(
      apiRequest('/test'),
      (error) =>
        error instanceof ApiRequestError &&
        error.code === 'VALIDATION_ERROR' &&
        error.message === 'Check the form.',
    );
    details = [
      null,
      { message: {} },
      { path: ['details', 'places'], message: 'At least one place.' },
      { path: {}, message: 'Choose a faculty.' },
    ];
    await assert.rejects(
      apiRequest('/test'),
      (error) =>
        error instanceof ApiRequestError &&
        error.code === 'VALIDATION_ERROR' &&
        error.message === 'details.places: At least one place. Field: Choose a faculty.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API transport handles 204 and sends same-origin JSON requests', async () => {
  const originalFetch = globalThis.fetch;
  let requestOptions: RequestInit | undefined;
  globalThis.fetch = async (_input, options) => {
    requestOptions = options;
    return new Response(null, { status: 204 });
  };
  try {
    assert.deepEqual(await apiRequest('/auth/logout', { method: 'POST', body: { read: true } }), {
      data: undefined,
    });
    assert.equal(requestOptions?.credentials, 'same-origin');
    assert.equal(new Headers(requestOptions?.headers).get('Content-Type'), 'application/json');
    assert.equal(requestOptions?.body, JSON.stringify({ read: true }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(
  'live development API: session, memberships, feed, and mapper contracts',
  { skip: !process.env.UNIBOARD_API_TEST_URL },
  async () => {
    const origin = process.env.UNIBOARD_API_TEST_URL!;
    assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    const originalFetch = globalThis.fetch;
    let cookie = '';
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      if (cookie) headers.set('Cookie', cookie);
      const response = await originalFetch(new URL(String(input), origin), { ...init, headers });
      const session = response.headers.get('set-cookie');
      if (session) cookie = session.split(';')[0];
      return response;
    };
    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: { email: 'elira.hoxha@student.unitir.edu.al', password: 'UniBoard-Student-2026!' },
      });
      const me = (await apiRequest<ApiUser>('/auth/me')).data;
      assert.ok(me.email_verified);
      const membership = me.memberships!.find((member) => member.status === 'approved')!;
      const universities = (await apiRequest<ApiUniversity[]>('/universities')).data;
      const faculties = (
        await apiRequest<ApiFaculty[]>(`/universities/${membership.university_id}/faculties`)
      ).data;
      const feed = await apiRequest<ApiPost[]>(
        `/universities/${membership.university_id}/posts?limit=100`,
      );
      assert.ok(universities.some((university) => university.id === membership.university_id));
      assert.ok(faculties.length > 0);
      assert.ok(feed.data.length >= 3);
      for (const row of feed.data)
        assert.doesNotThrow(() => serverPostInput.parse(postInput(mapPost(row), faculties)));
    } finally {
      await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
      globalThis.fetch = originalFetch;
    }
  },
);
