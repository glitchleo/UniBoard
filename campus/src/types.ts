export type PostType =
  | 'Announcement'
  | 'Club recruitment'
  | 'Event'
  | 'Opportunity'
  | 'Find teammates'
  | 'Study group'
  | 'Question'
  | 'Lost & found'
  | 'Poll';

export interface Profile {
  id: string;
  name: string;
  email: string;
  faculty: string;
  program: string;
  year: string;
  bio: string;
  avatar: string;
  university: string;
  verified: boolean;
}

export interface Comment {
  id: string;
  authorId?: string;
  author: string;
  avatar: string;
  body: string;
  createdAt: string;
  parentId?: string;
}

export interface Post {
  id: string;
  type: PostType;
  title: string;
  body: string;
  author: string;
  authorId: string;
  avatar: string;
  faculty: string;
  tags: string[];
  createdAt: string;
  image?: string;
  pinned?: boolean;
  likes: number;
  comments: Comment[];
  commentCount?: number;
  details: Record<string, string>;
  status?: string;
  commentsClosed?: boolean;
  pollOptions?: string[];
  votes?: Record<string, number>;
}

export interface Notification {
  university?: string;
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  postId?: string;
}

export interface Report {
  university?: string;
  id: string;
  postId: string;
  reason: string;
  createdAt: string;
  status: 'pending' | 'resolved';
}
