import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Leaf,
  Save,
  Send,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';
import type { Post, PostType, Profile } from '../types';
import { faculties as demoFaculties, postTypes } from '../data';
import './dialogs.css';

interface ComposerProps {
  profile: Profile;
  post?: Post;
  faculties?: string[];
  apiMode?: boolean;
  onClose: () => void;
  onPublish: (post: Post) => void | boolean | Promise<void | boolean>;
}

interface ExtraField {
  key: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'url' | 'date' | 'textarea' | 'select';
  choices?: string[];
}

interface BrowserDraft {
  type: PostType;
  title: string;
  body: string;
  faculty: string;
  tags: string;
  image: string;
  details: Record<string, string>;
  options: string;
}

function loadDraft(key: string): BrowserDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? 'null') as BrowserDraft | null;
    if (
      !draft ||
      !postTypes.includes(draft.type) ||
      !['title', 'body', 'faculty', 'tags', 'image', 'options'].every(
        (field) => typeof draft[field as keyof BrowserDraft] === 'string',
      ) ||
      !draft.details ||
      typeof draft.details !== 'object'
    )
      return null;
    return {
      ...draft,
      details: Object.fromEntries(
        Object.entries(draft.details).filter(([, value]) => typeof value === 'string'),
      ),
    };
  } catch {
    return null;
  }
}

