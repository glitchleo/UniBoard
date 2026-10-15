import { useCallback, useEffect, useState } from 'react';
import { currentProfile, initialNotifications, initialPosts } from '../../data';
import type { Notification, Post, Profile, Report } from '../../types';
import { readLocal, writeLocal } from '../../lib/storage';

type CampusPosts = Record<string, Post[]>;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isProfile = (v: unknown): v is Profile =>
  isRecord(v) &&
  ['id', 'name', 'email', 'faculty', 'program', 'year', 'bio', 'avatar', 'university'].every(
    (k) => typeof v[k] === 'string',
  ) &&
  typeof v.verified === 'boolean';
const isPost = (v: unknown): v is Post =>
  isRecord(v) &&
  ['id', 'type', 'title', 'body', 'author', 'authorId', 'avatar', 'faculty', 'createdAt'].every(
    (k) => typeof v[k] === 'string',
  ) &&
  Array.isArray(v.tags) &&
  v.tags.every((t) => typeof t === 'string') &&
  Array.isArray(v.comments) &&
  v.comments.every(
    (c) =>
      isRecord(c) &&
      ['id', 'author', 'avatar', 'body', 'createdAt'].every((k) => typeof c[k] === 'string'),
  ) &&
  isRecord(v.details) &&
  Object.values(v.details).every((d) => typeof d === 'string') &&
  typeof v.likes === 'number';
const isCampusPosts = (v: unknown): v is CampusPosts =>
  isRecord(v) && Object.values(v).every((p) => Array.isArray(p) && p.every(isPost));
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');
const isNotifications = (v: unknown): v is Notification[] =>
  Array.isArray(v) &&
  v.every(
    (n) =>
      isRecord(n) &&
      ['id', 'title', 'body', 'createdAt'].every((k) => typeof n[k] === 'string') &&
      typeof n.read === 'boolean',
  );
const isReports = (v: unknown): v is Report[] =>
  Array.isArray(v) &&
  v.every(
    (r) =>
      isRecord(r) &&
      ['id', 'postId', 'reason', 'createdAt', 'status'].every((k) => typeof r[k] === 'string'),
  );

/** A replaceable browser adapter. The Express API owns real shared campus data. */
export function useBoard(enabled = true) {
  const [profile, setProfile] = useState(() => readLocal('profile', currentProfile, isProfile));
  const [signedIn, setSignedIn] = useState(() =>
    readLocal('signed-in', true, (v): v is boolean => typeof v === 'boolean'),
  );
  const [campusPosts, setCampusPosts] = useState(() =>
    readLocal<CampusPosts>('posts', { [currentProfile.university]: initialPosts }, isCampusPosts),
  );
  const [savedIds, setSavedIds] = useState(() => readLocal<string[]>('saved', [], isStrings));
  const [likedIds, setLikedIds] = useState(() => readLocal<string[]>('liked', [], isStrings));
  const [storedNotifications, setNotifications] = useState(() =>
    readLocal('notifications', initialNotifications, isNotifications),
  );
  const [storedReports, setReports] = useState(() => readLocal<Report[]>('reports', [], isReports));
  const [storageError, setStorageError] = useState(false);
  const [toast, setToast] = useState('');
  const posts = campusPosts[profile.university] ?? [];
  // Older preview records without a campus belong to the original sample campus.
  const inCampus = (value: { university?: string }) =>
    (value.university ?? currentProfile.university) === profile.university;
  const notifications = storedNotifications.filter(inCampus);
  const reports = storedReports.filter(inCampus);

  useEffect(() => {
    if (!enabled) return;
    const ok = [
      writeLocal('profile', profile),
      writeLocal('signed-in', signedIn),
      writeLocal('posts', campusPosts),
      writeLocal('saved', savedIds),
      writeLocal('liked', likedIds),
      writeLocal('notifications', storedNotifications),
      writeLocal('reports', storedReports),
    ].every(Boolean);
    setStorageError(!ok);
  }, [
    enabled,
    profile,
    signedIn,
    campusPosts,
    savedIds,
    likedIds,
    storedNotifications,
    storedReports,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string) => setToast(message), []);
  const updatePost = useCallback(
    (post: Post) => {
      setCampusPosts((previous) => ({
        ...previous,
        [profile.university]: (previous[profile.university] ?? []).map((p) =>
          p.id === post.id ? post : p,
        ),
      }));
    },
    [profile.university],
  );

  function publish(post: Post) {
    setCampusPosts((previous) => {
      const campus = previous[profile.university] ?? [];
      return {
        ...previous,
        [profile.university]: campus.some((p) => p.id === post.id)
          ? campus.map((p) => (p.id === post.id ? post : p))
          : [post, ...campus],
      };
    });
    notify('Post published to your browser preview.');
    return true;
  }

  function remove(id: string) {
    setCampusPosts((previous) => ({
      ...previous,
      [profile.university]: (previous[profile.university] ?? []).filter((p) => p.id !== id),
    }));
    setSavedIds((previous) => previous.filter((value) => value !== id));
    notify('Post removed from this browser.');
    return true;
  }

  function toggleSaved(id: string) {
    const saved = savedIds.includes(id);
    setSavedIds((previous) =>
      saved ? previous.filter((value) => value !== id) : [...previous, id],
    );
    notify(saved ? 'Removed from saved posts.' : 'Saved for later.');
  }

  function toggleLiked(id: string) {
    const liked = likedIds.includes(id);
    setLikedIds((previous) =>
      liked ? previous.filter((value) => value !== id) : [...previous, id],
    );
    setCampusPosts((previous) => ({
      ...previous,
      [profile.university]: (previous[profile.university] ?? []).map((p) =>
        p.id === id ? { ...p, likes: Math.max(0, p.likes + (liked ? -1 : 1)) } : p,
      ),
    }));
  }

  function report(postId: string, reason: string) {
    setReports((previous) => [
      {
        id: crypto.randomUUID(),
        university: profile.university,
        postId,
        reason,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
      ...previous,
    ]);
    notify('Report saved locally. No live moderation team has been notified.');
    return true;
  }

  function updateProfile(value: Profile, signIn = false) {
    setProfile(value);
    if (signIn) setSignedIn(true);
  }

  return {
    profile,
    signedIn,
    posts,
    savedIds,
    likedIds,
    notifications,
    reports,
    toast,
    storageError,
    notify,
    publish,
    remove,
    updatePost,
    toggleSaved,
    toggleLiked,
    report,
    updateProfile,
    signOut: () => {
      setSignedIn(false);
      notify('Signed out of the browser preview.');
    },
    markRead: (id?: string) => {
      if (signedIn)
        setNotifications((previous) =>
          previous.map((n) => (inCampus(n) && (!id || n.id === id) ? { ...n, read: true } : n)),
        );
    },
    resolveReport: (id: string) => {
      if (signedIn) {
        setReports((previous) =>
          previous.map((r) => (inCampus(r) && r.id === id ? { ...r, status: 'resolved' } : r)),
        );
        notify('Demo report resolved locally.');
      }
    },
  };
}

export type Board = ReturnType<typeof useBoard>;
