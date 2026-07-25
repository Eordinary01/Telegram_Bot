import React, { useState } from 'react';

interface TelegramModalProps {
  userId: string;
  apiUrl: string;
  onClose: () => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({ userId, apiUrl, onClose }) => {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateCode = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/telegram/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to generate code');
      }

      setCode(data.code);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Outfit', fontSize: '1.4rem' }}>✈️ Connect Telegram Bot</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Receive instant high-priority email alerts directly in Telegram for Placement & Exam notices.
        </p>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              color: '#fca5a5',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {!code ? (
          <button
            className="btn btn-primary"
            onClick={generateCode}
            disabled={loading}
            style={{ justifyContent: 'center', width: '100%', padding: '0.85rem' }}
          >
            {loading ? 'Generating Code...' : '🔑 Generate Linking Code'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="code-box">{code}</div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Next Steps:</p>
              <ol style={{ paddingLeft: '1.2rem', color: '#94a3b8' }}>
                <li>Open Telegram and search for <strong>JECRC Mail Bot</strong>.</li>
                <li>Send command: <code>/start {code}</code></li>
                <li>Your account will be linked instantly!</li>
              </ol>
            </div>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={onClose}
          style={{ justifyContent: 'center', marginTop: '0.5rem' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
