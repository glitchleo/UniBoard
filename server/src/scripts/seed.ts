import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createDatabase } from '../db.js';
import { hashPassword } from '../security.js';

if (existsSync('.env')) loadEnvFile('.env');
if (process.env.NODE_ENV !== 'development')
  throw new Error(
    'The demo seed is permitted only with NODE_ENV=development. Never use demo credentials in production.',
  );
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed the database.');
const db = createDatabase(process.env.DATABASE_URL);
const studentPassword = 'UniBoard-Student-2026!';
const moderatorPassword = 'UniBoard-Moderator-2026!';
try {
  const studentHash = await hashPassword(studentPassword);
  const moderatorHash = await hashPassword(moderatorPassword);
  await db.transaction(async (client) => {
    const university = (
      await client.query(
        `INSERT INTO universities(name,slug,email_domains) VALUES('University of Tirana','university-of-tirana',ARRAY['student.unitir.edu.al','unitir.edu.al']) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      )
    ).rows[0]!;
    for (const name of [
      'Natural Sciences',
      'Economics',
      'Law',
      'History & Philology',
      'Foreign Languages',
      'Social Sciences',
    ])
      await client.query(
        'INSERT INTO faculties(university_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [university.id, name],
      );
    const faculty = (
      await client.query(
        "SELECT id FROM faculties WHERE university_id=$1 AND name='Natural Sciences'",
        [university.id],
      )
    ).rows[0]!;
    const student = (
      await client.query(
        `INSERT INTO users(name,email,password_hash,email_verified,program,study_year,bio)
      VALUES('Elira Hoxha','elira.hoxha@student.unitir.edu.al',$1,true,'Computer Science',3,'Computer science student. Always learning, always building.')
      ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [studentHash],
      )
    ).rows[0]!;
    const moderator = (
      await client.query(
        `INSERT INTO users(name,email,password_hash,email_verified,program)
      VALUES('Campus Moderator','moderator@unitir.edu.al',$1,true,'Student Affairs') ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [moderatorHash],
      )
    ).rows[0]!;
    for (const [userId, role] of [
      [student.id, 'student'],
      [moderator.id, 'moderator'],
    ])
      await client.query(
        `INSERT INTO memberships(user_id,university_id,faculty_id,status,role,verification_method) VALUES($1,$2,$3,'approved',$4,'manual') ON CONFLICT DO NOTHING`,
        [userId, university.id, faculty.id, role],
      );
    for (const club of [
      [
        'Tirana Tech Club',
        'Build projects, learn from each other, and meet your next hackathon team.',
        'Technology',
        'techclub@unitir.edu.al',
      ],
      [
        'UT Debate Society',
        'A welcoming place to practice speaking, listen to new perspectives, and debate.',
        'Culture & debate',
        'debate@unitir.edu.al',
      ],
      [
        'Green Campus',
        'Student-led volunteering and practical projects for a greener campus.',
        'Volunteering',
        'greencampus@unitir.edu.al',
      ],
    ])
      await client.query(
        'INSERT INTO clubs(university_id,name,description,category,contact_email) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [university.id, ...club],
      );
    const seededPosts = [
      {
        type: 'Event',
        title: 'Build something that matters.',
        body: 'Join Tirana Hackathon 2026 for a weekend of building, learning, and meeting students from every faculty. All skill levels are welcome.',
        tags: ['programming', 'hackathon'],
        details: {
          startsAt: '2026-10-23T17:00:00+02:00',
          endsAt: '2026-10-25T17:00:00+01:00',
          location: 'Campus Innovation Hub',
          organizer: 'Tirana Tech Club',
        },
      },
      {
        type: 'Study group',
        title: 'SQL, snacks, and a little mutual support.',
        body: 'A small study group for the Databases midterm. Bring your laptop, notes, and the questions you got stuck on.',
        tags: ['databases', 'study-together'],
        details: {
          course: 'Databases',
          format: 'in-person',
          schedule: 'Saturday, October 17 · 11:00–13:00',
          places: 6,
          location: 'Natural Sciences Library',
        },
      },
      {
        type: 'Question',
        title: 'Erasmus applications: where do we start?',
        body: 'Has anyone been through the exchange application process? Which documents should we prepare first?',
        tags: ['erasmus', 'student-advice'],
        details: { topic: 'Exchange semesters' },
      },
    ];
    for (const post of seededPosts)
      await client.query(
        `INSERT INTO posts(university_id,author_id,type,title,body,tags,details)
      SELECT $1,$2,$3,$4,$5,$6,$7 WHERE NOT EXISTS(SELECT 1 FROM posts WHERE university_id=$1 AND author_id=$2 AND title=$4)`,
        [
          university.id,
          student.id,
          post.type,
          post.title,
          post.body,
          post.tags,
          JSON.stringify(post.details),
        ],
      );
  });
  console.log('Development seed complete. Existing accounts keep their passwords.');
  console.log('New student: elira.hoxha@student.unitir.edu.al / UniBoard-Student-2026!');
  console.log('New moderator: moderator@unitir.edu.al / UniBoard-Moderator-2026!');
} finally {
  await db.close();
}
