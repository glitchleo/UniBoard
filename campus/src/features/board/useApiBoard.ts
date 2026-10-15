import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification, Post, Profile, Report } from '../../types';
import { apiList, apiRequest, ApiRequestError } from '../../lib/api';
import type {
  ApiClub,
  ApiComment,
  ApiFaculty,
  ApiMembership,
  ApiNotification,
  ApiPost,
  ApiReport,
  ApiUniversity,
  ApiUser,
  ApiVotes,
} from '../../lib/api';
import {
  emptyApiProfile,
  mapNotification,
  mapPost,
  mapProfile,
  mapReport,
  postInput,
} from '../../lib/api-mappers';

export interface AuthResult {
  developmentToken?: string;
  message?: string;
}
type MembershipInput = { facultyId: string; universityEmail?: string; evidence?: string };
const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The request could not be completed.';

/** API adapter: no auth tokens, campus content, or server roles are stored in localStorage. */
export function useApiBoard(enabled: boolean) {
  const [profile, setProfile] = useState<Profile>(emptyApiProfile);
  const [signedIn, setSignedIn] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [universities, setUniversities] = useState<ApiUniversity[]>([]);
  const [faculties, setFaculties] = useState<ApiFaculty[]>([]);
  const [memberships, setMemberships] = useState<ApiMembership[]>([]);
  const [membership, setMembership] = useState<ApiMembership | undefined>();
  const [clubs, setClubs] = useState<ApiClub[]>([]);
  const [ownVotes, setOwnVotes] = useState<Record<string, string>>({});
  const [activeUniversityId, setActiveUniversityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [feedLimited, setFeedLimited] = useState(false);
  const activeRef = useRef<string | null>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const generation = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(
    async (preferredId?: string) => {
      if (!enabled) return;
      const request = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const universityRows = (await apiRequest<ApiUniversity[]>('/universities')).data;
        let user: ApiUser;
        try {
          user = (await apiRequest<ApiUser>('/auth/me')).data;
        } catch (reason) {
          if (!(reason instanceof ApiRequestError) || reason.status !== 401) throw reason;
          if (generation.current !== request) return;
          setUniversities(universityRows);
          setSignedIn(false);
          setProfile(emptyApiProfile);
          setMemberships([]);
          setMembership(undefined);
          setPosts([]);
          setSavedIds([]);
          setNotifications([]);
          setReports([]);
          setClubs([]);
          setFaculties([]);
          setOwnVotes({});
          setActiveUniversityId(null);
          activeRef.current = null;
          setFeedLimited(false);
          return;
        }
        const memberRows = user.memberships ?? [];
        const preferred = preferredId ?? activeRef.current;
        const selectedId =
          (preferred && universityRows.some((university) => university.id === preferred)
            ? preferred
            : (memberRows.find((member) => member.status === 'approved')?.university_id ??
              memberRows[0]?.university_id)) ?? null;
        const selectedMember = memberRows.find((member) => member.university_id === selectedId);
        const selectedUniversity = universityRows.find(
          (university) => university.id === selectedId,
        );
        const facultyRows = selectedId
          ? (await apiRequest<ApiFaculty[]>(`/universities/${selectedId}/faculties`)).data
          : [];
        const notificationRows = await apiList<ApiNotification>('/notifications');
        let postRows: ApiPost[] = [];
        let bookmarkRows: ApiPost[] = [];
        let clubRows: ApiClub[] = [];
        let reportRows: ApiReport[] = [];
        let limited = false;
        if (selectedId && selectedMember?.status === 'approved') {
          const base = `/universities/${selectedId}`;
          const [feed, bookmarks, directory, moderation] = await Promise.all([
            apiRequest<ApiPost[]>(`${base}/posts?limit=100&page=1`),
            apiList<ApiPost>(`${base}/bookmarks`),
            apiList<ApiClub>(`${base}/clubs`),
            selectedMember.role !== 'student'
              ? apiList<ApiReport>(`${base}/moderation/reports`)
              : Promise.resolve([] as ApiReport[]),
          ]);
          postRows = feed.data;
          bookmarkRows = bookmarks;
          clubRows = directory;
          reportRows = moderation;
          limited = (feed.meta?.total ?? feed.data.length) > 100;
          // Include saved posts outside the 100 newest feed posts so the Saved page remains accurate.
          const seen = new Set(postRows.map((post) => post.id));
          postRows = [...postRows, ...bookmarkRows.filter((post) => !seen.has(post.id))];
        }
        if (generation.current !== request) return;
        setUniversities(universityRows);
        setMemberships(memberRows);
        setMembership(selectedMember);
        setFaculties(facultyRows);
        setProfile(mapProfile(user, selectedUniversity, selectedMember, facultyRows));
        setSignedIn(true);
        setActiveUniversityId(selectedId);
        activeRef.current = selectedId;
        setPosts(postRows.map((post) => mapPost(post)));
        setSavedIds(bookmarkRows.map((post) => post.id));
        setClubs(clubRows);
        setReports(reportRows.map(mapReport));
        setNotifications(notificationRows.map(mapNotification));
        setOwnVotes({});
        setFeedLimited(limited);
      } catch (reason) {
        if (generation.current === request) {
          setError(failureMessage(reason));
          throw reason;
        }
      } finally {
        if (generation.current === request) setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh().catch(() => {});
    return () => {
      generation.current++;
    };
  }, [enabled, refresh]);

  function campusPath() {
    if (!enabled || !signedIn) throw new Error('Sign in before changing campus data.');
    if (!activeUniversityId || membership?.status !== 'approved')
      throw new Error(
        'Approved university membership is required. Open your university settings to join.',
      );
    return `/universities/${activeUniversityId}`;
  }

  async function loadPost(id: string): Promise<boolean> {
    try {
      const base = campusPath();
      const universityId = activeUniversityId;
      const requestGeneration = generation.current;
      const post = (await apiRequest<ApiPost>(`${base}/posts/${id}`)).data;
      const [comments, votes] = await Promise.all([
        apiList<ApiComment>(`${base}/posts/${id}/comments`),
        post.type === 'Poll'
          ? apiRequest<ApiVotes>(`${base}/posts/${id}/votes`).then((result) => result.data)
          : Promise.resolve(undefined),
      ]);
      if (activeRef.current !== universityId || generation.current !== requestGeneration)
        return false;
      const mapped = mapPost(post, comments, votes);
      setPosts((previous) =>
        previous.some((item) => item.id === id)
          ? previous.map((item) => (item.id === id ? mapped : item))
          : [mapped, ...previous],
      );
      setOwnVotes((previous) => {
        const next = { ...previous };
        if (
          votes?.ownVote !== null &&
          votes?.ownVote !== undefined &&
          mapped.pollOptions?.[votes.ownVote]
        )
          next[id] = mapped.pollOptions[votes.ownVote];
        else delete next[id];
        return next;
      });
      return true;
    } catch (reason) {
      notify(failureMessage(reason));
      return false;
    }
  }

  async function publish(post: Post): Promise<boolean> {
    try {
      const base = campusPath();
      const exists = postsRef.current.some((item) => item.id === post.id);
      const universityId = activeUniversityId;
      const requestGeneration = generation.current;
      const result = await apiRequest<ApiPost>(`${base}/posts${exists ? `/${post.id}` : ''}`, {
        method: exists ? 'PUT' : 'POST',
        body: postInput(post, faculties),
      });
      if (activeRef.current === universityId && generation.current === requestGeneration)
        await loadPost(result.data.id);
      notify(exists ? 'Your post has been updated.' : 'Published to your campus.');
      return true;
    } catch (reason) {
      notify(failureMessage(reason));
      return false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await apiRequest(`${campusPath()}/posts/${id}`, { method: 'DELETE' });
      setPosts((previous) => previous.filter((post) => post.id !== id));
      setSavedIds((previous) => previous.filter((value) => value !== id));
      notify('Post deleted.');
      return true;
    } catch (reason) {
      notify(failureMessage(reason));
      return false;
    }
  }

  async function updatePost(next: Post): Promise<boolean> {
    try {
      const previous = postsRef.current.find((post) => post.id === next.id);
      if (!previous) throw new Error('Open the current post before editing its conversation.');
      const base = campusPath();
      const universityId = activeUniversityId;
      if (next.details['Accepted answer'] !== previous.details['Accepted answer'])
        throw new Error('Accepted answers are not supported by the server yet.');
      if (next.likes !== previous.likes) throw new Error('Likes are not available in API mode.');
      if (Boolean(next.commentsClosed) !== Boolean(previous.commentsClosed))
        await apiRequest(`${base}/posts/${next.id}/comments-status`, {
          method: 'PATCH',
          body: { closed: Boolean(next.commentsClosed) },
        });
      const oldComments = new Map(previous.comments.map((comment) => [comment.id, comment]));
      const newComments = new Map(next.comments.map((comment) => [comment.id, comment]));
      for (const comment of next.comments) {
        const old = oldComments.get(comment.id);
        if (!old)
          await apiRequest(`${base}/posts/${next.id}/comments`, {
            method: 'POST',
            body: {
              body: comment.body,
              ...(comment.parentId ? { parentId: comment.parentId } : {}),
            },
          });
        else if (old.body !== comment.body)
          await apiRequest(`${base}/comments/${comment.id}`, {
            method: 'PATCH',
            body: { body: comment.body },
          });
      }
      for (const comment of previous.comments)
        if (!newComments.has(comment.id))
          await apiRequest(`${base}/comments/${comment.id}`, { method: 'DELETE' });
      if (activeRef.current === universityId) await loadPost(next.id);
      return true;
    } catch (reason) {
      notify(failureMessage(reason));
      return false;
    }
  }

  async function votePost(id: string, option: string): Promise<boolean> {
    try {
      const universityId = activeUniversityId;
      const post = postsRef.current.find((item) => item.id === id);
      const index = post?.pollOptions?.indexOf(option) ?? -1;
      if (index < 0) throw new Error('Choose a current poll option.');
      await apiRequest(`${campusPath()}/posts/${id}/vote`, {
        method: 'POST',
        body: { optionIndex: index },
      });
      if (activeRef.current === universityId) await loadPost(id);
      return true;
    } catch (reason) {
      notify(failureMessage(reason));
      return false;
    }
  }

  async function toggleSaved(id: string) {
    try {
      const universityId = activeUniversityId;
      const saved = savedIds.includes(id);
      await apiRequest(`${campusPath()}/bookmarks/${id}`, { method: saved ? 'DELETE' : 'PUT' });
      if (activeRef.current === universityId)
        setSavedIds((previous) =>
          saved ? previous.filter((value) => value !== id) : [...previous, id],
        );
      notify(saved ? 'Removed from saved posts.' : 'Saved for later.');
    } catch (reason) {
      notify(failureMessage(reason));
    }
  }
  async function report(postId: string, reason: string) {
    try {
      await apiRequest(`${campusPath()}/reports`, { method: 'POST', body: { postId, reason } });
      notify('Report submitted to your university moderators.');
      return true;
    } catch (error) {
      notify(failureMessage(error));
      return false;
    }
  }
  async function reportComment(commentId: string, reason: string) {
    try {
      await apiRequest(`${campusPath()}/reports`, { method: 'POST', body: { commentId, reason } });
      notify('Comment report submitted.');
      return true;
    } catch (error) {
      notify(failureMessage(error));
      return false;
    }
  }
  async function reportUser(userId: string, reason: string) {
    try {
      await apiRequest(`${campusPath()}/reports`, { method: 'POST', body: { userId, reason } });
      notify('User report submitted.');
      return true;
    } catch (error) {
      notify(failureMessage(error));
      return false;
    }
  }
  async function markRead(id?: string) {
    try {
      const targets = notifications.filter(
        (notification) => !notification.read && (!id || notification.id === id),
      );
      for (const notification of targets)
        await apiRequest(`/notifications/${notification.id}`, {
          method: 'PATCH',
          body: { read: true },
        });
      setNotifications((previous) =>
        previous.map((notification) =>
          !id || notification.id === id ? { ...notification, read: true } : notification,
        ),
      );
    } catch (reason) {
      notify(failureMessage(reason));
    }
  }
  async function resolveReport(id: string) {
    // A decision needs explicit moderator-authored text; the browser demo's one-click action cannot supply it.
    void id;
    notify(
      'Open moderation tools to record a decision and reason. One-click demo resolution is unavailable in API mode.',
    );
  }
  async function signOut() {
    generation.current++;
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      generation.current++;
      setLoading(false);
      setError(null);
      setSignedIn(false);
      setProfile(emptyApiProfile);
      setPosts([]);
      setSavedIds([]);
      setNotifications([]);
      setReports([]);
      setMemberships([]);
      setMembership(undefined);
      setFaculties([]);
      setClubs([]);
      setOwnVotes({});
      setActiveUniversityId(null);
      activeRef.current = null;
      notify('Signed out.');
    } catch (reason) {
      notify(failureMessage(reason));
    }
  }

  const auth = {
    async login(email: string, password: string) {
      await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
      await refresh();
    },
    async register(name: string, email: string, password: string): Promise<AuthResult> {
      const response = await apiRequest<ApiUser>('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
      return { developmentToken: response.developmentToken, message: response.message };
    },
    async verifyEmail(token: string) {
      await apiRequest('/auth/verify-email', { method: 'POST', body: { token } });
    },
    async resendVerification(email: string): Promise<AuthResult> {
      const response = await apiRequest<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: { email },
      });
      return { developmentToken: response.developmentToken, message: response.data.message };
    },
    async forgotPassword(email: string): Promise<AuthResult> {
      const response = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      return { developmentToken: response.developmentToken, message: response.data.message };
    },
    async resetPassword(token: string, password: string) {
      await apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
      await refresh();
    },
    async joinUniversity(universityId: string, input: MembershipInput): Promise<AuthResult> {
      const response = await apiRequest<ApiMembership>(`/universities/${universityId}/membership`, {
        method: 'POST',
        body: input,
      });
      await refresh(universityId);
      return {
        developmentToken: response.developmentToken,
        message:
          response.data.status === 'approved'
            ? 'Membership approved. Welcome to your campus.'
            : 'Membership request submitted. Verify your campus email or wait for moderator review.',
      };
    },
    async verifyMembership(universityId: string, token: string) {
      await apiRequest(`/universities/${universityId}/membership/verify`, {
        method: 'POST',
        body: { token },
      });
      await refresh(universityId);
    },
    async saveProfile(value: Profile) {
      await apiRequest<ApiUser>('/profile', {
        method: 'PATCH',
        body: {
          name: value.name,
          avatarUrl: /^https:\/\//.test(value.avatar) ? value.avatar : null,
          program: value.program,
          year: value.year ? Number(value.year) : null,
          bio: value.bio,
        },
      });
      await refresh();
      notify('Profile saved.');
    },
  };

  return {
    profile,
    signedIn,
    posts,
    savedIds,
    likedIds: [] as string[],
    notifications,
    reports,
    toast,
    storageError: false,
    notify,
    publish,
    remove,
    updatePost,
    toggleSaved,
    toggleLiked: (_id: string) => notify('Likes are not available in API mode.'),
    report,
    reportComment,
    reportUser,
    updateProfile: auth.saveProfile,
    signOut,
    markRead,
    resolveReport,
    loading,
    error,
    mode: 'api' as const,
    universities,
    faculties,
    memberships,
    membership,
    clubs,
    role: membership?.status === 'approved' ? membership.role : null,
    activeUniversityId,
    feedLimited,
    ownVotes,
    votePost,
    loadPost,
    refresh,
    selectUniversity: async (id: string) => {
      activeRef.current = id;
      generation.current++;
      setActiveUniversityId(id);
      setMembership(undefined);
      setPosts([]);
      setSavedIds([]);
      setReports([]);
      setClubs([]);
      setOwnVotes({});
      await refresh(id);
    },
    auth,
  };
}

export type ApiBoard = ReturnType<typeof useApiBoard>;
