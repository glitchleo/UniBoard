import type { Post, PostType } from '../../types';

export interface Filters {
  query: string;
  type: PostType | 'All posts';
  faculty: string;
  tag: string;
  days: number;
}

/** Pure selectors keep filtering out of rendering code and the storage adapter. */
export function selectPosts(posts: Post[], filters: Filters): Post[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const since = filters.days ? Date.now() - filters.days * 86_400_000 : 0;
  return posts
    .filter(
      (post) =>
        (!query ||
          `${post.title} ${post.body} ${post.tags.join(' ')}`
            .toLocaleLowerCase()
            .includes(query)) &&
        (filters.type === 'All posts' || post.type === filters.type) &&
        (filters.faculty === 'All faculties' ||
          post.faculty === filters.faculty ||
          post.details.Audience === filters.faculty) &&
        (!filters.tag || post.tags.includes(filters.tag)) &&
        (!since || new Date(post.createdAt).getTime() >= since),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
