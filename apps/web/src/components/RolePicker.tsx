import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_URL } from './lib/api';

/**
 * Onboarding Role Picker
 *
 * Shown to new users (and existing users with no role set) after OAuth.
 * Presents role cards: Student / Teacher / Businessman / Freelancer / Developer / Other.
 * On selection, calls PATCH /users/me/role to persist role + seed preset rules.
 * On success, redirects to /dashboard.
 *
 * Token is passed via query param and stored in localStorage by the Dashboard
 * on load — this page doesn't need to do anything with it except pass it through
 * on redirect.
 */

const ROLES = [
  {
    key: 'student',
    label: 'Student',
    icon: '🎓',
    description: 'Placement drives, exam schedules, fee deadlines, scholarship alerts.',
    color: '#3b82f6',
  },
  {
    key: 'teacher',
    label: 'Teacher / Faculty',
    icon: '👨‍🏫',
    description: 'Meeting invites, timetable changes, exam duty rosters, circulars, research.',
    color: '#8b5cf6',
  },
  {
    key: 'businessman',
    label: 'Business / Professional',
    icon: '💼',
    description: 'Client proposals, invoices, contracts, partnership offers, market updates.',
    color: '#f59e0b',
  },
  {
    key: 'freelancer',
    label: 'Freelancer / Gig Worker',
    icon: '💻',
    description: 'Client briefs, project deadlines, invoice reminders, platform updates.',
    color: '#06b6d4',
  },
  {
    key: 'developer',
    label: 'Developer / Engineer',
    icon: '⚙️',
    description: 'Deployment alerts, code reviews, incidents, security advisories, PRs.',
    color: '#22c55e',
  },
  {
    key: 'other',
    label: 'Other',
    icon: '📌',
    description: 'Start with a minimal rule set and build your own custom priorities.',
    color: '#64748b',
  },
];

export function RolePicker() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? null;
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const handleSelect = (roleKey: string) => {
    setSelectedRole(roleKey);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedRole || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/users/me/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        role: string;
        preset: { label: string; description: string };
        seedResult: { senderCount: number; keywordCount: number };
      };

      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  // Auto-submit on mount if a role was preselected (e.g. from deep link / query param)
  useEffect(() => {
    // Not auto-submitting — user must click a card and confirm.
    // This keeps the experience deliberate: pick a role, see what it does, confirm.
  }, []);

  // Redirect to dashboard after successful role set
  useEffect(() => {
    if (completed && token) {
      const timer = setTimeout(() => {
        window.location.href = `${API_URL}/dashboard?token=${encodeURIComponent(token)}`;
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [completed, token]);

  return (
    <div className="onboarding-shell">
      {/* Header */}
      <header className="onboarding-header">
        <div className="onboarding-brand">
          <span className="onboarding-icon">📬</span>
          <div className="onboarding-title-group">
            <h1 className="onboarding-title">PriorityPush</h1>
            <p className="onboarding-subtitle">Set up your priority profile</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="onboarding-body">
        {/* Intro */}
        <section className="onboarding-intro">
          <h2 className="onboarding-heading">Who are you?</h2>
          <p className="onboarding-text">
            We'll tailor your priority rules based on your role. You can always change these
            later from the Rules panel in your dashboard.
          </p>
        </section>

        {/* Error */}
        {error && (
          <div className="onboarding-alert onboarding-alert-error">
            <span>⚠️</span>
            <span>{error}</span>
            <button className="onboarding-alert-close" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Role cards grid */}
        <section className="onboarding-cards">
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.key;
            return (
              <button
                key={role.key}
                className={`onboarding-card ${isSelected ? 'selected' : ''}`}
                style={isSelected ? { '--card-accent': role.color } as React.CSSProperties : undefined}
                onClick={() => handleSelect(role.key)}
                disabled={submitting}
              >
                <div className="card-icon" style={{ backgroundColor: `${role.color}18` }}>
                  <span style={{ color: role.color }}>{role.icon}</span>
                </div>
                <div className="card-content">
                  <h3 className="card-title">{role.label}</h3>
                  <p className="card-desc">{role.description}</p>
                </div>
                <div className={`card-check ${isSelected ? 'visible' : ''}`}>✓</div>
              </button>
            );
          })}
        </section>

        {/* Confirmation + submit */}
        {selectedRole && (
          <section className="onboarding-confirm">
            <div className="confirm-box">
              <div className="confirm-role-badge" style={{ '--badge-color': ROLES.find((r) => r.key === selectedRole)?.color ?? '#3b82f6' } as React.CSSProperties}>
                {ROLES.find((r) => r.key === selectedRole)?.icon}
                <span>{ROLES.find((r) => r.key === selectedRole)?.label}</span>
              </div>
              <p className="confirm-desc">
                {ROLES.find((r) => r.key === selectedRole)?.description}
              </p>
              <p className="confirm-rules-note">
                We'll automatically create priority rules for this role. You can edit or add more
                from your dashboard after setup.
              </p>
            </div>
            <button
              className="onboarding-submit-btn"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <span className="spinner" />
              ) : (
                <>Set Up {ROLES.find((r) => r.key === selectedRole)?.label} →</>
              )}
            </button>
          </section>
        )}

        {/* Completed state */}
        {completed && (
          <section className="onboarding-done">
            <div className="done-icon">✅</div>
            <h2 className="done-title">Profile set up!</h2>
            <p className="done-text">
              Redirecting you to your dashboard...
            </p>
          </section>
        )}

        {/* No-selection state: prompt */}
        {!selectedRole && !completed && (
          <section className="onboarding-prompt">
            <p className="prompt-text">Select a role above to continue.</p>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="onboarding-footer">
        <p>Your rules are private and stored per-account. Nothing is shared between users.</p>
      </footer>
    </div>
  );
}
