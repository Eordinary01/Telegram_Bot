import React, { useState } from 'react';
import { api } from '../lib/api';

interface TelegramModalProps {
  onClose: () => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({ onClose }) => {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateCode = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api<{ code: string }>('/telegram/link', { method: 'POST' });
      setCode(data.code);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/start ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
      const el = document.querySelector('.code-box');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.41-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"
                fill="var(--primary)"
              />
            </svg>
            Connect Telegram
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="modal-description">
          Receive instant high-priority email alerts directly in Telegram for Placement & Exam
          notices.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div className="code-box" onClick={handleCopyCode} title="Click to copy">
              {code}
            </div>
            <p className="code-box-hint">
              {copied ? '✅ Copied to clipboard!' : 'Click the code to copy'}
            </p>

            <div className="steps-list">
              <div className="step-item">
                <span className="step-number">1</span>
                <span className="step-text">
                  Open <strong>Telegram</strong> and search for <strong>JECRC Mail Bot</strong>
                </span>
              </div>
              <div className="step-item">
                <span className="step-number">2</span>
                <span className="step-text">
                  Send the command: <code>/start {code}</code>
                </span>
              </div>
              <div className="step-item">
                <span className="step-number">3</span>
                <span className="step-text">
                  Your account will be <strong>linked instantly</strong> — you'll start receiving alerts!
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={onClose}
          style={{ justifyContent: 'center' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
