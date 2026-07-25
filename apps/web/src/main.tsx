import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

import './styles.css';
import { EmailCard, type EmailData } from './components/EmailCard';
import { TelegramModal } from './components/TelegramModal';

const API_URL = 'http://localhost:3000';

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
  lastSyncAt: string | null;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, high: 0, medium: 0, low: 0, unread: 0, lastSyncAt: null });
  const [activeTab, setActiveTab] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);

  // Check auth user status
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = urlParams.get('userId');
    const storedUserId = userIdFromUrl || localStorage.getItem('jecrc_user_id');

    const endpoint = storedUserId
      ? `${API_URL}/auth/me?userId=${storedUserId}`
      : `${API_URL}/auth/me`;

    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUser(data);
          localStorage.setItem('jecrc_user_id', data.id);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // Fetch emails and stats when user is loaded or tab/search changes
  const fetchData = useCallback(() => {
    if (!user) return;

    const params = new URLSearchParams({
      userId: user.id,
      priority: activeTab,
      search: searchTerm,
    });

    fetch(`${API_URL}/emails?${params}`)
      .then((res) => res.json())
      .then((data) => setEmails(data.emails || []))
      .catch((err) => console.error('Failed to fetch emails:', err));

    fetch(`${API_URL}/emails/stats?userId=${user.id}`)
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to fetch stats:', err));

    fetch(`${API_URL}/telegram/link/${user.id}`)
      .then((res) => res.json())
      .then((data) => setTelegramLinked(!!data.linked))
      .catch(() => setTelegramLinked(false));
  }, [user, activeTab, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time SSE event listener
  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource(`${API_URL}/emails/stream?userId=${user.id}`);

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
      await fetch(`${API_URL}/emails/inject-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, type }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to inject test email:', err);
    }
  };

  const handleClearTestEmails = async () => {
    if (!user) return;
    try {
      await fetch(`${API_URL}/emails/clear-test?userId=${user.id}`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (err) {
      console.error('Failed to clear test emails:', err);
    }
  };

  const handleSyncNow = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await fetch(`${API_URL}/sync/${user.id}`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
        <p style={{ color: '#94a3b8' }}>Loading priority sync system...</p>
      </div>
    );
  }

  // Unauthenticated view
  if (!user) {
    return (
      <main className="app-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '90vh' }}>
        <section className="glass-card" style={{ maxWidth: '580px', textAlign: 'center', padding: '3rem 2rem' }}>
          <div className="brand-icon" style={{ margin: '0 auto 1.5rem', width: '56px', height: '56px', fontSize: '2rem' }}>
            📧
          </div>
          <h1 className="brand-title" style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>
            JECRC Mail Priority Sync
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '2rem' }}>
            Smart email filtering & real-time Telegram alerts for Placement, Exam, and Academic notices.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🎯</span>
              <span style={{ fontSize: '0.925rem', color: '#cbd5e1' }}>Exact `@jecrcu.edu.in` sender domain gate</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>✈️</span>
              <span style={{ fontSize: '0.925rem', color: '#cbd5e1' }}>Instant Telegram alerts for high-priority mail</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🔒</span>
              <span style={{ fontSize: '0.925rem', color: '#cbd5e1' }}>Read-only scope & encrypted tokens at rest</span>
            </div>
          </div>

          <a
            href={`${API_URL}/auth/google`}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', fontSize: '1.05rem' }}
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
            Connect with Gmail
          </a>
        </section>
      </main>
    );
  }

  // Dashboard view
  return (
    <div className="app-shell">
      {/* Navbar Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">📬</div>
          <div>
            <h1 className="brand-title">JECRC Mail Sync</h1>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Priority Notification Dashboard</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="user-badge">
            <span className="status-dot"></span>
            <span>{user.email}</span>
          </div>
          <a
            href={`${API_URL}/auth/google`}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.5rem 0.85rem' }}
          >
            Reconnect
          </a>
        </div>
      </header>

      {/* Stats Cards */}
      <section className="stats-grid">
        <div className="glass-card stat-card">
          <span className="stat-title">Total Filtered</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: '#60a5fa' }}>{stats.total}</span>
            <span className="stat-icon">📨</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">High Priority</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: '#fca5a5' }}>{stats.high}</span>
            <span className="stat-icon">🔥</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">Medium Priority</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ color: '#fcd34d' }}>{stats.medium}</span>
            <span className="stat-icon">⚡</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-title">Telegram Status</span>
          <div className="stat-value-group">
            <span className="stat-value" style={{ fontSize: '1.2rem', color: telegramLinked ? '#4ade80' : '#fb7185' }}>
              {telegramLinked ? 'Linked' : 'Not Linked'}
            </span>
            <span className="stat-icon">✈️</span>
          </div>
        </div>
      </section>

      {/* Toolbar Controls */}
      <div className="toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search placement, exams, faculty..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="action-btns">
          <button className="btn btn-secondary" onClick={() => setShowTelegramModal(true)}>
            ✈️ {telegramLinked ? 'Telegram Settings' : 'Link Telegram'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleInjectTest('placement')} title="Inject sample placement drive email">
            🧪 + Placement Email
          </button>
          <button className="btn btn-secondary" onClick={() => handleInjectTest('exam')} title="Inject sample exam schedule email">
            🧪 + Exam Email
          </button>
          <button className="btn btn-secondary" onClick={handleClearTestEmails} title="Clear all dummy test emails">
            🗑️ Clear Test Emails
          </button>
          <button className="btn btn-primary" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing...' : '🔄 Sync Now'}
          </button>
        </div>
      </div>

      {/* Email Feed */}
      <section className="feed-container">
        {emails.length > 0 ? (
          emails.map((email) => <EmailCard key={email.id} email={email} />)
        ) : (
          <div className="glass-card empty-state">
            <div className="empty-icon">📭</div>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              No emails found
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
              {searchTerm
                ? 'No emails match your search filter.'
                : 'Click "Sync Now" to fetch recent messages from your connected @jecrcu.edu.in account.'}
            </p>
          </div>
        )}
      </section>

      {/* Telegram Link Modal */}
      {showTelegramModal && (
        <TelegramModal
          userId={user.id}
          apiUrl={API_URL}
          onClose={() => setShowTelegramModal(false)}
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
