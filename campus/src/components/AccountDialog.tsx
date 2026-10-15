import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Mail,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type { Profile } from '../types';
import { faculties } from '../data';
import './account.css';

type Props = {
  mode: 'profile' | 'university' | 'signin';
  profile: Profile;
  onClose: () => void;
  onUpdate: (profile: Profile) => void;
  onSignOut: () => void;
  onNotify: (message: string) => void;
};

const universities = [
  { name: 'University of Tirana', domain: 'unitir.edu.al', initials: 'UT' },
  { name: 'Polytechnic University of Tirana', domain: 'upt.al', initials: 'UPT' },
  { name: 'Epoka University', domain: 'epoka.edu.al', initials: 'EU' },
  { name: 'University of Arts', domain: 'uart.edu.al', initials: 'UA' },
];

function safePhoto(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export default function AccountDialog({
  mode,
  profile,
  onClose,
  onUpdate,
  onSignOut,
  onNotify,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState<Profile>({
    ...profile,
    avatar: safePhoto(profile.avatar) ?? '',
  });
  const dialogRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [reset, setReset] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [message, setMessage] = useState('');
  const title =
    mode === 'profile'
      ? 'Make yourself at home.'
      : mode === 'university'
        ? 'Find your campus.'
        : reset
          ? 'A little help getting back.'
          : 'Your campus, connected.';
  const university = universities.find((item) => item.name === draft.university) ?? universities[0];
  const universityChanged = draft.university !== profile.university;
  const emailDomain = draft.email.trim().toLowerCase().split('@')[1] ?? '';
  const universityEmail =
    emailDomain === university.domain || emailDomain.endsWith(`.${university.domain}`);
  const photo = safePhoto(draft.avatar);
  const initials =
    draft.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name[0])
      .join('')
      .toUpperCase() || 'YOU';
  const setField = (key: keyof Profile, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (draft.avatar && !safePhoto(draft.avatar)) {
      setMessage('Use an image URL that starts with https:// or http://, or leave it blank.');
      return;
    }
    onUpdate({
      ...draft,
      name: draft.name.trim(),
      email: draft.email.trim(),
      avatar: safePhoto(draft.avatar) ?? '',
      verified:
        profile.verified && draft.email.trim().toLowerCase() === profile.email.trim().toLowerCase(),
    });
    onNotify('Your profile has been saved in this browser.');
    onClose();
  }

  function saveMembership(manual: boolean) {
    if (universityChanged && !confirmed) {
      setMessage('Confirm your campus change to continue.');
      return;
    }
    onUpdate({
      ...profile,
      university: draft.university,
      email: draft.email.trim(),
      verified: false,
    });
    onNotify(
      manual
        ? 'Membership request saved in this browser. A real approval service is not connected.'
        : 'Preview membership saved in this browser. Real membership verification is not connected.',
    );
    onClose();
  }

  function continuePreview(event: FormEvent) {
    event.preventDefault();
    if (reset) {
      setMessage('Email delivery is not connected in this preview. No reset email has been sent.');
      return;
    }
    onUpdate({ ...draft, name: draft.name.trim(), email: draft.email.trim(), verified: false });
    onNotify(
      tab === 'register'
        ? 'Your preview profile is ready. It is saved in this browser.'
        : 'Welcome back. You are using a browser-local preview profile.',
    );
    onClose();
  }

  return (
    <div
      className="modal-backdrop account-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`modal account-dialog account-dialog--${mode}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <button
          className="icon-button account-close"
          type="button"
          onClick={onClose}
          aria-label="Close account dialog"
        >
          <X size={20} />
        </button>
        <div className="account-heading">
          <div className="account-symbol">
            {mode === 'university' ? (
              <Building2 size={25} />
            ) : mode === 'profile' ? (
              <UserRound size={25} />
            ) : (
              <GraduationCap size={28} />
            )}
          </div>
          <p className="account-eyebrow">
            {mode === 'profile'
              ? 'YOUR STUDENT PROFILE'
              : mode === 'university'
                ? 'A PLACE TO BELONG'
                : 'WELCOME TO UNIBOARD'}
          </p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="account-intro">
            {mode === 'profile'
              ? 'Help the people on campus get to know you.'
              : mode === 'university'
                ? 'Join the conversations, opportunities, and people around you.'
                : 'Good things happen when students find each other.'}
          </p>
        </div>

        {mode === 'profile' && (
          <form className="account-form" onSubmit={saveProfile}>
            <div className="account-profile-preview">
              <div className="account-avatar">
                {photo && !imageFailed ? (
                  <img
                    src={photo}
                    alt="Your profile preview"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  initials
                )}
              </div>
              <div>
                <strong>{draft.name || 'Your name'}</strong>
                <span>{draft.faculty || 'Your faculty'}</span>
              </div>
              <span className="account-student-tag">
                <GraduationCap size={13} /> Student
              </span>
            </div>
            <label className="field">
              Full name
              <input
                required
                maxLength={70}
                autoComplete="name"
                value={draft.name}
                onChange={(event) => setField('name', event.target.value)}
              />
            </label>
            <label className="field">
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => setField('email', event.target.value)}
              />
            </label>
            <div className="account-field-pair">
              <label className="field">
                Faculty
                <select
                  value={draft.faculty}
                  onChange={(event) => setField('faculty', event.target.value)}
                >
                  {faculties.map((faculty) => (
                    <option key={faculty}>{faculty}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Year of study
                <select
                  value={draft.year}
                  onChange={(event) => setField('year', event.target.value)}
                >
                  <option value="">Prefer not to say</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={String(year)}>
                      Year {year}
                    </option>
                  ))}
                  <option value="Postgraduate">Postgraduate</option>
                </select>
              </label>
            </div>
            <label className="field">
              Study program
              <input
                required
                maxLength={90}
                placeholder="e.g. Computer Science"
                value={draft.program}
                onChange={(event) => setField('program', event.target.value)}
              />
            </label>
            <label className="field">
              A little about you <span className="account-optional">optional</span>
              <textarea
                rows={3}
                maxLength={280}
                placeholder="What are you into? What are you working on?"
                value={draft.bio}
                onChange={(event) => setField('bio', event.target.value)}
              />
              <span className="account-character-count">{draft.bio.length}/280</span>
            </label>
            <label className="field">
              Profile photo URL <span className="account-optional">optional</span>
              <input
                type="url"
                placeholder="https://…"
                value={draft.avatar}
                onChange={(event) => {
                  setField('avatar', event.target.value);
                  setImageFailed(false);
                }}
              />
            </label>
            {message && (
              <p className="account-message" role="alert">
                {message}
              </p>
            )}
            <div className="account-form-footer">
              <button type="button" className="account-signout" onClick={onSignOut}>
                Sign out
              </button>
              <button type="submit" className="button primary">
                Save profile <Check size={16} />
              </button>
            </div>
          </form>
        )}

        {mode === 'university' && (
          <div className="account-form">
            <div className="account-preview-note">
              <ShieldCheck size={17} />
              <span>Browser preview · no email is sent</span>
            </div>
            <div
              className="account-universities"
              role="radiogroup"
              aria-label="Choose your university"
            >
              {universities.map((item) => (
                <label
                  className={`account-university ${draft.university === item.name ? 'is-selected' : ''}`}
                  key={item.name}
                >
                  <input
                    type="radio"
                    name={`${id}-university`}
                    checked={draft.university === item.name}
                    onChange={() => {
                      setField('university', item.name);
                      setConfirmed(false);
                      setMessage('');
                    }}
                  />
                  <span className="account-university-mark">{item.initials}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.domain}</small>
                  </span>
                  <span className="account-radio">
                    <Check size={12} />
                  </span>
                </label>
              ))}
            </div>
            <label className="field">
              University email
              <input
                type="email"
                value={draft.email}
                placeholder={`you@${university.domain}`}
                onChange={(event) => setField('email', event.target.value)}
              />
            </label>
            <p className="account-email-hint">
              <Mail size={14} />
              {universityEmail
                ? 'Recognized campus email format. Actual verification is not connected.'
                : `Use your @${university.domain} address, or save a manual review request.`}
            </p>
            {universityChanged && (
              <label className="account-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I want to change my campus to <strong>{draft.university}</strong>.
                </span>
              </label>
            )}
            {message && (
              <p className="account-message" role="alert">
                {message}
              </p>
            )}
            <button
              type="button"
              className="button primary account-full-button"
              disabled={!universityEmail || (universityChanged && !confirmed)}
              onClick={() => saveMembership(false)}
            >
              Preview membership <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="account-manual"
              disabled={universityChanged && !confirmed}
              onClick={() => saveMembership(true)}
            >
              No university email? Save a manual review request <ChevronRight size={14} />
            </button>
            <p className="account-fineprint">
              Preview membership does not verify student status. Membership and review requests are
              only saved in this browser.
            </p>
          </div>
        )}

        {mode === 'signin' && (
          <form className="account-form" onSubmit={continuePreview}>
            <div className="account-preview-note">
              <ShieldCheck size={17} />
              <span>Browser preview · no email is sent</span>
            </div>
            {!reset && (
              <div className="account-auth-tabs" role="tablist" aria-label="Account options">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'signin'}
                  className={tab === 'signin' ? 'is-active' : ''}
                  onClick={() => {
                    setTab('signin');
                    setMessage('');
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'register'}
                  className={tab === 'register' ? 'is-active' : ''}
                  onClick={() => {
                    setTab('register');
                    setMessage('');
                  }}
                >
                  Create account
                </button>
              </div>
            )}
            {reset && (
              <p className="account-reset-info">
                Enter your email to see the reset flow. Email delivery is not connected in this
                preview.
              </p>
            )}
            {!reset && (
              <label className="field">
                Full name
                <input
                  required
                  maxLength={70}
                  autoComplete="name"
                  placeholder="Your name"
                  value={draft.name}
                  onChange={(event) => setField('name', event.target.value)}
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={draft.email}
                onChange={(event) => setField('email', event.target.value)}
              />
            </label>
            {!reset && tab === 'register' && (
              <>
                <label className="field">
                  Faculty
                  <select
                    value={draft.faculty}
                    onChange={(event) => setField('faculty', event.target.value)}
                  >
                    {faculties.map((faculty) => (
                      <option key={faculty}>{faculty}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Study program
                  <input
                    required
                    maxLength={90}
                    placeholder="e.g. Computer Science"
                    value={draft.program}
                    onChange={(event) => setField('program', event.target.value)}
                  />
                </label>
              </>
            )}
            {message && (
              <p className="account-message" role="status">
                <CheckCircle2 size={17} />
                {message}
              </p>
            )}
            <button type="submit" className="button primary account-full-button">
              {reset ? 'Preview password reset' : 'Continue in preview'} <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="account-manual"
              onClick={() => {
                setReset(!reset);
                setMessage('');
              }}
            >
              {reset ? 'Back to sign in' : 'Forgot password?'}
            </button>
            <p className="account-fineprint">
              {reset
                ? 'This demo cannot send email or reset a real password.'
                : 'This is a local interactive demo. No password is collected. Your preview profile is saved in this browser.'}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