const extraFields: Record<PostType, ExtraField[]> = {
  Announcement: [{ key: 'Expiry date', placeholder: 'e.g. November 13, 2026' }],
  'Club recruitment': [
    { key: 'Club', required: true, placeholder: 'Your club or society' },
    { key: 'Deadline', placeholder: 'e.g. October 30, 2026' },
    {
      key: 'Joining instructions',
      type: 'textarea',
      required: true,
      placeholder: 'How can students become a member?',
    },
  ],
  Event: [
    {
      key: 'Date',
      label: 'Date & time',
      required: true,
      placeholder: 'e.g. October 23, 2026 at 17:00',
    },
    { key: 'Location', required: true, placeholder: 'Building, room, or online' },
    { key: 'Organizer', required: true, placeholder: 'Who is bringing everyone together?' },
    {
      key: 'Registration',
      label: 'Registration link or instructions',
      placeholder: 'A sign-up URL, or how to register',
    },
  ],
  Opportunity: [
    { key: 'Deadline', required: true, placeholder: 'e.g. November 2, 2026' },
    { key: 'Organizer', placeholder: 'Organization or competition' },
    { key: 'Eligibility', required: true, placeholder: 'Who can apply?' },
    { key: 'Application', label: 'Application link', type: 'url', placeholder: 'https://' },
  ],
  'Find teammates': [
    { key: 'Skills needed', required: true, placeholder: 'e.g. Frontend development, design' },
    {
      key: 'Open places',
      label: 'People needed',
      type: 'number',
      required: true,
      placeholder: '2',
    },
    { key: 'Deadline', placeholder: 'When do you need your team?' },
    { key: 'Status', type: 'select', choices: ['Open', 'Filled'] },
  ],
  'Study group': [
    { key: 'Course', required: true, placeholder: 'e.g. Databases' },
    {
      key: 'Format',
      label: 'Meeting format',
      type: 'select',
      choices: ['In person', 'Online', 'Hybrid'],
    },
    { key: 'Schedule', required: true, placeholder: 'e.g. Tuesdays at 16:00' },
    { key: 'Available places', type: 'number', placeholder: '5' },
  ],
  Question: [{ key: 'Topic', placeholder: 'e.g. Erasmus, student life, courses' }],
  'Lost & found': [
    { key: 'Item', required: true, placeholder: 'What was lost or found?' },
    { key: 'Location', required: true, placeholder: 'Approximate location' },
    { key: 'Date', required: true, placeholder: 'e.g. October 15, around noon' },
    { key: 'Status', type: 'select', choices: ['Unresolved', 'Resolved'] },
  ],
  Poll: [{ key: 'Closing date', placeholder: 'e.g. October 30, 2026 at 18:00' }],
};

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function Composer({
  profile,
  post,
  faculties = demoFaculties,
  apiMode = false,
  onClose,
  onPublish,
}: ComposerProps) {
  const draftKey = `uniboard-draft:${profile.id}:${profile.university}`;
  const [draft] = useState(() => (post ? null : loadDraft(draftKey)));
  const [draftMessage, setDraftMessage] = useState(
    draft ? 'Your saved draft has been restored from this browser.' : '',
  );
  const [step, setStep] = useState<'write' | 'preview'>('write');
  const [type, setType] = useState<PostType>(post?.type ?? draft?.type ?? 'Event');
  const [title, setTitle] = useState(post?.title ?? draft?.title ?? '');
  const [body, setBody] = useState(post?.body ?? draft?.body ?? '');
  const [faculty, setFaculty] = useState(post?.faculty ?? draft?.faculty ?? 'All faculties');
  const [tags, setTags] = useState(post?.tags.join(', ') ?? draft?.tags ?? '');
  const [image, setImage] = useState(post?.image ?? draft?.image ?? '');
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const initial = { ...(post?.details ?? draft?.details ?? {}) };
    if (post?.type === 'Find teammates' && initial['Open places'])
      initial['Open places'] = initial['Open places'].match(/\d+/)?.[0] ?? initial['Open places'];
    if (post?.type === 'Club recruitment') {
      initial['Joining instructions'] = initial['Joining instructions'] ?? initial['How to join'];
      initial.Deadline = initial.Deadline ?? initial['Application deadline'];
    }
    if (post?.type === 'Lost & found') {
      initial.Location = initial.Location ?? initial['Found near'];
      initial.Date = initial.Date ?? initial['Date found'];
    }
    return initial;
  });
  const [options, setOptions] = useState(post?.pollOptions?.join('\n') ?? draft?.options ?? '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previewTags = [
    ...new Set(
      tags
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ].slice(0, 8);
  const optionList = [
    ...new Set(
      options
        .split('\n')
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
  const visibleFields = extraFields[type].map((field) => {
    if (!apiMode) return field;
    if (
      (type === 'Opportunity' && field.key === 'Organizer') ||
      (type === 'Study group' && field.key === 'Available places') ||
      (type === 'Poll' && field.key === 'Closing date')
    )
      return { ...field, required: true };
    if (type === 'Event' && field.key === 'Registration')
      return {
        ...field,
        label: 'Registration link',
        type: 'url' as const,
        placeholder: 'https://',
      };
    return field;
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    function handleKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
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
  }, [onClose]);

  function validate() {
    if (!title.trim()) {
      setError('Give your post a clear title before continuing.');
      return false;
    }
    if (!body.trim()) {
      setError('Add a few details so other students know what your post is about.');
      return false;
    }
    const missingField = visibleFields.find(
      (field) => field.required && !details[field.key]?.trim(),
    );
    if (missingField) {
      setError(
        `Please add ${missingField.label?.toLowerCase() ?? missingField.key.toLowerCase()}.`,
      );
      return false;
    }
    const invalidNumber = visibleFields.find(
      (field) =>
        field.type === 'number' &&
        details[field.key] &&
        (!Number.isInteger(Number(details[field.key])) || Number(details[field.key]) < 1),
    );
    if (invalidNumber) {
      setError(
        `${invalidNumber.label ?? invalidNumber.key} must be a whole number greater than zero.`,
      );
      return false;
    }
    const invalidLink = visibleFields.find(
      (field) => field.type === 'url' && details[field.key] && !safeHttpUrl(details[field.key]),
    );
    if (invalidLink) {
      setError(
        `Use a complete http or https URL for the ${invalidLink.label?.toLowerCase() ?? invalidLink.key.toLowerCase()}.`,
      );
      return false;
    }
    if (image.trim() && !safeHttpUrl(image.trim())) {
      setError('Use a complete http or https image URL.');
      return false;
    }
    if (apiMode && image.trim() && !image.trim().startsWith('https://')) {
      setError('The campus server requires HTTPS image URLs.');
      return false;
    }
    if (type === 'Poll' && optionList.length < 2) {
      setError('Add at least two different poll choices, one per line.');
      return false;
    }
    setError('');
    return true;
  }

  function preview() {
    if (validate()) {
      setStep('preview');
      dialogRef.current?.querySelector('.modal-body')?.scrollTo(0, 0);
    }
  }

  function saveDraft() {
    try {
      const browserDraft: BrowserDraft = {
        type,
        title,
        body,
        faculty,
        tags,
        image,
        details,
        options,
      };
      localStorage.setItem(draftKey, JSON.stringify(browserDraft));
      setDraftMessage('Draft saved. It will be here when you return on this browser.');
      setError('');
    } catch {
      setError(
        'This browser could not save the draft. You can still preview and publish your post.',
      );
    }
  }

  async function publish() {
    if (isSubmitting) return;
    if (!validate()) {
      setStep('write');
      return;
    }
    const cleanDetails: Record<string, string> = {
      ...(post?.type === type ? post.details : {}),
      Audience: faculty,
    };
    visibleFields.forEach((field) => {
      const value =
        details[field.key]?.trim() || (field.type === 'select' ? field.choices?.[0] : '');
      if (value) cleanDetails[field.key] = value;
      else delete cleanDetails[field.key];
    });
    if (type === 'Question' && post?.details['Accepted answer'])
      cleanDetails['Accepted answer'] = post.details['Accepted answer'];
    const nextPost: Post = {
      ...(post ?? {}),
      id: post?.id ?? crypto.randomUUID(),
      type,
      title: title.trim(),
      body: body.trim(),
      author: post?.author ?? profile.name,
      authorId: post?.authorId ?? profile.id,
      avatar: post?.avatar ?? profile.avatar,
      faculty,
      tags: previewTags,
      image: image.trim() || undefined,
      createdAt: post?.createdAt ?? new Date().toISOString(),
      likes: post?.likes ?? 0,
      comments: post?.comments ?? [],
      details: cleanDetails,
      status: cleanDetails.Status ?? (post?.type === type ? post.status : undefined),
      ...(type === 'Poll'
        ? {
            pollOptions: optionList,
            votes: Object.fromEntries(
              optionList.map((option) => [option, post?.votes?.[option] ?? 0]),
            ),
          }
        : { pollOptions: undefined, votes: undefined }),
    };
    setIsSubmitting(true);
    try {
      const result = await onPublish(nextPost);
      if (result !== false && !post) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* Publishing does not require browser storage. */
        }
      }
      if (result === false)
        setError(
          'Your post was not published. Your draft is still here. Check the server message and try again.',
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Your post could not be published. Your draft is still here.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal campus-dialog composer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2 id="composer-title">{post ? 'Edit post' : 'Create post'}</h2>
            <p>
              {post
                ? 'Keep your campus in the loop.'
                : 'Share something with your campus community.'}
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title="Close post editor"
            aria-label="Close post editor"
          >
            <X size={19} />
          </button>
        </div>
        <div className="modal-body">
          <div className="composer-step-tabs" aria-label="Post creation steps">
            <button className={step === 'write' ? 'active' : ''} onClick={() => setStep('write')}>
              <SquarePen size={14} />
              1. Write your post
            </button>
            <button className={step === 'preview' ? 'active' : ''} onClick={preview}>
              <Eye size={14} />
              2. Preview
            </button>
          </div>
          {error && (
            <div className="composer-error" role="alert">
              {error}
            </div>
          )}
          {draftMessage && step === 'write' && (
            <div className="composer-preview-note" role="status">
              <Check size={14} />
              {draftMessage}
            </div>
          )}
          {step === 'write' ? (
            <>
              <span className="field-label">What would you like to share?</span>
              <div className="post-type-options">
                {postTypes.map((item) => (
                  <button
                    key={item}
                    className={`post-type-option ${type === item ? 'selected' : ''}`}
                    aria-pressed={type === item}
                    onClick={() => {
                      setType(item);
                      setError('');
                    }}
                  >
                    {type === item && <Check size={12} />}
                    {item}
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="post-title">
                  Title <span>· required</span>
                </label>
                <input
                  id="post-title"
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Give students a reason to stop scrolling"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="post-body">
                  The details <span>· required</span>
                </label>
                <textarea
                  id="post-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="What should your campus know? Include the who, what, and why."
                  rows={5}
                  maxLength={8000}
                  required
                />
                <small>
                  {apiMode
                    ? 'For dates, use a single date and time such as 2026-10-23T17:00. Images must use HTTPS.'
                    : 'Keep it clear, kind, and useful. Paragraphs and links are welcome.'}
                </small>
              </div>
              <div className="composer-grid">
                <div className="field">
                  <label htmlFor="post-audience">Who is it for?</label>
                  <select
                    id="post-audience"
                    value={faculty}
                    onChange={(event) => setFaculty(event.target.value)}
                  >
                    <option>All faculties</option>
                    {faculties.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="post-tags">
                    Tags <span>· optional</span>
                  </label>
                  <input
                    id="post-tags"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="programming, design, first-year"
                  />
                  <small>Separate with commas. Up to 8 tags.</small>
                </div>
              </div>
              <div className="composer-extra-fields">
                <h3>
                  <Sparkles size={14} />A few {type.toLowerCase()} details
                </h3>
                <div className="composer-grid">
                  {visibleFields.map((field) => (
                    <div
                      className="field"
                      key={field.key}
                      style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}
                    >
                      <label htmlFor={`extra-${field.key}`}>
                        {field.label ?? field.key}{' '}
                        <span>{field.required ? '· required' : '· optional'}</span>
                      </label>
                      {field.type === 'select' ? (
                        <select
                          id={`extra-${field.key}`}
                          value={details[field.key] ?? field.choices?.[0]}
                          onChange={(event) =>
                            setDetails({ ...details, [field.key]: event.target.value })
                          }
                        >
                          {field.choices?.map((choice) => (
                            <option key={choice}>{choice}</option>
                          ))}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          id={`extra-${field.key}`}
                          value={details[field.key] ?? ''}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setDetails({ ...details, [field.key]: event.target.value })
                          }
                          rows={2}
                          required={field.required}
                        />
                      ) : (
                        <input
                          id={`extra-${field.key}`}
                          type={field.type ?? 'text'}
                          value={details[field.key] ?? ''}
                          placeholder={field.placeholder}
                          min={field.type === 'number' ? 1 : undefined}
                          step={field.type === 'number' ? 1 : undefined}
                          onChange={(event) =>
                            setDetails({ ...details, [field.key]: event.target.value })
                          }
                          required={field.required}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {type === 'Poll' && (
                  <div className="field">
                    <label htmlFor="poll-options">
                      Answer choices <span>· at least 2 required</span>
                    </label>
                    <textarea
                      id="poll-options"
                      value={options}
                      onChange={(event) => setOptions(event.target.value)}
                      placeholder={'Creative coding\nPhotography\nPublic speaking'}
                      rows={4}
                    />
                    <small>One choice per line, up to 8 choices.</small>
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor="post-image">
                  Cover image URL <span>· optional</span>
                </label>
                <input
                  id="post-image"
                  type="url"
                  value={image}
                  onChange={(event) => setImage(event.target.value)}
                  placeholder="https://example.com/your-image.jpg"
                />
                <small>Add an image that helps tell the story.</small>
              </div>
            </>
          ) : (
            <>
              <div className="composer-preview-note">
                <Eye size={14} />
                This is how your post will appear to your campus.
              </div>
              <div className="post-detail-type-row">
                <span className="type-pill">{type}</span>
                <span className="composer-footer-note">{faculty}</span>
              </div>
              <h3 className="post-detail-headline">{title}</h3>
              <div className="post-detail-author">
                <span className="post-detail-avatar">
                  {profile.avatar?.startsWith('http') ? (
                    <img src={safeHttpUrl(profile.avatar)} alt="" className="post-detail-avatar" />
                  ) : (
                    profile.avatar
                  )}
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{faculty} · Just now</small>
                </div>
              </div>
              <div className="post-detail-copy">{body}</div>
              {image && (
                <img
                  className="post-detail-image"
                  src={safeHttpUrl(image)}
                  alt="Post cover preview"
                />
              )}
              {visibleFields.some((field) => details[field.key]) && (
                <div className="post-detail-info">
                  {visibleFields
                    .filter((field) => details[field.key])
                    .map((field) => (
                      <div className="post-detail-info-row" key={field.key}>
                        <strong>{field.label ?? field.key}</strong>
                        <span>{details[field.key]}</span>
                      </div>
                    ))}
                </div>
              )}
              {type === 'Poll' && (
                <div className="post-poll">
                  {optionList.map((option) => (
                    <div className="post-poll-choice" key={option}>
                      <span>{option}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="post-detail-tags">
                {previewTags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          {step === 'write' ? (
            <span className="composer-footer-note">
              <Leaf size={12} />
              Preview your post before publishing.
            </span>
          ) : (
            <button className="button secondary" onClick={() => setStep('write')}>
              <ArrowLeft size={14} />
              Back to writing
            </button>
          )}
          <div className="composer-footer-actions">
            {!post && (
              <button className="button secondary" onClick={saveDraft} disabled={isSubmitting}>
                <Save size={14} />
                Save draft
              </button>
            )}
            {step === 'write' ? (
              <button className="button primary" onClick={preview}>
                Preview post
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={isSubmitting}
                onClick={() => void publish()}
              >
                <Send size={14} />
                {isSubmitting ? 'Publishing…' : post ? 'Save changes' : 'Publish to campus'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Composer;
