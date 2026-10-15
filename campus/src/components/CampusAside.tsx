import { CalendarDays, ChevronRight, Plus, Tags } from 'lucide-react';
import type { Post } from '../types';
import { popularTags } from '../data';

export function CampusAside({
  posts,
  onOpen,
  onTag,
  onCreate,
  apiMode = false,
}: {
  posts: Post[];
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
  onCreate: () => void;
  apiMode?: boolean;
}) {
  const events = posts
    .filter((post) => post.type === 'Event' || post.type === 'Study group')
    .slice(0, 3);
  function dateLabel(post: Post) {
    const value = post.details.Date ?? post.details.Schedule ?? '';
    const parsed = new Date(value.replace(/(\d+)[–-]\d+(,?)/, '$1$2'));
    return Number.isNaN(parsed.getTime())
      ? { month: 'DATE', day: '↗' }
      : {
          month: parsed.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
          day: String(parsed.getDate()),
        };
  }
  return (
    <aside className="campus-aside">
      <section className="aside-section">
        <div className="aside-heading">
          <h2>
            <CalendarDays size={16} />
            Upcoming events
          </h2>
        </div>
        {events.length ? (
          events.map((post, index) => (
            <button className="upcoming-event" key={post.id} onClick={() => onOpen(post.id)}>
              <span className={`event-calendar calendar-${index}`}>
                <small>{dateLabel(post).month}</small>
                <strong>{dateLabel(post).day}</strong>
              </span>
              <span>
                <strong>{post.details.Event ?? post.title}</strong>
                <small>
                  {post.details.Location ?? post.details.Schedule ?? 'See post for schedule'}
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))
        ) : (
          <p className="muted text-sm">No events on this campus yet. Post the first one.</p>
        )}
      </section>
      <section className="aside-section tag-section">
        <div className="aside-heading">
          <h2>
            <Tags size={16} />
            Tags
          </h2>
        </div>
        <p>Filter posts by topic.</p>
        <div className="aside-tags">
          {popularTags.map((tag) => (
            <button key={tag} onClick={() => onTag(tag)}>
              #{tag}
            </button>
          ))}
        </div>
      </section>
      <section className="small-invitation">
        <h3>Share with your campus</h3>
        <p>Publish an announcement, event, question, or opportunity.</p>
        <button onClick={onCreate}>
          <Plus size={15} />
          Create a post
        </button>
      </section>
      <div className="aside-footer">
        <span>
          UniBoard © {new Date().getFullYear()} <span className="footer-dot">·</span>{' '}
          {apiMode ? 'Your university community' : 'Browser preview'}
        </span>
      </div>
    </aside>
  );
}
