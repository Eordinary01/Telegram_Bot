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
  const [subject, setSubject] = useState('PriorityPush is live! Login now →');
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ entries: WaitlistEntry[]; total: number }>('/waitlist/all')
      .then((data) => setEntries(data.entries))
      .catch(() => setError('Failed to load waitlist'))
      .finally(() => setLoading(false));
  }, []);

  const handleSendFollowup = async () => {
    if (!subject.trim()) return;
    setSending(true);
    setResult(null);
    setError('');

    try {
      const data = await api<{ sent: number; failed: number; total: number }>(
        '/waitlist/send-followup',
        { method: 'POST', body: { subject } },
      );
      setResult(data);
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
            <div className="waitlist-error">{error}</div>
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
                  <p className="waitlist-empty">No waitlist entries yet.</p>
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
                  <h3>Send Follow-up Email</h3>
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
                  >
                    {sending ? 'Sending...' : `Send to ${entries.length} users`}
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
