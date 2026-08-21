import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import './styles.css';
import { EmailCard, type EmailData } from './components/EmailCard';
import { TelegramModal } from './components/TelegramModal';
import { RulesPanel } from './components/RulesPanel';
import { ThemePicker, initializeTheme } from './components/ThemePicker';
import { ServerWakeupCard } from './components/ServerWakeupCard';
import { LandingPage } from './components/LandingPage';
import { WaitlistPanel } from './components/WaitlistPanel';
import { RolePicker } from './components/RolePicker';
import { api, getToken, setToken, clearToken, streamUrl, API_URL } from './lib/api';

// Initialize theme from localStorage on app boot
initializeTheme();

const PAGE_SIZE = 20;

interface User {
  id: string;
  email: string;
  name: string | null;
  hasGmailToken: boolean;
  role: string | null;
  isAdmin: boolean;
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

function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isServerSleeping, setIsServerSleeping] = useState(false);
  const [manualWakeupPreview, setManualWakeupPreview] = useState(false);
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
  const [showWaitlistPanel, setShowWaitlistPanel] = useState(false);
  const [cameWithToken, setCameWithToken] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalEmails, setTotalEmails] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const checkUserAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    try {
      const data = await api<User>('/auth/me');
      setUser(data);
      setIsServerSleeping(false);
      setCameWithToken(false);
    } catch (err) {
      // If we came from OAuth redirect, don't clear token — server may be waking up
      if (!cameWithToken) {
        clearToken();
      }
    } finally {
      setAuthLoading(false);
    }
  }, [cameWithToken]);

  // On first load, capture the auth token from the OAuth redirect query and check health/auth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setCameWithToken(true);
      // Clean the token out of the URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Set a timer: if auth takes > 1.2s, backend is likely sleeping on Render free tier
    const sleepTimer = setTimeout(() => {
      setIsServerSleeping(true);
    }, 1200);

    checkUserAuth().finally(() => {
      clearTimeout(sleepTimer);
    });
  }, [checkUserAuth]);

  // Fetch first page of emails (resets pagination)
  const fetchData = useCallback(() => {
    if (!user) return;

    setOffset(0);
    setHasMore(true);

    if (activeTab === 'ACTION_REQUIRED') {
      api<{ emails: EmailData[] }>('/emails/action-required')
        .then((data) => {
          setEmails(data.emails || []);
          setTotalEmails(data.emails?.length || 0);
          setHasMore(false);
        })
        .catch((err) => console.error('Failed to fetch emails:', err));
    } else {
      api<{ emails: EmailData[]; total: number }>(
        `/emails?priority=${activeTab}&search=${encodeURIComponent(searchTerm)}&limit=${PAGE_SIZE}&offset=0`,
      )
        .then((data) => {
          setEmails(data.emails || []);
          setTotalEmails(data.total || 0);
          setHasMore((data.emails?.length || 0) < (data.total || 0));
          setOffset(data.emails?.length || 0);
        })
        .catch((err) => console.error('Failed to fetch emails:', err));
    }

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

  // Load next page of emails (appends to existing list)
  const loadMore = useCallback(async () => {
    if (!user || loadingMore || !hasMore || activeTab === 'ACTION_REQUIRED') return;

    setLoadingMore(true);
    try {
      const data = await api<{ emails: EmailData[]; total: number }>(
        `/emails?priority=${activeTab}&search=${encodeURIComponent(searchTerm)}&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const newEmails = data.emails || [];
      setEmails((prev) => [...prev, ...newEmails]);
      setOffset((prev) => prev + newEmails.length);
      setHasMore(offset + newEmails.length < (data.total || 0));
    } catch (err) {
      console.error('Failed to load more emails:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, activeTab, searchTerm, offset, loadingMore, hasMore]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // IntersectionObserver for infinite scroll — triggers loadMore when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

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

  const isDevUser = user?.isAdmin ?? false;

  const handleInjectTest = async (type: string = 'placement') => {
    if (!user || !isDevUser) return;
    try {
      await api('/emails/inject-test', { method: 'POST', body: { type } });
      fetchData();
    } catch (err) {
      console.error('Failed to inject test email:', err);
    }
  };

  const handleClearTestEmails = async () => {
    if (!user || !isDevUser) return;
    try {
      await api('/emails/clear-test?all=true', { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to clear test emails:', err);
    }
  };

  const handleSyncNow = async () => {
    if (!user) return;

    if (userRulesCount < 3) {
      setShowRulesPanel(true);
      return;
    }

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
    setCameWithToken(false);
  };

  // Onboarding Step Calculations
  const isStep1Done = telegramLinked;
  const isStep2Done = userRulesCount >= 3;
  const completedStepsCount = (isStep1Done ? 1 : 0) + (isStep2Done ? 1 : 0);

  // Loading / Server Wakeup screen
  if (isServerSleeping && authLoading) {
    return (
      <ServerWakeupCard
        onReady={() => {
          setIsServerSleeping(false);
          checkUserAuth();
        }}
      />
    );
  }

  // If we came with a token but auth hasn't succeeded yet, show wakeup card
  if (cameWithToken && !user && !authLoading) {
    return (
      <ServerWakeupCard
        onReady={() => {
          setCameWithToken(false);
          checkUserAuth();
        }}
      />
    );
  }

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

  // Login page — redirect to landing if not authenticated
  if (!user) {
    // Hard redirect: if user has no role set, send to role picker before dashboard
    if (!authLoading && user === null) {
      // This branch is handled by useEffect below; we land here only if auth fails entirely
    }
    return (
      <main className="login-page">
        <section className="glass-card login-card">
          <div className="login-brand-icon">📬</div>
          <h1 className="login-title">PrioritySync</h1>
          <p className="login-subtitle">
            Smart email priority scoring & real-time Telegram alerts. Tailored to your role.
          </p>

          <div className="features-grid">
            <div className="feature-item">
              <span className="feature-icon">🔒</span>
              <span className="feature-text">
                Read-only Gmail access — we can't send or delete your emails
              </span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">✈️</span>
              <span className="feature-text">
                Instant Telegram alerts for high-priority mail
              </span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🎯</span>
              <span className="feature-text">
                Role-tuned priority rules — student, teacher, developer, and more
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
            Connect with Google
          </a>
        </section>
      </main>
    );
  }

  // Hard redirect: authenticated user with no role → role picker
  if (user && !user.role) {
    const navigate = useNavigate();
    useEffect(() => {
      navigate('/onboarding/role');
    }, [navigate]);
    return (
      <div className="app-shell loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p className="loading-text">Setting up your profile...</p>
        </div>
      </div>
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
            <h1 className="brand-title">PriorityPush</h1>
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
          {isDevUser && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowWaitlistPanel(true)}
            >
              📬 Waitlist
            </button>
          )}
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
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSyncNow}
            disabled={syncing}
            title={userRulesCount < 3 ? 'Add 3 priority rules to unlock sync' : 'Sync latest inbox messages'}
          >
            {syncing ? 'Syncing...' : userRulesCount < 3 ? `⚙️ Add Rules to Sync (${userRulesCount}/3)` : '🔄 Sync Now'}
          </button>
          {isDevUser && (
            <button
              className="dev-tools-toggle"
              onClick={() => setShowDevTools(!showDevTools)}
            >
              🧪 Dev {showDevTools ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Dev Tools (collapsible - only for authorized dev email) */}
      {isDevUser && showDevTools && (
        <div className="dev-tools-panel" style={{ marginBottom: '1.25rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setManualWakeupPreview(true)}
          >
            😴 Preview 3D Wakeup Card
          </button>
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

      {manualWakeupPreview && (
        <ServerWakeupCard
          isManualTesting={true}
          onCloseManual={() => setManualWakeupPreview(false)}
        />
      )}

      {/* Feed Header */}
      <div className="feed-header">
        <h2 className="feed-title">
          Inbox
          <span className="feed-count">
            {activeTab === 'ACTION_REQUIRED'
              ? emails.length
              : `${emails.length} of ${totalEmails}`}
          </span>
        </h2>
      </div>

      {/* Email Feed */}
      <section className="feed-container">
        {emails.length > 0 ? (
          <>
            {emails.map((email, index) => (
              <div
                key={email.id}
                className="email-card-enter"
                style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
              >
                <EmailCard
                  email={email}
                  onAcknowledge={() => {
                    setEmails((prev) =>
                      prev.map((e) =>
                        e.id === email.id ? { ...e, acknowledgedAt: new Date().toISOString() } : e,
                      ),
                    );
                  }}
                />
              </div>
            ))}
            {hasMore && activeTab !== 'ACTION_REQUIRED' && (
              <div ref={sentinelRef} className="feed-sentinel">
                {loadingMore && <div className="spinner" />}
              </div>
            )}
          </>
        ) : (
          <div className="glass-card empty-state">
            <div className="empty-icon">{userRulesCount < 3 ? '⚙️' : '📭'}</div>
            <h3 className="empty-title">
              {userRulesCount < 3 ? '3 Priority Rules Required' : 'No emails found'}
            </h3>
            <p className="empty-description">
              {userRulesCount < 3
                ? `You must configure at least 3 priority rules before syncing emails (${userRulesCount}/3 created).`
                : searchTerm
                ? 'No emails match your search filter. Try adjusting your keywords.'
                : 'Click "Sync Now" to fetch recent messages from your connected email account.'}
            </p>
            {!searchTerm && (
              <button
                className="btn btn-primary"
                onClick={() => (userRulesCount < 3 ? setShowRulesPanel(true) : handleSyncNow())}
                disabled={syncing}
              >
                {userRulesCount < 3
                  ? `➕ Add Priority Rules (${userRulesCount}/3)`
                  : syncing
                  ? 'Syncing...'
                  : '🔄 Sync Now'}
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

      {/* Waitlist Panel (admin only) */}
      {showWaitlistPanel && (
        <WaitlistPanel onClose={() => setShowWaitlistPanel(false)} />
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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/onboarding/role" element={<RolePicker />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
