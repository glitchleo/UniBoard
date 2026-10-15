import type { PostType } from '../types';

export interface ApiResponse<T> {
  data: T;
  meta?: { page: number; limit: number; total?: number };
  developmentToken?: string;
  message?: string;
}
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Validate the shared envelope; each caller still owns its endpoint's data contract. */
function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!isRecord(value) || !Object.hasOwn(value, 'data')) return false;
  if (value.message !== undefined && typeof value.message !== 'string') return false;
  if (value.developmentToken !== undefined && typeof value.developmentToken !== 'string')
    return false;
  if (value.meta === undefined) return true;
  return (
    isRecord(value.meta) &&
    isPositiveInteger(value.meta.page) &&
    isPositiveInteger(value.meta.limit) &&
    (value.meta.total === undefined ||
      (typeof value.meta.total === 'number' &&
        Number.isSafeInteger(value.meta.total) &&
        value.meta.total >= 0))
  );
}

/** Cookies remain HttpOnly. Requests use the same-origin Vite proxy or Express host. */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers:
        options.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal ?? AbortSignal.timeout(20000),
    });
  } catch (error) {
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the campus server. Check that the API is running.',
    );
  }
  if (response.status === 204) return { data: undefined as T };
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    const details: unknown[] = Array.isArray(error?.details) ? error.details : [];
    const issues = details
      .filter(isRecord)
      .filter((issue) => typeof issue.message === 'string' && issue.message.trim())
      .slice(0, 3)
      .map((issue) => {
        const path =
          Array.isArray(issue.path) &&
          issue.path.every((part) => typeof part === 'string' || typeof part === 'number')
            ? issue.path.join('.')
            : '';
        return `${path || 'Field'}: ${issue.message}`;
      })
      .join(' ');
    throw new ApiRequestError(
      response.status,
      typeof error?.code === 'string' && error.code.trim() ? error.code : 'REQUEST_FAILED',
      issues ||
        (typeof error?.message === 'string' && error.message.trim() ? error.message : '') ||
        `The server returned ${response.status}. Please try again.`,
    );
  }
  if (!isApiResponse(payload))
    throw new ApiRequestError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unexpected response.',
    );
  return payload as ApiResponse<T>;
}

/** Enumerate lists that do not expose a total; never silently stop after their first page. */
export async function apiList<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await apiRequest<T[]>(
      `${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`,
    );
    rows.push(...result.data);
    if (
      result.data.length < 100 ||
      (result.meta?.total !== undefined && rows.length >= result.meta.total)
    )
      return rows;
  }
  throw new ApiRequestError(
    0,
    'LIST_TOO_LARGE',
    'This list exceeds 10,000 records. Narrow it before loading.',
  );
}

export interface ApiUniversity {
  id: string;
  name: string;
  slug: string;
  email_domains: string[];
}
export interface ApiFaculty {
  id: string;
  name: string;
}
export interface ApiMembership {
  user_id: string;
  university_id: string;
  university_name?: string;
  faculty_id: string | null;
  status: 'approved' | 'pending' | 'rejected' | 'suspended';
  role: 'student' | 'moderator' | 'admin';
  verification_method?: string;
  university_email?: string | null;
}
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  program: string;
  study_year: number | null;
  bio: string;
  email_verified: boolean;
  memberships?: ApiMembership[];
}
export interface ApiPost {
  id: string;
  university_id: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string | null;
  faculty_id: string | null;
  faculty_name?: string | null;
  type: PostType;
  title: string;
  body: string;
  tags: string[];
  details: Record<string, unknown>;
  image_url: string | null;
  status: string;
  pinned: boolean;
  comments_closed: boolean;
  created_at: string;
  comment_count?: number;
}
export interface ApiComment {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  parent_id: string | null;
  body: string;
  created_at: string;
  deleted_at: string | null;
}
export interface ApiNotification {
  id: string;
  university_id: string;
  title: string;
  body: string;
  post_id: string | null;
  created_at: string;
  read_at: string | null;
}
export interface ApiReport {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  user_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}
export interface ApiClub {
  id: string;
  name: string;
  description: string;
  category: string;
  contact_email: string | null;
}
export interface ApiVotes {
  counts: { option_index: number; votes: number }[];
  ownVote: number | null;
}
