import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Building2, Check, LogOut, ShieldCheck, X } from 'lucide-react';
import type { ApiBoard, AuthResult } from '../features/board/useApiBoard';
import { apiRequest } from '../lib/api';
import type { ApiFaculty } from '../lib/api';
import './account.css';
import './dialogs.css';

interface ApiAccountDialogProps {
  mode: 'profile' | 'university' | 'signin';
  board: ApiBoard;
  onClose: () => void;
}
type AuthTab = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export default function ApiAccountDialog({ mode, board, onClose }: ApiAccountDialogProps) {
  const [tab, setTab] = useState<AuthTab>('login');
  const [name, setName] = useState(board.profile.name === 'Your account' ? '' : board.profile.name);
  const [email, setEmail] = useState(board.profile.email);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [developmentToken, setDevelopmentToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    ...board.profile,
    avatar: board.profile.avatar.startsWith('https://') ? board.profile.avatar : '',
  });
  const [universityId, setUniversityId] = useState(
    board.activeUniversityId ?? board.universities[0]?.id ?? '',
  );
  const [facultyId, setFacultyId] = useState(board.membership?.faculty_id ?? '');
  const [faculties, setFaculties] = useState<ApiFaculty[]>([]);
  const [universityEmail, setUniversityEmail] = useState('');
  const [evidence, setEvidence] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const view = !board.signedIn ? 'signin' : mode === 'signin' ? 'university' : mode;
  const selectedMembership = board.memberships.find(
    (member) => member.university_id === universityId,
  );
  const university = board.universities.find((item) => item.id === universityId);
  const title =
    view === 'profile'
      ? 'Your student profile.'
      : view === 'university'
        ? 'Find your campus.'
        : tab === 'register'
          ? 'Make yourself at home.'
          : tab === 'verify'
            ? 'Verify your email.'
            : tab === 'forgot'
              ? 'Getting back in.'
              : tab === 'reset'
                ? 'A fresh password.'
                : 'Welcome to your campus.';

  useEffect(() => {
    if (!universityId && board.universities.length)
      setUniversityId(board.activeUniversityId ?? board.universities[0].id);
  }, [universityId, board.universities, board.activeUniversityId]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    function keys(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keys);
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!universityId || view !== 'university') return;
    let cancelled = false;
    setFaculties([]);
    apiRequest<ApiFaculty[]>(`/universities/${universityId}/faculties`)
      .then((response) => {
        if (cancelled) return;
        setFaculties(response.data);
        const member = board.memberships.find((item) => item.university_id === universityId);
        setFacultyId(member?.faculty_id ?? response.data[0]?.id ?? '');
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'Could not load faculties.');
      });
    return () => {
      cancelled = true;
    };
  }, [universityId, view, board.memberships]);

  function showResult(result: AuthResult, fallback: string) {
    setMessage(result.message ?? fallback);
    setDevelopmentToken(result.developmentToken ?? '');
    if (result.developmentToken) setToken(result.developmentToken);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (tab === 'login') {
        await board.auth.login(email, password);
        setPassword('');
        setMessage('Signed in. Select your university membership to continue.');
      }
      if (tab === 'register') {
        showResult(
          await board.auth.register(name, email, password),
          'Check your email for a verification token.',
        );
        setPassword('');
        setTab('verify');
      }
      if (tab === 'verify') {
        await board.auth.verifyEmail(token);
        setDevelopmentToken('');
        setToken('');
        setTab('login');
        setMessage('Email verified. You can now sign in.');
      }
      if (tab === 'forgot') {
        showResult(
          await board.auth.forgotPassword(email),
          'If this account is eligible, a reset email has been sent.',
        );
        setTab('reset');
      }
      if (tab === 'reset') {
        await board.auth.resetPassword(token, password);
        setPassword('');
        setToken('');
        setDevelopmentToken('');
        setTab('login');
        setMessage('Password changed. Sign in with your new password.');
      }
    });
  }

  function changeTab(next: AuthTab) {
    setTab(next);
    setError('');
    setMessage('');
    setDevelopmentToken('');
    setToken('');
    setPassword('');
  }

  return (
    <div
      className="modal-backdrop account-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal account-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-account-title"
      >
        <button
          className="icon-button account-close"
          onClick={onClose}
          title="Close account settings"
          aria-label="Close account settings"
        >
          <X size={20} />
        </button>
        <div className="account-heading">
          <div className="account-symbol">
            {view === 'university' ? <Building2 size={25} /> : <ShieldCheck size={25} />}
          </div>
          <p className="account-eyebrow">CONNECTED CAMPUS ACCOUNT</p>
          <h2 id="api-account-title">{title}</h2>
          <p className="account-intro">
            {view === 'signin'
              ? 'A real account, with secure sessions and verified email.'
              : view === 'university'
                ? 'Your university controls access to its campus community.'
                : 'Help the people on campus get to know you.'}
          </p>
        </div>
        <div className="account-form">
          {error && (
            <p className="account-message" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="account-preview-note" role="status">
              <Check size={16} />
              {message}
            </p>
          )}
          {developmentToken && (
            <div className="account-message">
              <strong>Development server token</strong>
              <p>
                The server explicitly returned this token because it is running in development. It
                has been filled in below.
              </p>
              <code style={{ display: 'block', overflowWrap: 'anywhere', userSelect: 'all' }}>
                {developmentToken}
              </code>
            </div>
          )}
          {view === 'signin' && (
            <>
              {['login', 'register'].includes(tab) && (
                <div className="account-auth-tabs">
                  <button
                    onClick={() => changeTab('login')}
                    className={tab === 'login' ? 'is-active' : ''}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => changeTab('register')}
                    className={tab === 'register' ? 'is-active' : ''}
                  >
                    Create account
                  </button>
                </div>
              )}
              <form onSubmit={submitAuth}>
                {tab === 'register' && (
                  <label className="field">
                    Full name
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                )}
                {['login', 'register', 'forgot'].includes(tab) && (
                  <label className="field">
                    Email address
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                )}
                {['verify', 'reset'].includes(tab) && (
                  <label className="field">
                    {tab === 'verify' ? 'Email verification token' : 'Password reset token'}
                    <textarea
                      required
                      minLength={20}
                      maxLength={128}
                      rows={2}
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                )}
                {['login', 'register', 'reset'].includes(tab) && (
                  <label className="field">
                    {tab === 'reset' ? 'New password' : 'Password'}
                    <input
                      required
                      type="password"
                      minLength={tab === 'login' ? 1 : 12}
                      maxLength={128}
                      autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    {tab !== 'login' && (
                      <span className="account-fineprint">At least 12 characters.</span>
                    )}
                  </label>
                )}
                <button className="button primary account-full-button" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : tab === 'login'
                      ? 'Sign in'
                      : tab === 'register'
                        ? 'Create account'
                        : tab === 'verify'
                          ? 'Verify email'
                          : tab === 'forgot'
                            ? 'Send reset email'
                            : 'Reset password'}
                  <ArrowRight size={15} />
                </button>
              </form>
              {tab === 'login' ? (
                <>
                  <button
                    className="account-manual"
                    disabled={busy}
                    onClick={() => changeTab('forgot')}
                  >
                    Forgot your password?
                  </button>
                  <button
                    className="account-manual"
                    disabled={busy}
                    onClick={() => changeTab('verify')}
                  >
                    I have an email verification token
                  </button>
                </>
              ) : (
                <button
                  className="account-manual"
                  disabled={busy}
                  onClick={() => changeTab('login')}
                >
                  Back to sign in
                </button>
              )}
              {tab === 'verify' && (
                <>
                  <label className="field">
                    Account email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <button
                    className="account-manual"
                    disabled={busy || !email}
                    onClick={() =>
                      void run(async () =>
                        showResult(
                          await board.auth.resendVerification(email),
                          'If eligible, a verification email has been sent.',
                        ),
                      )
                    }
                  >
                    Resend verification email
                  </button>
                </>
              )}
            </>
          )}
          {view === 'university' && (
            <>
              <label className="field">
                University
                <select
                  value={universityId}
                  onChange={(event) => {
                    setUniversityId(event.target.value);
                    setToken('');
                    setDevelopmentToken('');
                    setMessage('');
                    setError('');
                  }}
                >
                  {!board.universities.length && (
                    <option value="">No universities available</option>
                  )}
                  {board.universities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedMembership && (
                <p className="account-preview-note">
                  Membership: {selectedMembership.status}.{' '}
                  {selectedMembership.status === 'suspended'
                    ? 'You can still read account notifications about this decision.'
                    : ''}
                </p>
              )}
              {selectedMembership?.status === 'approved' ? (
                <button
                  className="button primary account-full-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await board.selectUniversity(universityId);
                      onClose();
                    })
                  }
                >
                  Open this campus
                  <ArrowRight size={16} />
                </button>
              ) : (
                selectedMembership?.status !== 'suspended' && (
                  <>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(async () =>
                          showResult(
                            await board.auth.joinUniversity(universityId, {
                              facultyId,
                              ...(universityEmail.trim()
                                ? { universityEmail: universityEmail.trim() }
                                : {}),
                              ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
                            }),
                            'Membership request submitted.',
                          ),
                        );
                      }}
                    >
                      <label className="field">
                        Your faculty
                        <select
                          required
                          value={facultyId}
                          onChange={(event) => setFacultyId(event.target.value)}
                        >
                          <option value="">Choose a faculty</option>
                          {faculties.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        University email
                        <input
                          type="email"
                          value={universityEmail}
                          onChange={(event) => setUniversityEmail(event.target.value)}
                          placeholder={university?.email_domains
                            .map((domain) => `you@${domain}`)
                            .join(' or ')}
                        />
                      </label>
                      <p className="account-fineprint">
                        A verified account email at this university can approve membership
                        immediately. A different campus email needs its own verification.
                      </p>
                      <label className="field">
                        Manual approval evidence
                        <textarea
                          rows={3}
                          minLength={10}
                          maxLength={2000}
                          value={evidence}
                          onChange={(event) => setEvidence(event.target.value)}
                          placeholder="No campus email? Explain how moderators can verify that you are a student. At least 10 characters."
                        />
                      </label>
                      <button
                        className="button primary account-full-button"
                        disabled={busy || !universityId || !facultyId}
                      >
                        {busy ? 'Submitting…' : 'Join this university'}
                        <ArrowRight size={15} />
                      </button>
                    </form>
                    {(selectedMembership?.verification_method === 'email' || developmentToken) && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            await board.auth.verifyMembership(universityId, token);
                            setDevelopmentToken('');
                            setToken('');
                            setMessage('University membership verified.');
                          });
                        }}
                      >
                        <label className="field">
                          Campus email verification token
                          <textarea
                            required
                            minLength={20}
                            maxLength={128}
                            rows={2}
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                          />
                        </label>
                        <button className="button primary account-full-button" disabled={busy}>
                          Verify university email
                          <Check size={15} />
                        </button>
                      </form>
                    )}
                  </>
                )
              )}
              <button
                className="account-manual"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await board.refresh();
                    setMessage('Membership status refreshed.');
                  })
                }
              >
                Refresh membership status
              </button>
            </>
          )}
          {view === 'profile' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await board.auth.saveProfile(draft);
                  onClose();
                });
              }}
            >
              <label className="field">
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="field">
                Account email
                <input value={draft.email} readOnly />
              </label>
              <label className="field">
                Study program
                <input
                  maxLength={150}
                  value={draft.program}
                  onChange={(event) => setDraft({ ...draft, program: event.target.value })}
                />
              </label>
              <label className="field">
                Study year
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.year}
                  onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                />
              </label>
              <label className="field">
                Short bio
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={draft.bio}
                  onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                />
              </label>
              <label className="field">
                Profile photo URL
                <input
                  type="url"
                  pattern="https://.*"
                  value={draft.avatar}
                  placeholder="https://…"
                  onChange={(event) => setDraft({ ...draft, avatar: event.target.value })}
                />
              </label>
              <div className="account-form-footer">
                <button
                  type="button"
                  className="account-signout"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await board.signOut();
                      onClose();
                    })
                  }
                >
                  <LogOut size={14} />
                  Sign out
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save profile'}
                  <Check size={15} />
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
