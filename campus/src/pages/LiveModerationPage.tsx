import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Flag,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import { apiList, apiRequest, type ApiMembership, type ApiReport } from '../lib/api';
import { PageHeading } from './CommunityPages';

export interface LiveModerationPageProps {
  universityId: string | null;
  role: string | null;
  onOpen: (id: string) => void;
  onNotify: (message: string) => void;
  onRefresh: () => Promise<void>;
}

interface MembershipRequest extends ApiMembership {
  name: string;
  email: string;
  evidence: string | null;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string;
  target_id: string;
  reason: string;
  created_at: string;
}

interface ReviewReport extends ApiReport {
  reported_post_title?: string | null;
  reported_comment_body?: string | null;
  reported_user_name?: string | null;
  reported_user_email?: string | null;
  related_post_id?: string | null;
}

const readableError = (error: unknown) =>
  error instanceof Error ? error.message : 'This action could not be completed. Please try again.';
const formattedDate = (date: string) =>
  new Date(date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function LiveModerationPage({
  universityId,
  role,
  onOpen,
  onNotify,
  onRefresh,
}: LiveModerationPageProps) {
  const permitted = role === 'moderator' || role === 'admin';
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [memberships, setMemberships] = useState<MembershipRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  const scope = universityId ? `/universities/${encodeURIComponent(universityId)}/moderation` : '';
  const currentScope = useRef(scope);
  currentScope.current = scope;

  const load = useCallback(async () => {
    if (!universityId || !permitted || scope !== currentScope.current) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const [nextReports, nextMemberships, nextAudit] = await Promise.all([
        apiList<ReviewReport>(`${scope}/reports?status=pending`),
        apiList<MembershipRequest>(`${scope}/memberships`),
        apiRequest<AuditEntry[]>(`${scope}/audit?limit=30&page=1`),
      ]);
      if (version !== loadVersion.current || scope !== currentScope.current) return;
      setReports(nextReports);
      setMemberships(nextMemberships);
      setAudit(nextAudit.data);
    } catch (failure) {
      if (version === loadVersion.current) setError(readableError(failure));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [universityId, permitted, scope]);

  useEffect(() => {
    setReports([]);
    setMemberships([]);
    setAudit([]);
    setReasons({});
    setHandled({});
    setBusy(null);
    setError('');
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);

  const reasonFor = (key: string) => (reasons[key] ?? '').trim();
  const canAct = (key: string) => !busy && reasonFor(key).length >= 5;

  async function act(
    key: string,
    path: string,
    body: Record<string, unknown>,
    message: string,
    options: { method?: string; keepReason?: boolean; handledMessage?: string } = {},
  ) {
    const reason = reasonFor(key);
    if (busy) return;
    if (reason.length < 5) {
      setError('Write a decision or reason of at least 5 characters before taking action.');
      return;
    }
    setBusy(key);
    setError('');
    const actionScope = scope;
    try {
      await apiRequest(`${scope}${path}`, {
        method: options.method ?? 'PATCH',
        body: { ...body, ...(path.startsWith('/reports/') ? { decision: reason } : { reason }) },
      });
      if (actionScope !== currentScope.current) return;
      if (!options.keepReason)
        setReasons((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      if (options.handledMessage)
        setHandled((current) => ({ ...current, [key]: options.handledMessage! }));
      onNotify(message);
      await Promise.all([load(), onRefresh()]);
    } catch (failure) {
      if (actionScope === currentScope.current) setError(readableError(failure));
    } finally {
      if (actionScope === currentScope.current) setBusy(null);
    }
  }

  const heading = (
    <PageHeading
      eyebrow="COMMUNITY CARE"
      title="Moderation"
      description="Review campus reports, verify memberships, and keep a record of your decisions."
    />
  );

  if (!universityId || !permitted)
    return (
      <>
        {heading}
        <div className="inline-note">
          <ShieldCheck size={20} />
          <p>
            {!universityId
              ? 'Select a university with approved membership to view its moderation tools.'
              : 'These tools are available to approved university moderators and administrators. Your current campus role does not include moderation access.'}
          </p>
        </div>
      </>
    );

  const reasonField = (key: string, label: string) => (
    <label className="field" htmlFor={`reason-${key}`} style={{ marginTop: 14 }}>
      {label}
      <textarea
        id={`reason-${key}`}
        value={reasons[key] ?? ''}
        onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))}
        minLength={5}
        maxLength={2000}
        required
        rows={3}
        disabled={!!busy}
        placeholder="Explain your decision in your own words. This is recorded in the audit log."
      />
      <small>At least 5 characters. The affected student receives this explanation.</small>
    </label>
  );

  return (
    <div aria-busy={loading || !!busy}>
      {heading}
      <div className="inline-note">
        <ShieldCheck size={20} />
        <p>
          Decisions apply to this university. Removing content or suspending a member records a
          separate action; resolve the report after completing your review.
        </p>
      </div>
      <div className="section-topline">
        <span>
          {reports.length} pending reports · {memberships.length} pending memberships
        </span>
        <button type="button" disabled={loading || !!busy} onClick={() => void load()}>
          <RefreshCw size={14} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <div className="inline-note" role="alert">
          <Flag size={18} />
          <p>{error}</p>
        </div>
      )}
      {loading && !reports.length && !memberships.length && (
        <p className="section-caption" role="status">
          Loading moderation queues…
        </p>
      )}

      <h2 className="section-heading">
        <Flag size={18} />
        Pending reports
      </h2>
      {reports.map((report) => {
        const key = `report-${report.id}`;
        const targetType = report.post_id ? 'Post' : report.comment_id ? 'Comment' : 'Member';
        const targetId = report.post_id ?? report.comment_id ?? report.user_id;
        const reviewPostId = report.related_post_id ?? report.post_id;
        const submit = (event: FormEvent) => {
          event.preventDefault();
          void act(key, `/reports/${report.id}`, { status: 'resolved' }, 'Report resolved.');
        };
        return (
          <article className="report-item" key={report.id}>
            <div className="report-title">
              <Flag size={16} />
              <strong>Reported {targetType.toLowerCase()}</strong>
              <span className="type-pill opportunity">Pending</span>
            </div>
            <p>{report.reason}</p>
            {report.reported_post_title && (
              <p>
                <strong>Post:</strong> {report.reported_post_title}
              </p>
            )}
            {report.reported_comment_body && (
              <p>
                <strong>Reported comment:</strong> {report.reported_comment_body}
              </p>
            )}
            {report.reported_user_name && (
              <p>
                <strong>Member:</strong> {report.reported_user_name}
                {report.reported_user_email && <> · {report.reported_user_email}</>}
              </p>
            )}
            <p>
              <strong>{targetType} ID:</strong>{' '}
              <code style={{ overflowWrap: 'anywhere' }}>{targetId}</code>
            </p>
            <small>Reported {formattedDate(report.created_at)}</small>
            {handled[key] && (
              <p role="status">
                {handled[key]} Record a report decision when your review is complete.
              </p>
            )}
            <form onSubmit={submit}>
              {reasonField(key, 'Review decision / action reason')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {reviewPostId && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!!busy}
                    onClick={() => onOpen(reviewPostId)}
                  >
                    Review post
                    <ArrowUpRight size={13} />
                  </button>
                )}
                <button className="button primary" type="submit" disabled={!canAct(key)}>
                  <Check size={14} />
                  {busy === key ? 'Saving…' : 'Resolve report'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!canAct(key)}
                  onClick={() =>
                    void act(
                      key,
                      `/reports/${report.id}`,
                      { status: 'dismissed' },
                      'Report dismissed.',
                    )
                  }
                >
                  <X size={14} />
                  Dismiss
                </button>
                {(report.post_id || report.comment_id) && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!canAct(key) || !!handled[key]}
                    onClick={() =>
                      void act(
                        key,
                        '/content',
                        report.post_id
                          ? { postId: report.post_id }
                          : { commentId: report.comment_id },
                        'Reported content removed.',
                        { method: 'POST', keepReason: true, handledMessage: 'Content removed.' },
                      )
                    }
                  >
                    <Trash2 size={14} />
                    Remove {targetType.toLowerCase()}
                  </button>
                )}
                {report.user_id && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!canAct(key) || !!handled[key]}
                    onClick={() =>
                      void act(
                        key,
                        `/suspensions/${report.user_id}`,
                        {},
                        'University membership suspended.',
                        {
                          method: 'POST',
                          keepReason: true,
                          handledMessage: 'University access suspended.',
                        },
                      )
                    }
                  >
                    <UserRoundX size={14} />
                    Suspend member
                  </button>
                )}
              </div>
            </form>
          </article>
        );
      })}
      {!loading && !error && !reports.length && (
        <div className="empty-state">
          <ShieldCheck size={28} />
          <h2>No pending reports.</h2>
          <p>New reports from this campus appear here.</p>
        </div>
      )}

      <h2 className="section-heading">
        <Users size={18} />
        Membership requests
      </h2>
      {memberships.map((member) => {
        const key = `member-${member.user_id}`;
        return (
          <article className="report-item" key={member.user_id}>
            <div className="report-title">
              <Users size={16} />
              <strong>{member.name}</strong>
              <span className="type-pill study-group">
                {member.verification_method === 'email' ? 'Email verification' : 'Manual review'}
              </span>
            </div>
            <p>
              {member.email}
              {member.university_email && member.university_email !== member.email && (
                <> · Campus email: {member.university_email}</>
              )}
            </p>
            <p>
              {member.evidence ??
                'A university email was provided. Check the request before making a manual decision.'}
            </p>
            <small>Requested {formattedDate(member.created_at)}</small>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  key,
                  `/memberships/${member.user_id}`,
                  { status: 'approved' },
                  'Membership approved.',
                );
              }}
            >
              {reasonField(key, 'Membership decision reason')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <button type="submit" className="button primary" disabled={!canAct(key)}>
                  <Check size={14} />
                  {busy === key ? 'Saving…' : 'Approve membership'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!canAct(key)}
                  onClick={() =>
                    void act(
                      key,
                      `/memberships/${member.user_id}`,
                      { status: 'rejected' },
                      'Membership request rejected.',
                    )
                  }
                >
                  <X size={14} />
                  Reject request
                </button>
              </div>
            </form>
          </article>
        );
      })}
      {!loading && !error && !memberships.length && (
        <div className="empty-state">
          <Users size={28} />
          <h2>No memberships waiting.</h2>
          <p>New verification requests appear in this queue.</p>
        </div>
      )}

      <h2 className="section-heading">
        <ShieldCheck size={18} />
        Recent audit history
      </h2>
      <p className="section-caption">LATEST 30 CAMPUS ACTIONS</p>
      {audit.map((entry) => (
        <article className="report-item" key={entry.id}>
          <div className="report-title">
            <ShieldCheck size={15} />
            <strong>{entry.action.replaceAll('_', ' ')}</strong>
          </div>
          <p>{entry.reason}</p>
          <p>
            <strong>Target:</strong>{' '}
            <code style={{ overflowWrap: 'anywhere' }}>{entry.target_id}</code>
            <br />
            <strong>Moderator:</strong>{' '}
            <code style={{ overflowWrap: 'anywhere' }}>{entry.actor_id}</code>
          </p>
          <small>{formattedDate(entry.created_at)}</small>
        </article>
      ))}
      {!loading && !error && !audit.length && (
        <p className="inline-note">Moderation decisions will be recorded here.</p>
      )}
    </div>
  );
}
