import type { Comment, Notification, Post, Profile, Report } from '../types';
import type {
  ApiComment,
  ApiFaculty,
  ApiMembership,
  ApiNotification,
  ApiPost,
  ApiReport,
  ApiUniversity,
  ApiUser,
  ApiVotes,
} from './api';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
const text = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const dateLabel = (value: unknown) => text(value); // Keep the ISO value intact so editing round-trips precisely.
export const emptyApiProfile: Profile = {
  id: '',
  name: 'Your account',
  email: '',
  faculty: '',
  program: '',
  year: '',
  bio: '',
  avatar: 'YOU',
  university: 'Choose your university',
  verified: false,
};

export function mapProfile(
  user: ApiUser,
  university?: ApiUniversity,
  membership?: ApiMembership,
  faculties: ApiFaculty[] = [],
): Profile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    faculty: faculties.find((faculty) => faculty.id === membership?.faculty_id)?.name ?? '',
    program: user.program ?? '',
    year: user.study_year ? String(user.study_year) : '',
    bio: user.bio ?? '',
    avatar: user.avatar_url || initials(user.name),
    university: university?.name ?? 'Choose your university',
    verified: user.email_verified,
  };
}

export function mapComment(comment: ApiComment): Comment {
  return {
    id: comment.id,
    ...(comment.deleted_at ? {} : { authorId: comment.author_id }),
    author: comment.deleted_at ? 'Removed comment' : comment.author_name,
    avatar: comment.deleted_at ? '·' : comment.author_avatar || initials(comment.author_name),
    body: comment.body,
    createdAt: comment.created_at,
    ...(comment.parent_id ? { parentId: comment.parent_id } : {}),
  };
}

export function mapPost(post: ApiPost, comments: ApiComment[] = [], voteData?: ApiVotes): Post {
  const d = post.details;
  const details: Record<string, string> = { Audience: post.faculty_name ?? 'All faculties' };
  const set = (label: string, value: unknown) => {
    const mapped = text(value);
    if (mapped) details[label] = mapped;
  };
  switch (post.type) {
    case 'Announcement':
      set('Audience', d.audience);
      set('Expiry date', dateLabel(d.expiryDate));
      break;
    case 'Club recruitment':
      set('Club', d.club);
      set('Joining instructions', d.joiningInstructions);
      set('Deadline', dateLabel(d.applicationDeadline));
      break;
    case 'Event':
      set('Date', dateLabel(d.startsAt));
      set('End date', dateLabel(d.endsAt));
      set('Location', d.location);
      set('Organizer', d.organizer);
      set('Registration', d.registrationUrl);
      break;
    case 'Opportunity':
      set('Deadline', dateLabel(d.deadline));
      set('Eligibility', d.eligibility);
      set('Organizer', d.organizer);
      set('Application', d.applicationUrl);
      break;
    case 'Find teammates':
      set('Skills needed', Array.isArray(d.skillsNeeded) ? d.skillsNeeded.join(', ') : '');
      set('Open places', d.peopleNeeded);
      set('Deadline', dateLabel(d.deadline));
      set('Status', post.status === 'filled' ? 'Filled' : 'Open');
      break;
    case 'Study group':
      set('Course', d.course);
      set(
        'Format',
        d.format === 'in-person' ? 'In person' : d.format === 'online' ? 'Online' : 'Hybrid',
      );
      set('Schedule', d.schedule);
      set('Available places', d.places);
      set('Location', d.location);
      break;
    case 'Question':
      set('Topic', d.topic);
      break;
    case 'Lost & found':
      set('Item', d.item);
      set('Location', d.location);
      set('Date', dateLabel(d.foundAt));
      set('Status', post.status === 'resolved' ? 'Resolved' : 'Unresolved');
      break;
    case 'Poll':
      set('Closing date', dateLabel(d.closingAt));
      break;
  }
  const options =
    post.type === 'Poll' && Array.isArray(d.options)
      ? d.options.filter((option): option is string => typeof option === 'string')
      : undefined;
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    body: post.body,
    author: post.author_name ?? 'Campus member',
    authorId: post.author_id,
    avatar: post.author_avatar || initials(post.author_name ?? 'Campus member'),
    faculty: post.faculty_name ?? 'All faculties',
    tags: post.tags,
    createdAt: post.created_at,
    image: post.image_url ?? undefined,
    pinned: post.pinned,
    likes: 0,
    comments: comments.map(mapComment),
    commentCount: post.comment_count ?? comments.filter((comment) => !comment.deleted_at).length,
    details,
    status: post.status,
    commentsClosed: post.comments_closed,
    ...(options
      ? {
          pollOptions: options,
          votes: Object.fromEntries(
            options.map((option, index) => [
              option,
              voteData?.counts.find((count) => count.option_index === index)?.votes ?? 0,
            ]),
          ),
        }
      : {}),
  };
}

