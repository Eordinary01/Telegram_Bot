import React, { useState } from 'react';
import { api } from '../lib/api';

export interface EmailData {
  id: string;
  messageId: string;
  from: string;
  subject: string;
  snippet?: string | null;
  receivedAt: string;
  isUnread: boolean;
  priorityScore: number;
  priorityLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityReasons?: string[];
  senderDomain?: string | null;
  notifiedAt?: string | null;
  acknowledgedAt?: string | null;
  reminderCount?: number;
  snoozedUntil?: string | null;
}

interface EmailCardProps {
  email: EmailData;
  onAcknowledge?: (id: string) => void;
}

function getSenderInitial(from: string): string {
  const name = from.split('<')[0]?.trim();
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function getSenderDisplayName(from: string): string {
  const parts = from.split('<');
  return parts[0]?.trim() || from;
}

export const EmailCard: React.FC<EmailCardProps> = ({ email, onAcknowledge }) => {
  const [expanded, setExpanded] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const formattedDate = new Date(email.receivedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const priorityClass =
    email.priorityLabel === 'HIGH'
      ? 'high-priority'
      : email.priorityLabel === 'MEDIUM'
        ? 'medium-priority'
        : 'low-priority';

  // Determine action-required state
  const isActionRequired =
    email.notifiedAt &&
    !email.acknowledgedAt &&
    (email.priorityLabel === 'HIGH' || email.priorityLabel === 'MEDIUM');

  const isAcknowledged = !!email.acknowledgedAt;
  const reminderCount = email.reminderCount ?? 0;
  const scorePercent = Math.min((email.priorityScore / 100) * 100, 100);

  const handleAcknowledge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAcknowledging(true);
    try {
      await api(`/emails/${email.id}/acknowledge`, { method: 'PATCH' });
      if (onAcknowledge) {
        onAcknowledge(email.id);
      }
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <div
      className={`glass-card email-card ${priorityClass} ${isActionRequired ? 'action-required-card' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="email-card-header">
        <div className="sender-info">
          <div className={`sender-avatar ${email.priorityLabel.toLowerCase()}`}>
            {getSenderInitial(email.from)}
          </div>
          <div>
            <div className="sender-name">{getSenderDisplayName(email.from)}</div>
            {email.senderDomain && (
              <div className="sender-domain">{email.senderDomain}</div>
            )}
          </div>
        </div>
        <div className="email-meta">
          {isActionRequired && <span className="action-required-badge">⚠️ ACTION</span>}
          {isAcknowledged && <span className="acknowledged-badge">✅ Done</span>}
          <span className="email-date">{formattedDate}</span>
        </div>
      </div>

      <h3 className="email-subject">{email.subject}</h3>

      {email.snippet && <p className="email-snippet">{email.snippet}</p>}

      {/* Score Bar */}
      <div className="score-bar-wrap">
        <div className="score-bar-track">
          <div
            className={`score-bar-fill ${email.priorityLabel.toLowerCase()}`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <span className="score-label">{email.priorityScore} pts</span>
      </div>

      <div className="badge-row" style={{ marginTop: '0.65rem' }}>
        <span className={`priority-badge ${email.priorityLabel.toLowerCase()}`}>
          {email.priorityLabel}
        </span>

        {reminderCount > 0 && (
          <span className="reminder-indicator">
            🔔 {reminderCount} reminder{reminderCount > 1 ? 's' : ''}
          </span>
        )}

        {email.snoozedUntil && new Date(email.snoozedUntil) > new Date() && (
          <span className="snooze-indicator">⏰ Snoozed</span>
        )}

        {email.priorityReasons?.map((reason, idx) => (
          <span key={idx} className="reason-tag">
            {reason}
          </span>
        ))}
      </div>

      {/* Action buttons for action-required emails */}
      {isActionRequired && (
        <div className="email-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-acknowledge"
            onClick={handleAcknowledge}
            disabled={acknowledging}
          >
            {acknowledging ? 'Acknowledging...' : '✅ Acknowledge'}
          </button>
        </div>
      )}

      {expanded && (
        <div className="score-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="score-details-title">Priority Breakdown</div>
          <div className="reason-list">
            <div className="reason-item">
              <span>🎯 Score:</span>
              <strong style={{ color: '#fff' }}>{email.priorityScore} points</strong>
            </div>
            {email.priorityReasons && email.priorityReasons.length > 0 ? (
              email.priorityReasons.map((r, i) => (
                <div key={i} className="reason-item">
                  <span>⚡ Match:</span>
                  <span>{r}</span>
                </div>
              ))
            ) : (
              <div className="reason-item">
                <span>ℹ️ Standard domain filter match without keyword modifiers</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
