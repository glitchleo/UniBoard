import { useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';

export function ReportDialog({
  title,
  onClose,
  onSubmit,
  apiMode = false,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean> | boolean;
  apiMode?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="report-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          setBusy(true);
          try {
            await onSubmit(
              `${data.get('reason')}${String(data.get('details')).trim() ? `: ${data.get('details')}` : ''}`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="report-dialog-heading">
          <span>
            <Flag size={21} />
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close report dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <h2>Help keep campus welcoming.</h2>
        <p>
          Report “{title}”.{' '}
          {apiMode
            ? 'Your report will be sent to your university moderators.'
            : 'Your report is saved in this browser for the moderation demo.'}
        </p>
        <label className="field">
          Reason
          <select name="reason" required>
            <option value="">Choose a reason</option>
            <option>Spam or misleading content</option>
            <option>Harassment or harmful content</option>
            <option>Personal information</option>
            <option>Irrelevant to campus</option>
            <option>Something else</option>
          </select>
        </label>
        <label className="field">
          Additional details <span className="muted">(optional)</span>
          <textarea
            name="details"
            maxLength={1000}
            rows={3}
            placeholder="A little context can help…"
          />
        </label>
        <div className="report-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Submitting…' : apiMode ? 'Submit report' : 'Save report'}
            <Flag size={14} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
