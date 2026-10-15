import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Post, PostType } from '../types';
import { faculties, postTypes } from '../data';
import { FeaturedPost, PostCard } from '../components/PostCard';
import type { Filters } from '../features/board/selectors';
import { selectPosts } from '../features/board/selectors';

interface Props {
  posts: Post[];
  filters: Filters;
  onFilter: (next: Partial<Filters>) => void;
  savedIds: string[];
  likedIds: string[];
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onLike: (id: string) => void;
  onCreate: () => void;
  heading?: string;
  description?: string;
  showFeature?: boolean;
  apiMode?: boolean;
  facultyOptions?: string[];
}

const tabs: { label: string; value: PostType | 'All posts'; color: string }[] = [
  { label: 'All posts', value: 'All posts', color: 'all' },
  { label: 'Events', value: 'Event', color: 'event' },
  { label: 'Opportunities', value: 'Opportunity', color: 'opportunity' },
  { label: 'Find teammates', value: 'Find teammates', color: 'team' },
  { label: 'Study groups', value: 'Study group', color: 'study' },
];

export function BoardPage({
  posts,
  filters,
  onFilter,
  savedIds,
  likedIds,
  onOpen,
  onSave,
  onLike,
  onCreate,
  heading = 'Campus feed',
  description = 'Announcements, events, opportunities, and discussions from your university.',
  showFeature = false,
  apiMode = false,
  facultyOptions = faculties,
}: Props) {
  const filtered = selectPosts(posts, filters);
  const noFilters =
    !filters.query &&
    filters.type === 'All posts' &&
    filters.faculty === 'All faculties' &&
    !filters.tag &&
    !filters.days;
  const feature = showFeature && noFilters ? posts.find((post) => post.pinned) : undefined;
  const visible = filtered.filter((post) => post.id !== feature?.id);
  const tag = (value: string) => onFilter({ tag: value });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="feed-tabs" aria-label="Filter by post type">
        {tabs.map((item) => (
          <button
            key={item.value}
            className={`feed-category category-${item.color} ${filters.type === item.value ? 'active' : ''}`}
            aria-pressed={filters.type === item.value}
            onClick={() => onFilter({ type: item.value })}
          >
            {item.label}
            {item.value === 'All posts' && <span>{posts.length}</span>}
          </button>
        ))}
        <label
          className={`more-types ${!tabs.some((t) => t.value === filters.type) ? 'active' : ''}`}
        >
          <SlidersHorizontal size={16} />
          <span className="sr-only">All post types</span>
          <select
            aria-label="All post types"
            value={filters.type}
            onChange={(event) => onFilter({ type: event.target.value as Filters['type'] })}
          >
            <option>All posts</option>
            {postTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="feed-controls">
        <div className="filter-select">
          <Filter size={13} />
          <select
            aria-label="Filter by faculty"
            value={filters.faculty}
            onChange={(event) => onFilter({ faculty: event.target.value })}
          >
            <option>All faculties</option>
            {facultyOptions.map((faculty) => (
              <option key={faculty}>{faculty}</option>
            ))}
          </select>
        </div>
        <div className="filter-select date-select">
          <select
            aria-label="Filter by date"
            value={filters.days}
            onChange={(event) => onFilter({ days: Number(event.target.value) })}
          >
            <option value={0}>Any time</option>
            <option value={1}>Past 24 hours</option>
            <option value={7}>Past week</option>
            <option value={30}>Past month</option>
          </select>
        </div>
        <span className="sort-label">
          <ArrowDownWideNarrow size={13} />
          Newest first
        </span>
      </div>
      {!noFilters && (
        <div className="active-filters">
          <span>
            {filtered.length} {filtered.length === 1 ? 'post' : 'posts'} found
            {filters.query && <> for “{filters.query}”</>}
          </span>
          {filters.tag && (
            <button onClick={() => onFilter({ tag: '' })}>
              #{filters.tag}
              <X size={12} />
            </button>
          )}
          <button
            className="clear-filters"
            onClick={() =>
              onFilter({ query: '', tag: '', type: 'All posts', faculty: 'All faculties', days: 0 })
            }
          >
            Clear filters
          </button>
        </div>
      )}
      {feature && (
        <FeaturedPost
          post={feature}
          saved={savedIds.includes(feature.id)}
          onSave={() => onSave(feature.id)}
          onOpen={() => onOpen(feature.id)}
        />
      )}
      <div className="post-list">
        {visible.map((post) => (
          <PostCard
            key={post.id}
            apiMode={apiMode}
            post={post}
            saved={savedIds.includes(post.id)}
            liked={likedIds.includes(post.id)}
            onOpen={() => onOpen(post.id)}
            onSave={() => onSave(post.id)}
            onLike={() => onLike(post.id)}
            onTag={tag}
          />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <span>
            <Search size={28} strokeWidth={1.4} />
          </span>
          <h2>{posts.length ? 'No matching posts' : 'No posts yet'}</h2>
          <p>
            {posts.length
              ? 'Try a different word, faculty, or post type.'
              : 'Create a post to share something with your university.'}
          </p>
          <button
            className="button secondary"
            onClick={
              posts.length
                ? () =>
                    onFilter({
                      query: '',
                      tag: '',
                      type: 'All posts',
                      faculty: 'All faculties',
                      days: 0,
                    })
                : onCreate
            }
          >
            {posts.length ? 'Reset filters' : 'Create a post'}
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      {visible.length > 0 && (
        <p className="feed-end">
          <span />
          End of posts
          <span />
        </p>
      )}
    </>
  );
}
