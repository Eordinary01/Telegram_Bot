import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: string;
  createdAt: string;
}

interface WaitlistPanelProps {
  onClose: () => void;
}

export function WaitlistPanel({ onClose }: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('PriorityPush is live for JECRC students! Login now →');
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ entries: WaitlistEntry[]; total: number }>('/waitlist/all')
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load waitlist');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSendFollowup = async () => {
    if (!subject.trim()) return;
    setSending(true);
    setResult(null);
    setError('');

    try {
      const data = await api<{ sent: number; failed: number; total: number; errors?: string[] }>(
        '/waitlist/send-followup',
        { method: 'POST', body: { subject } },
      );
      setResult(data);
      if (data.errors && data.errors.length > 0) {
        setError(`Some emails failed: ${data.errors.slice(0, 3).join('; ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card modal-content waitlist-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📬 Waitlist Management</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="waitlist-body">
          {loading ? (
            <div className="waitlist-loading">
              <div className="spinner" />
              <p>Loading waitlist...</p>
            </div>
          ) : error && entries.length === 0 ? (
            <div className="waitlist-error">
              <p>❌ {error}</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-tertiary)' }}>
                Make sure you are logged in as admin.
              </p>
            </div>
          ) : (
            <>
              <div className="waitlist-stats">
                <div className="waitlist-stat">
                  <span className="waitlist-stat-value">{entries.length}</span>
                  <span className="waitlist-stat-label">Total Signups</span>
                </div>
              </div>

              <div className="waitlist-entries">
                {entries.length === 0 ? (
                  <p className="waitlist-empty">No waitlist entries yet. Share the landing page to get signups!</p>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="waitlist-entry">
                      <div className="waitlist-entry-info">
                        <span className="waitlist-entry-name">{entry.name || 'Anonymous'}</span>
                        <span className="waitlist-entry-email">{entry.email}</span>
                      </div>
                      <span className="waitlist-entry-date">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {entries.length > 0 && (
                <div className="waitlist-send-section">
                  <h3>✉️ Send Follow-up Email</h3>
                  <p className="waitlist-send-hint">
                    This will send a branded email to all {entries.length} waitlist members inviting them to login.
                  </p>
                  <input
                    type="text"
                    className="waitlist-subject-input"
                    placeholder="Email subject..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sending}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSendFollowup}
                    disabled={sending || !subject.trim()}
                    style={{ width: '100%', marginTop: '0.5rem' }}
                  >
                    {sending ? (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <span className="btn-spinner" /> Sending to {entries.length} users...
                      </span>
                    ) : (
                      `Send to ${entries.length} users`
                    )}
                  </button>

                  {result && (
                    <div className="waitlist-result">
                      ✅ Sent: {result.sent} | ❌ Failed: {result.failed} | Total: {result.total}
                    </div>
                  )}
                  {error && <div className="waitlist-result waitlist-result-error">❌ {error}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