function isoDate(value: string | undefined, label: string, required = false): string | undefined {
  if (!value?.trim()) {
    if (required) throw new Error(`Add ${label} before publishing to the server.`);
    return undefined;
  }
  const date = new Date(value.replace(/\s*[·]\s*|\s+at\s+/g, ' '));
  if (!Number.isFinite(date.getTime()))
    throw new Error(
      `Use a single valid date and time for ${label}, for example 2026-10-23T17:00. Date ranges need a separate end date.`,
    );
  return date.toISOString();
}

export function postInput(post: Post, faculties: ApiFaculty[]) {
  const d = post.details;
  const audience = d.Audience || post.faculty;
  const faculty = faculties.find((item) => item.name === audience);
  if (audience !== 'All faculties' && !faculty)
    throw new Error('Choose a faculty from your current university before publishing.');
  let details: Record<string, unknown>;
  const present = (key: string, value: unknown) =>
    value === undefined || value === '' ? {} : { [key]: value };
  switch (post.type) {
    case 'Announcement':
      details = {
        audience,
        ...present('expiryDate', isoDate(d['Expiry date'], 'the expiry date')),
      };
      break;
    case 'Club recruitment':
      details = {
        club: d.Club,
        joiningInstructions: d['Joining instructions'],
        ...present('applicationDeadline', isoDate(d.Deadline, 'the application deadline')),
      };
      break;
    case 'Event':
      details = {
        startsAt: isoDate(d.Date, 'the event date', true),
        ...present('endsAt', isoDate(d['End date'], 'the event end date')),
        location: d.Location,
        organizer: d.Organizer,
        ...present('registrationUrl', d.Registration),
      };
      break;
    case 'Opportunity':
      details = {
        deadline: isoDate(d.Deadline, 'the application deadline', true),
        eligibility: d.Eligibility,
        organizer: d.Organizer,
        ...present('applicationUrl', d.Application),
      };
      break;
    case 'Find teammates':
      details = {
        skillsNeeded: (d['Skills needed'] ?? d.Skills ?? '')
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        peopleNeeded: Number(d['Open places'] ?? d.People),
        ...present('deadline', isoDate(d.Deadline, 'the team deadline')),
      };
      break;
    case 'Study group':
      details = {
        course: d.Course,
        format: d.Format === 'Online' ? 'online' : d.Format === 'Hybrid' ? 'hybrid' : 'in-person',
        schedule: d.Schedule,
        places: Number(d['Available places'] ?? d.Places),
        ...present('location', d.Location),
      };
      break;
    case 'Question':
      details = { ...present('topic', d.Topic) };
      break;
    case 'Lost & found':
      details = {
        item: d.Item,
        location: d.Location,
        foundAt: isoDate(d.Date, 'the lost or found date', true),
      };
      break;
    case 'Poll':
      details = {
        options: post.pollOptions ?? [],
        closingAt: isoDate(d['Closing date'], 'the poll closing date', true),
      };
      break;
  }
  const status =
    post.type === 'Find teammates'
      ? d.Status === 'Filled'
        ? 'filled'
        : 'open'
      : post.type === 'Lost & found'
        ? d.Status === 'Resolved'
          ? 'resolved'
          : 'open'
        : ['open', 'filled', 'resolved', 'closed'].includes(post.status ?? '')
          ? post.status
          : 'open';
  return {
    type: post.type,
    title: post.title,
    body: post.body,
    facultyId: faculty?.id ?? null,
    tags: post.tags.map((tag) => tag.toLowerCase()),
    imageUrl: post.image || null,
    status,
    details,
  };
}

export const mapNotification = (notification: ApiNotification): Notification => ({
  id: notification.id,
  title: notification.title,
  body: notification.body,
  createdAt: notification.created_at,
  read: Boolean(notification.read_at),
  ...(notification.post_id ? { postId: notification.post_id } : {}),
});
export const mapReport = (report: ApiReport): Report => ({
  id: report.id,
  postId: report.post_id ?? '',
  reason: report.reason,
  createdAt: report.created_at,
  status: report.status === 'pending' ? 'pending' : 'resolved',
});
