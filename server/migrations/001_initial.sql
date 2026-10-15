-- PostgreSQL 15+ provides gen_random_uuid() without an extension.
CREATE TABLE universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  email_domains text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faculties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  name text NOT NULL,
  UNIQUE (university_id, name),
  UNIQUE (id, university_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  avatar_url text,
  program text NOT NULL DEFAULT '',
  study_year smallint CHECK (study_year BETWEEN 1 AND 12),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 1000),
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id uuid NOT NULL REFERENCES users(id),
  university_id uuid NOT NULL REFERENCES universities(id),
  faculty_id uuid,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'moderator', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  university_email text,
  evidence text CHECK (length(evidence) <= 2000),
  verification_method text NOT NULL CHECK (verification_method IN ('email', 'manual')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, university_id),
  FOREIGN KEY (faculty_id, university_id) REFERENCES faculties(id, university_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  university_id uuid REFERENCES universities(id),
  kind text NOT NULL CHECK (kind IN ('verify_email', 'reset_password', 'verify_membership')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'verify_membership') = (university_id IS NOT NULL))
);
CREATE INDEX auth_tokens_expiry_idx ON auth_tokens(expires_at);
CREATE UNIQUE INDEX auth_tokens_single_idx ON auth_tokens(user_id,kind,COALESCE(university_id,'00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  author_id uuid NOT NULL REFERENCES users(id),
  faculty_id uuid,
  type text NOT NULL CHECK (type IN ('Announcement', 'Club recruitment', 'Event', 'Opportunity', 'Find teammates', 'Study group', 'Question', 'Lost & found', 'Poll')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 8),
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  image_url text,
  comments_closed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'resolved', 'closed')),
  pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, university_id),
  FOREIGN KEY (author_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (faculty_id, university_id) REFERENCES faculties(id, university_id)
);
CREATE INDEX posts_feed_idx ON posts(university_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_tags_idx ON posts USING gin(tags);
CREATE INDEX posts_search_idx ON posts USING gin(to_tsvector('simple', title || ' ' || body));

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  post_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id),
  parent_id uuid,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, university_id),
  UNIQUE (id, post_id, university_id),
  FOREIGN KEY (post_id, university_id) REFERENCES posts(id, university_id),
  FOREIGN KEY (author_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (parent_id, post_id, university_id) REFERENCES comments(id, post_id, university_id),
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX comments_post_idx ON comments(university_id, post_id, created_at);

CREATE TABLE bookmarks (
  user_id uuid NOT NULL REFERENCES users(id),
  university_id uuid NOT NULL REFERENCES universities(id),
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id),
  FOREIGN KEY (user_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (post_id, university_id) REFERENCES posts(id, university_id)
);

CREATE TABLE poll_votes (
  user_id uuid NOT NULL REFERENCES users(id),
  university_id uuid NOT NULL REFERENCES universities(id),
  post_id uuid NOT NULL,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 9),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id),
  FOREIGN KEY (user_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (post_id, university_id) REFERENCES posts(id, university_id)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  university_id uuid NOT NULL REFERENCES universities(id),
  post_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (post_id, university_id) REFERENCES posts(id, university_id)
);
CREATE INDEX notifications_user_idx ON notifications(user_id, university_id, created_at DESC);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  post_id uuid,
  comment_id uuid,
  user_id uuid,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  decision text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (reporter_id, university_id) REFERENCES memberships(user_id, university_id),
  FOREIGN KEY (post_id, university_id) REFERENCES posts(id, university_id),
  FOREIGN KEY (comment_id, university_id) REFERENCES comments(id, university_id),
  FOREIGN KEY (user_id, university_id) REFERENCES memberships(user_id, university_id),
  CHECK (num_nonnulls(post_id, comment_id, user_id) = 1)
);
CREATE INDEX reports_review_idx ON reports(university_id, status, created_at DESC);

CREATE TABLE moderation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id, university_id) REFERENCES memberships(user_id, university_id)
);

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id),
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  contact_email text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (university_id, name)
);
