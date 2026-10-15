import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Flag,
  Heart,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Send,
  SquarePen,
  Tag,
  Trash2,
  UnlockKeyhole,
  Users,
  X,
} from 'lucide-react';
import type { Comment, Post, Profile } from '../types';
import './dialogs.css';

interface PostDetailProps {
  post: Post;
  profile: Profile;
  saved: boolean;
  liked: boolean;
  signedIn?: boolean;
  apiMode?: boolean;
  votedOption?: string | null;
  onVote?: (option: string) => Promise<boolean>;
  onClose: () => void;
  onSave: () => void;
  onLike: () => void;
  onUpdate: (post: Post) => void | boolean | Promise<void | boolean>;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onReportComment?: (comment: Comment) => void;
  onReportUser?: (userId: string) => void;
}

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function readSaved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* State remains available for this visit. */
  }
}

function timeAgo(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return '';
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function Avatar({ value, name, small = false }: { value: string; name: string; small?: boolean }) {
  const className = small ? 'comment-avatar' : 'post-detail-avatar';
  const url = safeHttpUrl(value);
  return url ? (
    <img className={className} src={url} alt={name} />
  ) : (
    <span className={className} aria-hidden="true">
      {value ||
        name
          .split(' ')
          .map((part) => part[0])
          .slice(0, 2)
          .join('')}
    </span>
  );
}

function SafeText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        const href = safeHttpUrl(part);
        return href ? (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        );
      })}
    </>
  );
}

function DetailIcon({ label }: { label: string }) {
  if (/date|time|schedule|deadline|expiry/i.test(label)) return <CalendarDays size={14} />;
  if (/location|format/i.test(label)) return <MapPin size={14} />;
  if (/link|registration|application/i.test(label)) return <ExternalLink size={14} />;
  if (/people|places|club|organizer|audience/i.test(label)) return <Users size={14} />;
  return <Tag size={14} />;
}

