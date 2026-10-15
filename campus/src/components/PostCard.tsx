import {
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Heart,
  MapPin,
  MessageCircle,
  Pin,
} from 'lucide-react';
import type { Post } from '../types';
import { timeAgo } from '../data';
import { Avatar } from './Avatar';

interface Props {
  post: Post;
  saved: boolean;
  liked: boolean;
  onOpen: () => void;
  onSave: () => void;
  onLike: () => void;
  onTag: (tag: string) => void;
  apiMode?: boolean;
}

const typeClass: Record<string, string> = {
  Event: 'event',
  Opportunity: 'opportunity',
  'Find teammates': 'teammates',
  'Study group': 'study',
  Question: 'question',
  'Club recruitment': 'club',
  Announcement: 'announcement',
  'Lost & found': 'lost',
  Poll: 'poll',
};

export function PostCard({
  post,
  saved,
  liked,
  onOpen,
  onSave,
  onLike,
  onTag,
  apiMode = false,
}: Props) {
  const comments = post.commentCount ?? post.comments.length;
  return (
    <article className="post-card">
      <div className="post-meta">
        <Avatar value={post.avatar} name={post.author} />
        <div className="author-meta">
          <strong>{post.author}</strong>
          <span>
            {post.faculty} <span className="dot-separator">·</span> {timeAgo(post.createdAt)}
          </span>
        </div>
        <button
          className={`icon-button save-button ${saved ? 'is-saved' : ''}`}
          aria-label={saved ? `Unsave ${post.title}` : `Save ${post.title}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="card-type-row">
        <span className={`type-pill ${typeClass[post.type]}`}>{post.type}</span>
        {post.status && (
          <span className="post-status">
            <span />
            {post.status}
          </span>
        )}
      </div>
      <button className="post-title" onClick={onOpen}>
        <h2>{post.title}</h2>
        <ArrowUpRight size={19} />
      </button>
      <p className="post-excerpt">{post.body}</p>
      {post.type === 'Event' && (
        <div className="event-meta">
          {post.details.Date && (
            <span>
              <CalendarDays size={13} />
              {post.details.Date}
            </span>
          )}
          {post.details.Location && (
            <span>
              <MapPin size={13} />
              {post.details.Location}
            </span>
          )}
        </div>
      )}
      {post.type === 'Poll' && (
        <button className="poll-preview" onClick={onOpen}>
          ◉ <span>{post.pollOptions?.length ?? 0} options · Add your voice</span>
          <ArrowUpRight size={14} />
        </button>
      )}
      <div className="post-tags">
        {post.tags.slice(0, 4).map((tag) => (
          <button key={tag} onClick={() => onTag(tag)}>
            #{tag}
          </button>
        ))}
      </div>
      <div className="post-footer">
        {!apiMode && (
          <button
            className={liked ? 'is-liked' : ''}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={`Like ${post.title}`}
          >
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
            {post.likes}
            <span className="sr-only"> likes</span>
          </button>
        )}
        <button onClick={onOpen}>
          <MessageCircle size={15} />
          {comments}
          <span>{comments === 1 ? 'comment' : 'comments'}</span>
        </button>
        <button className="join-conversation" onClick={onOpen}>
          Join the conversation
          <ArrowUpRight size={13} />
        </button>
      </div>
    </article>
  );
}

export function FeaturedPost({
  post,
  saved,
  onOpen,
  onSave,
}: Pick<Props, 'post' | 'saved' | 'onOpen' | 'onSave'>) {
  return (
    <article className="featured-post">
      <div className="featured-top">
        <span>
          <Pin size={12} />
          Featured post
        </span>
        <button
          className="icon-button"
          aria-label={saved ? `Unsave ${post.title}` : `Save ${post.title}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="featured-content">
        <div>
          <span className="feature-eyebrow">{post.type}</span>
          <h2>{post.title}</h2>
          <p>{post.body.length > 240 ? `${post.body.slice(0, 237).trimEnd()}…` : post.body}</p>
          {(post.details.Date ||
            post.details.Deadline ||
            post.details.Schedule ||
            post.details.Location) && (
            <div className="featured-date">
              {(post.details.Date || post.details.Deadline || post.details.Schedule) && (
                <span>
                  <CalendarDays size={14} />
                  {post.details.Date ?? post.details.Deadline ?? post.details.Schedule}
                </span>
              )}
              {post.details.Location && (
                <span>
                  <MapPin size={14} />
                  {post.details.Location}
                </span>
              )}
            </div>
          )}
          <button className="button primary feature-button" onClick={onOpen}>
            View post
            <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
