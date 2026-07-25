import React, { useState } from 'react';

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
}

interface EmailCardProps {
  email: EmailData;
}

export const EmailCard: React.FC<EmailCardProps> = ({ email }) => {
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div className={`glass-card email-card ${priorityClass}`} onClick={() => setExpanded(!expanded)}>
      <div className="email-card-header">
        <div>
          <span className="sender-name">{email.from}</span>
          {email.senderDomain && (
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>
              ({email.senderDomain})
            </span>
          )}
        </div>
        <span className="email-date">{formattedDate}</span>
      </div>

      <h3 className="email-subject">{email.subject}</h3>

      {email.snippet && <p className="email-snippet">{email.snippet}</p>}

      <div className="badge-row">
        <span className={`priority-badge ${email.priorityLabel.toLowerCase()}`}>
          {email.priorityLabel} • {email.priorityScore} PTS
        </span>

        {email.priorityReasons?.map((reason, idx) => (
          <span key={idx} className="reason-tag">
            {reason}
          </span>
        ))}
      </div>

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