export function PostDetail({
  post,
  profile,
  saved,
  liked,
  signedIn = true,
  apiMode = false,
  votedOption: serverVotedOption,
  onVote,
  onClose,
  onSave,
  onLike,
  onUpdate,
  onEdit,
  onDelete,
  onReport,
  onReportComment,
  onReportUser,
}: PostDetailProps) {
  const [localVotedOption, setLocalVotedOption] = useState<string | null>(() =>
    apiMode ? null : readSaved(`uniboard-vote-${post.id}`),
  );
  const votedOption = onVote ? (serverVotedOption ?? null) : localVotedOption;
  const [isUpdating, setIsUpdating] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isAuthor = signedIn && post.authorId === profile.id;
  const pollTotal = Object.values(post.votes ?? {}).reduce((total, count) => total + count, 0);
  const closingDateText = post.details['Closing date']?.replace(/\s*[·]\s*|\s+at\s+/g, ' ');
  const closingTime = closingDateText
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(closingDateText)
          ? `${closingDateText}T23:59:59`
          : closingDateText,
      ).getTime()
    : NaN;
  const pollClosed = Number.isFinite(closingTime) && closingTime < Date.now();
  const canVote = signedIn && !votedOption && !pollClosed && !isVoting;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    function handleKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, textarea, select, a[href]',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeys);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    setLocalVotedOption(apiMode ? null : readSaved(`uniboard-vote-${post.id}`));
    setCommentBody('');
    setReplyTo(null);
    setEditingComment(null);
    setDeleteConfirm(false);
  }, [post.id, apiMode]);

  async function vote(option: string) {
    if (!canVote) return;
    if (onVote) {
      setIsVoting(true);
      try {
        await onVote(option);
      } finally {
        setIsVoting(false);
      }
      return;
    }
    if (readSaved(`uniboard-vote-${post.id}`)) return;
    setLocalVotedOption(option);
    saveLocal(`uniboard-vote-${post.id}`, option);
    onUpdate({
      ...post,
      votes: { ...(post.votes ?? {}), [option]: (post.votes?.[option] ?? 0) + 1 },
    });
  }

  async function mutate(next: Post) {
    if (isUpdating) return false;
    setIsUpdating(true);
    try {
      return (await onUpdate(next)) !== false;
    } catch {
      return false;
    } finally {
      setIsUpdating(false);
    }
  }

  function startReply(comment: Comment) {
    if (!signedIn) return;
    setReplyTo(comment);
    setEditingComment(null);
    setCommentBody('');
    requestAnimationFrame(() => {
      commentRef.current?.focus();
      commentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function startEditing(comment: Comment) {
    if (!signedIn || comment.authorId !== profile.id) return;
    setEditingComment(comment);
    setReplyTo(null);
    setCommentBody(comment.body);
    requestAnimationFrame(() => {
      commentRef.current?.focus();
      commentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  async function sendComment() {
    if (!signedIn || !commentBody.trim() || (post.commentsClosed && !editingComment)) return;
    if (editingComment) {
      const success = await mutate({
        ...post,
        comments: post.comments.map((comment) =>
          comment.id === editingComment.id && comment.authorId === profile.id
            ? { ...comment, body: commentBody.trim() }
            : comment,
        ),
        ...(post.details['Accepted answer'] === editingComment.body
          ? { details: { ...post.details, 'Accepted answer': commentBody.trim() } }
          : {}),
      });
      if (!success) return;
    } else {
      const comment: Comment = {
        id: crypto.randomUUID(),
        authorId: profile.id,
        author: profile.name,
        avatar: profile.avatar,
        body: commentBody.trim(),
        createdAt: new Date().toISOString(),
        ...(replyTo ? { parentId: replyTo.id } : {}),
      };
      if (!(await mutate({ ...post, comments: [...post.comments, comment] }))) return;
    }
    setCommentBody('');
    setReplyTo(null);
    setEditingComment(null);
  }

  async function deleteComment(comment: Comment) {
    if (!signedIn || comment.authorId !== profile.id) return;
    if (
      !(await mutate({
        ...post,
        comments: post.comments
          .filter((item) => item.id !== comment.id)
          .map((item) =>
            item.parentId === comment.id ? { ...item, parentId: comment.parentId } : item,
          ),
        ...(post.details['Accepted answer'] === comment.body
          ? { details: { ...post.details, 'Accepted answer': '' } }
          : {}),
      }))
    )
      return;
    if (editingComment?.id === comment.id) {
      setEditingComment(null);
      setCommentBody('');
    }
    if (replyTo?.id === comment.id) {
      setReplyTo(null);
      setCommentBody('');
    }
  }

  function renderComment(comment: Comment, visited = new Set<string>()): ReactNode {
    if (visited.has(comment.id)) return null;
    const nextVisited = new Set(visited).add(comment.id);
    const children = post.comments.filter((item) => item.parentId === comment.id);
    const accepted = post.type === 'Question' && post.details['Accepted answer'] === comment.body;
    return (
      <div className="comment-row" key={comment.id}>
        <Avatar value={comment.avatar} name={comment.author} small />
        <div className="comment-main">
          <div className="comment-topline">
            <strong>{comment.author}</strong>
            <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
            {accepted && (
              <span className="type-pill">
                <CheckCircle2 size={10} />
                Accepted answer
              </span>
            )}
          </div>
          <p className="comment-content">
            <SafeText text={comment.body} />
          </p>
          <div className="comment-options">
            {signedIn && !post.commentsClosed && (!apiMode || comment.authorId) && (
              <button onClick={() => startReply(comment)}>Reply</button>
            )}
            {signedIn && comment.authorId === profile.id && (
              <>
                <button
                  disabled={isUpdating || (apiMode && post.commentsClosed)}
                  onClick={() => startEditing(comment)}
                >
                  Edit
                </button>
                <button disabled={isUpdating} onClick={() => void deleteComment(comment)}>
                  Delete
                </button>
              </>
            )}
            {!apiMode && isAuthor && post.type === 'Question' && (
              <button
                onClick={() =>
                  void mutate({
                    ...post,
                    details: { ...post.details, 'Accepted answer': accepted ? '' : comment.body },
                  })
                }
              >
                {accepted ? 'Unmark answer' : 'Accept answer'}
              </button>
            )}
            {signedIn && comment.authorId !== profile.id && (!apiMode || comment.authorId) && (
              <button onClick={() => (onReportComment ? onReportComment(comment) : onReport())}>
                Report
              </button>
            )}
          </div>
          {children.length > 0 && (
            <div className="comment-replies">
              {children.map((child) => renderComment(child, nextVisited))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal campus-dialog post-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-detail-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2>From your campus</h2>
            <p>A connection, a conversation, a possibility.</p>
          </div>
          <button
            className="icon-button"
            title="Close post"
            aria-label="Close post"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="modal-body">
          <div className="post-detail-type-row">
            <span className="type-pill">{post.type}</span>
            {post.status && (
              <span className="composer-footer-note">
                <span
                  style={{ width: 5, height: 5, background: 'var(--primary)', borderRadius: '50%' }}
                />
                {post.status}
              </span>
            )}
          </div>
          <h1 className="post-detail-headline" id="post-detail-title">
            {post.title}
          </h1>
          <div className="post-detail-author">
            <Avatar value={post.avatar} name={post.author} />
            <div>
              <strong>
                {post.author}
                {isAuthor ? ' · You' : ''}
              </strong>
              <small>
                {post.faculty} · {timeAgo(post.createdAt)}
              </small>
            </div>
            {signedIn && !isAuthor && onReportUser && (
              <button
                style={{ marginLeft: 'auto' }}
                className="detail-action"
                onClick={() => onReportUser(post.authorId)}
                title="Report this user"
              >
                <Flag size={12} />
                Report user
              </button>
            )}
          </div>
          <div className="post-detail-copy">
            {post.body.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index}>
                <SafeText text={paragraph} />
              </p>
            ))}
          </div>
          {safeHttpUrl(post.image) && (
            <img
              src={safeHttpUrl(post.image)}
              alt={`Cover for ${post.title}`}
              className="post-detail-image"
            />
          )}
          {Object.entries(post.details).filter(
            ([key, value]) => value && key !== 'Accepted answer' && key !== 'Audience',
          ).length > 0 && (
            <div className="post-detail-info">
              {Object.entries(post.details)
                .filter(([key, value]) => value && key !== 'Accepted answer' && key !== 'Audience')
                .map(([key, value]) => (
                  <div className="post-detail-info-row" key={key}>
                    <DetailIcon label={key} />
                    <strong>{key}</strong>
                    {safeHttpUrl(value) ? (
                      <a href={safeHttpUrl(value)} target="_blank" rel="noopener noreferrer">
                        {value}
                        <ExternalLink size={11} style={{ marginLeft: 4 }} />
                      </a>
                    ) : (
                      <span>{value}</span>
                    )}
                  </div>
                ))}
            </div>
          )}
          {post.type === 'Poll' && post.pollOptions && (
            <div className="post-poll" aria-label="Student poll">
              {post.pollOptions.map((option) => {
                const count = post.votes?.[option] ?? 0;
                const percent = pollTotal ? Math.round((count / pollTotal) * 100) : 0;
                return (
                  <button
                    key={option}
                    className={`post-poll-choice ${votedOption === option ? 'selected' : ''}`}
                    disabled={!canVote}
                    onClick={() => void vote(option)}
                    aria-pressed={votedOption === option}
                  >
                    {(votedOption || pollClosed) && (
                      <div className="post-poll-progress" style={{ width: `${percent}%` }} />
                    )}
                    <span>
                      {votedOption === option && <Check size={13} />}
                      {option}
                    </span>
                    <span>
                      {votedOption || pollClosed ? (
                        `${count} · ${percent}%`
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </span>
                  </button>
                );
              })}
              <p className="post-poll-note">
                {pollTotal} {pollTotal === 1 ? 'vote' : 'votes'} ·{' '}
                {pollClosed
                  ? 'This poll has closed'
                  : votedOption
                    ? 'Your vote is in. Thanks for sharing your voice.'
                    : signedIn
                      ? 'Choose one option to vote'
                      : 'Sign in to vote'}
              </p>
            </div>
          )}
          <div className="post-detail-tags">
            {post.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <div className="post-detail-actions">
            <div className="post-detail-actions-group">
              {!apiMode && (
                <button
                  className={`detail-action ${liked ? 'active' : ''}`}
                  disabled={!signedIn}
                  onClick={onLike}
                  aria-pressed={liked}
                  title={liked ? 'Unlike post' : 'Like post'}
                >
                  <Heart size={15} />
                  {post.likes}
                </button>
              )}
              <span className="detail-action" style={{ cursor: 'default' }}>
                <MessageCircle size={15} />
                {post.comments.length}
              </span>
              <button
                className={`detail-action ${saved ? 'active' : ''}`}
                disabled={!signedIn}
                onClick={onSave}
                aria-pressed={saved}
              >
                <Bookmark size={15} />
                {saved ? 'Saved' : 'Save post'}
              </button>
            </div>
            <div className="post-detail-actions-group">
              {isAuthor ? (
                <>
                  <button className="detail-action" onClick={onEdit} title="Edit post">
                    <SquarePen size={14} />
                    Edit
                  </button>
                  <button
                    className="detail-action"
                    onClick={() => setDeleteConfirm(!deleteConfirm)}
                    title="Delete post"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                signedIn && (
                  <button className="detail-action" onClick={onReport} title="Report post">
                    <Flag size={14} />
                    Report
                  </button>
                )
              )}
            </div>
          </div>
          {isAuthor && deleteConfirm && (
            <div className="post-delete-confirm" role="alert">
              <p>Delete this post and its conversation? This cannot be undone.</p>
              <div>
                <button className="button danger" onClick={onDelete}>
                  <Trash2 size={12} />
                  Delete post
                </button>
                <button className="button secondary" onClick={() => setDeleteConfirm(false)}>
                  Keep post
                </button>
              </div>
            </div>
          )}
          <div className="comments-header">
            <h3>
              Campus conversation<span>{post.comments.length}</span>
            </h3>
            {isAuthor && (
              <button
                disabled={isUpdating}
                className="detail-action"
                onClick={() => {
                  void mutate({ ...post, commentsClosed: !post.commentsClosed });
                  setReplyTo(null);
                }}
                title={post.commentsClosed ? 'Reopen comments' : 'Close comments'}
              >
                {post.commentsClosed ? <UnlockKeyhole size={12} /> : <LockKeyhole size={12} />}
                {post.commentsClosed ? 'Reopen comments' : 'Close comments'}
              </button>
            )}
          </div>
          {post.comments.length ? (
            <div className="comments-list">
              {post.comments
                .filter(
                  (comment) =>
                    !comment.parentId ||
                    !post.comments.some((parent) => parent.id === comment.parentId),
                )
                .map((comment) => renderComment(comment))}
            </div>
          ) : (
            <div className="comments-empty">
              A good conversation starts with one hello.
              <br />
              Be the first to leave a comment.
            </div>
          )}
          {!signedIn ? (
            <div className="comments-closed">
              <LockKeyhole size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Sign in to join the conversation and save what matters to you.
            </div>
          ) : post.commentsClosed && !editingComment ? (
            <div className="comments-closed">
              <LockKeyhole size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              The author has closed this conversation.
            </div>
          ) : (
            <div className="comment-editor">
              <Avatar value={profile.avatar} name={profile.name} small />
              <div className="comment-editor-main">
                {(replyTo || editingComment) && (
                  <div className="comment-reply-label">
                    <span>
                      {editingComment ? 'Editing your comment' : `Replying to ${replyTo?.author}`}
                    </span>
                    <button
                      className="icon-button"
                      title="Cancel comment edit or reply"
                      aria-label="Cancel comment edit or reply"
                      onClick={() => {
                        setReplyTo(null);
                        setEditingComment(null);
                        setCommentBody('');
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                <textarea
                  disabled={isUpdating}
                  aria-label={
                    editingComment
                      ? 'Edit your comment'
                      : replyTo
                        ? `Reply to ${replyTo.author}`
                        : 'Write a comment'
                  }
                  ref={commentRef}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder={
                    replyTo ? 'Keep the conversation going…' : 'Add to the conversation…'
                  }
                  maxLength={2000}
                  rows={2}
                />
                <div className="comment-editor-bottom">
                  <button
                    className="button primary"
                    onClick={() => void sendComment()}
                    disabled={!commentBody.trim() || isUpdating}
                  >
                    <Send size={12} />
                    {isUpdating
                      ? 'Saving…'
                      : editingComment
                        ? 'Save comment'
                        : replyTo
                          ? 'Post reply'
                          : 'Post comment'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PostDetail;
