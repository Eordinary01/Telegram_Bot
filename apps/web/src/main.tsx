import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

import './styles.css';
import { EmailCard, type EmailData } from './components/EmailCard';
import { TelegramModal } from './components/TelegramModal';
import { RulesPanel } from './components/RulesPanel';
import { ThemePicker, initializeTheme } from './components/ThemePicker';
import { api, getToken, setToken, clearToken, streamUrl, API_URL } from './lib/api';

// Initialize theme from localStorage on app boot
initializeTheme();

interface User {
  id: string;
  email: string;
  name: string | null;
  hasGmailToken: boolean;
}

interface Stats {
  total: number;
  high: number;
  medium: number;
  low: number;
  unread: number;
  actionRequired: number;
  lastSyncAt: string | null;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    unread: 0,
    actionRequired: 0,
    lastSyncAt: null,
  });
  const [activeTab, setActiveTab] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ACTION_REQUIRED'>(
    'ALL',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [userRulesCount, setUserRulesCount] = useState(0);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);

  // On first load, capture the auth token from the OAuth redirect query
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      // Clean the token out of the URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = getToken();

    if (!token) {
      setAuthLoading(false);
      return;
    }

    api<User>('/auth/me')
      .then((data) => setUser(data))
      .catch(() => clearToken())
      .finally(() => setAuthLoading(false));
  }, []);

  // Fetch emails, stats, rules, and link status
  const fetchData = useCallback(() => {
    if (!user) return;

    // For ACTION_REQUIRED tab, use the dedicated endpoint
    const fetchFn =
      activeTab === 'ACTION_REQUIRED'
        ? api<{ emails: EmailData[] }>('/emails/action-required')
        : api<{ emails: EmailData[] }>(
            `/emails?priority=${activeTab}&search=${encodeURIComponent(searchTerm)}`,
          );

    fetchFn
      .then((data) => setEmails(data.emails || []))
      .catch((err) => console.error('Failed to fetch emails:', err));

    api<Stats>('/emails/stats')
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to fetch stats:', err));

    api<{ linked: boolean }>('/telegram/link')
      .then((data) => setTelegramLinked(!!data.linked))
      .catch(() => setTelegramLinked(false));

    api<{ userKeywords: unknown[]; userSenders: unknown[] }>('/rules')
      .then((data) => {
        const count = (data.userKeywords?.length || 0) + (data.userSenders?.length || 0);
        setUserRulesCount(count);
      })
      .catch(() => {});
  }, [user, activeTab, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time SSE event listener
  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource(streamUrl('/emails/stream'));

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'email_received' || event.type === 'sync_completed') {
          fetchData();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [user, fetchData]);

  const handleInjectTest = async (type: string = 'placement') => {
    if (!user) return;
    try {
      await api('/emails/inject-test', { method: 'POST', body: { type } });
      fetchData();
    } catch (err) {
      console.error('Failed to inject test email:', err);
    }
  };

  const handleClearTestEmails = async () => {
    if (!user) return;
    try {
      await api('/emails/clear-test?all=true', { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to clear test emails:', err);
    }
  };

  const handleSyncNow = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await api('/sync', { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  // Onboarding Step Calculations
  const isStep1Done = telegramLinked;
  const isStep2Done = userRulesCount >= 3;
  const completedStepsCount = (isStep1Done ? 1 : 0) + (isStep2Done ? 1 : 0);

  // Loading screen
  if (authLoading) {
    return (
      <div className="app-shell loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p className="loading-text">Initializing priority sync...</p>
        </div>
      </div>
    );
  }

  // Login page
  if (!user) {
    return (
      <main className="login-page">
        <section className="glass-card login-card">
          <div className="login-brand-icon">📧</div>
          <h1 className="login-title">JECRC Mail Priority Sync</h1>
          <p className="login-subtitle">
            Smart email priority scoring & real-time Telegram alerts for Placement, Exams, and NPTEL notices.
          </p>

          <div className="features-grid">
            <div className="feature-item">
              <span className="feature-icon">🔒</span>
              <span className="feature-text">
                Only <code>@jecrcu.edu.in</code> Google accounts permitted
              </span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">✈️</span>
              <span className="feature-text">
                Instant Telegram alerts for high-priority mail
              </span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🌐</span>
              <span className="feature-text">
                Scores all sources (NPTEL, Deloitte, Faculty & more)
              </span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">➕</span>
              <span className="feature-text">
                Custom priority keywords & sender rules
              </span>
            </div>
          </div>

          <a
            href={`${API_URL}/auth/google`}
            className="btn btn-primary google-btn"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Connect @jecrcu.edu.in Account
          </a>
        </section>
      </main>
    );
  }

  // Dashboard view
  const tabLabels: Record<typeof activeTab, string> = {
    ALL: 'All',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    ACTION_REQUIRED: `⚠️ Action (${stats.actionRequired})`,
  };

  return (
    <div className="app-shell">
      {/* Sticky Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">📬</div>
          <div>
            <h1 className="brand-title">JECRC Mail Sync</h1>
            <span className="brand-subtitle">Priority Notification Dashboard</span>
          </div>
        </div>

        <div className="header-actions">
          <div className="user-badge">
            <span className="status-dot" />
            <span>{user.email}</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRulesPanel(true)}
          >
            🎯 Rules ({userRulesCount})
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className={`icon-btn ${showThemePicker ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowThemePicker(!showThemePicker);
              }}
              title="Theme settings"
            >
              ⚙️
            </button>
            <ThemePicker
              isOpen={showThemePicker}
              onClose={() => setShowThemePicker(false)}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* 2-Step Setup Onboarding Banner */}
      <div className="onboarding-banner">
        <div className="onboarding-header">
          <div className="onboarding-title">
            <span>🚀 Account Setup Checklist</span>
            <span className="onboarding-badge">
              {completedStepsCount === 2 ? '🎉 Setup Completed (2/2)' : `${completedStepsCount}/2 Steps Completed`}
            </span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
            Complete these 2 steps after connecting Gmail to start receiving smart Telegram alerts.
          </span>
        </div>

        <div className="onboarding-steps-grid">
          {/* Step 1: Connect Telegram */}
          <div className={`onboarding-step-card ${isStep1Done ? 'completed' : ''}`}>
            <div className="step-info">
              <div className={`step-check-icon ${isStep1Done ? 'done' : 'pending'}`}>
                {isStep1Done ? '✓' : '1'}
              </div>
              <div>
                <div className="step-title">Step 1: Connect Telegram</div>
                <div className="step-desc">
                  {isStep1Done ? 'Telegram bot linked successfully' : 'Link Telegram bot for instant alerts & reminders'}
                </div>
              </div>
            </div>
            <button
              className={`btn ${isStep1Done ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => setShowTelegramModal(true)}
            >
              {isStep1Done ? '⚙️ Settings' : '✈️ Link Telegram'}
            </button>
          </div>

          {/* Step 2: Create 3 Custom Rules */}
          <div className={`onboarding-step-card ${isStep2Done ? 'completed' : ''}`}>
            <div className="step-info">
              <div className={`step-check-icon ${isStep2Done ? 'done' : 'pending'}`}>
                {isStep2Done ? '✓' : '2'}
              </div>
              <div>
                <div className="step-title">Step 2: Create 3 Priority Rules</div>
                <div className="step-desc">
                  {isStep2Done
                    ? `${userRulesCount} custom rules active`
                    : `Create 3 rules (e.g. NPTEL, Placement) — ${userRulesCount}/3 created`}
                </div>
              </div>
            </div>
            <button
              className={`btn ${isStep2Done ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => setShowRulesPanel(true)}
            >
              {isStep2Done ? '🎯 Manage Rules' : '+ Add Rules'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <section className="stats-grid">
        <div className="glass-card stat-card">
          <span className="stat-title">Total Filtered</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: 'var(--primary)' }}>
              {stats.total}
            </span>
            <span className="stat-icon">📨</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">High Priority</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: '#fca5a5' }}>
              {stats.high}
            </span>
            <span className="stat-icon">🔥</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">Medium Priority</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: '#fcd34d' }}>
              {stats.medium}
            </span>
            <span className="stat-icon">⚡</span>
          </div>
        </div>

        <div
          className={`glass-card stat-card ${stats.actionRequired > 0 ? 'action-required-stat-card' : ''}`}
        >
          <span className="stat-title">Action Required</span>
          <div className="stat-value-group">
            <span
              className="stat-value"
              style={{ color: stats.actionRequired > 0 ? '#f97316' : '#4ade80' }}
            >
              {stats.actionRequired}
            </span>
            <span className="stat-icon">⚠️</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">Telegram Status</span>
          <div className="stat-value-group">
            <span
              className="stat-value"
              style={{ fontSize: '1.15rem', color: telegramLinked ? '#4ade80' : '#fb7185' }}
            >
              {telegramLinked ? 'Linked' : 'Not Linked'}
            </span>
            <span className="stat-icon">✈️</span>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search placement, exams, NPTEL, faculty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW', 'ACTION_REQUIRED'] as const).map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''} ${tab === 'ACTION_REQUIRED' && stats.actionRequired > 0 ? 'action-required-tab' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        <div className="action-btns">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowTelegramModal(true)}>
            ✈️ {telegramLinked ? 'Telegram' : 'Link Telegram'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing...' : '🔄 Sync Now'}
          </button>
          <button
            className="dev-tools-toggle"
            onClick={() => setShowDevTools(!showDevTools)}
          >
            🧪 Dev {showDevTools ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Dev Tools (collapsible) */}
      {showDevTools && (
        <div className="dev-tools-panel" style={{ marginBottom: '1.25rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleInjectTest('placement')}
          >
            + Placement Email
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleInjectTest('exam')}
          >
            + Exam Email
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleClearTestEmails}
          >
            🗑️ Clear Test Emails
          </button>
        </div>
      )}

      {/* Feed Header */}
      <div className="feed-header">
        <h2 className="feed-title">
          Inbox
          <span className="feed-count">{emails.length}</span>
        </h2>
      </div>

      {/* Email Feed */}
      <section className="feed-container">
        {emails.length > 0 ? (
          emails.map((email, index) => (
            <div
              key={email.id}
              className="email-card-enter"
              style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
            >
              <EmailCard email={email} onAcknowledge={() => fetchData()} />
            </div>
          ))
        ) : (
          <div className="glass-card empty-state">
            <div className="empty-icon">📭</div>
            <h3 className="empty-title">No emails found</h3>
            <p className="empty-description">
              {searchTerm
                ? 'No emails match your search filter. Try adjusting your keywords.'
                : 'Click "Sync Now" to fetch recent messages from your connected @jecrcu.edu.in account.'}
            </p>
            {!searchTerm && (
              <button className="btn btn-primary" onClick={handleSyncNow} disabled={syncing}>
                {syncing ? 'Syncing...' : '🔄 Sync Now'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Telegram Link Modal */}
      {showTelegramModal && <TelegramModal onClose={() => setShowTelegramModal(false)} />}

      {/* Priority Rules Modal */}
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
          onRescanDone={() => fetchData()}
          onRulesUpdated={(count) => setUserRulesCount(count)}
        />
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
