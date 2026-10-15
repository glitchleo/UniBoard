import { useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  Flag,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Board } from '../features/board/useBoard';
import { timeAgo } from '../data';
import type { ApiClub } from '../lib/api';

const clubs = [
  {
    name: 'Tirana Tech Club',
    mark: '< / >',
    category: 'Technology',
    description:
      'A place to build things, break things, and figure them out together. Hackathons, practical workshops, and curious people.',
    members: 'Programming · Design · Building',
    joining:
      'Come to the Innovation Hub on Wednesdays at 17:00. Bring your laptop and an idea, or just your curiosity.',
    color: 'green',
  },
  {
    name: 'UT Debate Society',
    mark: '“ ”',
    category: 'Culture',
    description:
      'Find your voice and hear a different point of view. Friendly debates, public speaking, and very good company.',
    members: 'Debate · Public speaking · Ideas',
    joining:
      'The autumn introduction is October 20 at 18:00 in Faculty of Law, room 12. No experience needed.',
    color: 'purple',
  },
  {
    name: 'Green Campus',
    mark: '✳',
    category: 'Volunteering',
    description:
      'Small actions for a campus we all want to spend time in. Clean-ups, sustainability projects, and plenty of fresh air.',
    members: 'Sustainability · Volunteering',
    joining:
      'Meet us at the main campus entrance for the next Saturday clean-up at 09:30. Gloves and bags are provided.',
    color: 'orange',
  },
  {
    name: 'The Campus Lens',
    mark: '◎',
    category: 'Creative',
    description:
      'See the familiar a little differently. Photo walks, creative challenges, and stories from our university.',
    members: 'Photography · Art · Storytelling',
    joining:
      'Drop by the student common room on Thursdays at 16:00. A phone camera is enough to get started.',
    color: 'blue',
  },
];

export function ClubsPage({ university, apiClubs }: { university: string; apiClubs?: ApiClub[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All clubs');
  const source = apiClubs
    ? apiClubs.map((club) => ({
        name: club.name,
        mark: club.name.slice(0, 2).toUpperCase(),
        category: club.category,
        description: club.description,
        members: club.category,
        joining: club.contact_email
          ? `Contact ${club.contact_email} for joining instructions and the next meeting.`
          : 'Contact the university student affairs office for joining instructions.',
        color: 'green',
      }))
    : university === 'University of Tirana'
      ? clubs
      : [];
  const filtered = source.filter(
    (club) =>
      `${club.name} ${club.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'All clubs' || club.category === category),
  );
  return (
    <>
      <PageHeading
        eyebrow="FIND YOUR KIND OF PEOPLE"
        title="Clubs and communities"
        description="Find university clubs and view their joining instructions."
      />
      <div className="directory-search">
        <Search size={17} />
        <input
          aria-label="Search clubs"
          placeholder="Search clubs and communities…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Club category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {['All clubs', ...new Set(source.map((club) => club.category))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <p className="section-caption">
        {filtered.length} COMMUNITIES TO EXPLORE{' '}
        <span>{apiClubs ? university : 'Sample campus directory'}</span>
      </p>
      <div className="club-grid">
        {filtered.map((club) => (
          <article className="club-card" key={club.name}>
            <div className={`club-mark ${club.color}`}>{club.mark}</div>
            <span className={`type-pill ${club.color}`}>{club.category}</span>
            <h2>{club.name}</h2>
            <p>{club.description}</p>
            <small>
              <Users size={13} />
              {club.members}
            </small>
            <details>
              <summary>
                How to join
                <ChevronDown size={14} />
              </summary>
              <p>{club.joining}</p>
            </details>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Users size={30} />
          <h2>No clubs found.</h2>
          <p>Try a different search, or check back as your campus grows.</p>
        </div>
      )}
    </>
  );
}

export function NotificationsPage({
  board,
  onOpen,
  apiMode = false,
}: {
  board: Pick<Board, 'notifications' | 'markRead' | 'posts' | 'notify'>;
  onOpen: (id: string) => void;
  apiMode?: boolean;
}) {
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE HEADS-UP"
        title="Notifications"
        description="Comments, replies, and updates about your account."
      />
      <div className="section-topline">
        <span>{board.notifications.filter((n) => !n.read).length} unread notifications</span>
        <button onClick={() => board.markRead()}>
          <CheckCheck size={14} />
          Mark all as read
        </button>
      </div>
      <div className="notification-list">
        {board.notifications.map((notification) => (
          <button
            className={`notification-item ${!notification.read ? 'unread' : ''}`}
            key={notification.id}
            onClick={() => {
              board.markRead(notification.id);
              if (
                notification.postId &&
                (apiMode || board.posts.some((p) => p.id === notification.postId))
              )
                onOpen(notification.postId);
              else board.notify(notification.body);
            }}
          >
            <span className="notification-symbol">
              <Bell size={19} />
            </span>
            <span>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <small>{timeAgo(notification.createdAt)}</small>
            </span>
            {!notification.read && <span className="unread-dot" />}
          </button>
        ))}
      </div>
      <p className="preview-note">
        {apiMode
          ? 'Notifications are loaded from your account. Open a notification to see the related post when campus access permits.'
          : 'These are sample notifications stored in your browser.'}
      </p>
    </>
  );
}

export function ModerationPage({ board, onOpen }: { board: Board; onOpen: (id: string) => void }) {
  return (
    <>
      <PageHeading
        eyebrow="COMMUNITY CARE · DEMO TOOLS"
        title="Moderation demo"
        description="Explore the reporting workflow using this browser's sample data."
      />
      <div className="inline-note">
        <ShieldCheck size={20} />
        <p>
          This demo uses sample reports stored in your browser. Actions here do not affect real
          reports or accounts.
        </p>
      </div>
      <div className="section-topline">
        <span>{board.reports.filter((r) => r.status === 'pending').length} pending reports</span>
        <span>THIS BROWSER ONLY</span>
      </div>
      {board.reports.map((report) => (
        <article className="report-item" key={report.id}>
          <div className="report-title">
            <Flag size={16} />
            <strong>
              {board.posts.find((post) => post.id === report.postId)?.title ?? 'Removed post'}
            </strong>
            <span className={`type-pill ${report.status === 'resolved' ? 'event' : 'opportunity'}`}>
              {report.status}
            </span>
          </div>
          <p>{report.reason}</p>
          <small>{timeAgo(report.createdAt)}</small>
          <div>
            <button className="button secondary" onClick={() => onOpen(report.postId)}>
              Review post
              <ArrowUpRight size={13} />
            </button>
            {report.status === 'pending' && (
              <button className="button secondary" onClick={() => board.resolveReport(report.id)}>
                <Check size={14} />
                Resolve demo report
              </button>
            )}
          </div>
        </article>
      ))}
      {!board.reports.length && (
        <div className="empty-state">
          <ShieldCheck size={30} strokeWidth={1.4} />
          <h2>All quiet on campus.</h2>
          <p>Reports submitted through a post appear here for the demo.</p>
        </div>
      )}
    </>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
