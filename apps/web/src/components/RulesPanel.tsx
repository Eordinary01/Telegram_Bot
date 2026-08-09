import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface Rule {
  id: string;
  keyword?: string;
  domain?: string;
  weight: number;
  matchField?: string;
  isActive: boolean;
}

interface RuleSet {
  userKeywords: Rule[];
  globalKeywords: Rule[];
  userSenders: Rule[];
  globalSenders: Rule[];
}

type Impact = 'high' | 'medium' | 'low';

interface RulesPanelProps {
  onClose: () => void;
  onRescanDone: () => void;
  onRulesUpdated?: (count: number) => void;
}

const IMPACT_COLORS: Record<Impact, string> = {
  high: '#fca5a5',
  medium: '#fcd34d',
  low: '#94a3b8',
};

const IMPACT_BG: Record<Impact, string> = {
  high: 'rgba(239, 68, 68, 0.12)',
  medium: 'rgba(245, 158, 11, 0.12)',
  low: 'rgba(100, 116, 139, 0.1)',
};

const IMPACT_BORDER: Record<Impact, string> = {
  high: 'rgba(239, 68, 68, 0.25)',
  medium: 'rgba(245, 158, 11, 0.25)',
  low: 'rgba(100, 116, 139, 0.2)',
};

function getImpactFromWeight(weight: number): Impact {
  if (weight >= 20) return 'high';
  if (weight >= 10) return 'medium';
  return 'low';
}

export const RulesPanel: React.FC<RulesPanelProps> = ({
  onClose,
  onRescanDone,
  onRulesUpdated,
}) => {
  const [data, setData] = useState<RuleSet | null>(null);
  const [type, setType] = useState<'keyword' | 'sender'>('keyword');
  const [value, setValue] = useState('');
  const [impact, setImpact] = useState<Impact>('high');
  const [matchField, setMatchField] = useState<'subject' | 'snippet' | 'any'>('any');
  const [loading, setLoading] = useState(false);
  const [rescaling, setRescaling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const rules = await api<RuleSet>('/rules');
      setData(rules);
      const userCount = rules.userKeywords.length + rules.userSenders.length;
      if (onRulesUpdated) {
        onRulesUpdated(userCount);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    }
  }, [onRulesUpdated]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleAdd = async () => {
    setError(null);
    setMessage(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter a keyword or sender domain');
      return;
    }

    setLoading(true);
    try {
      await api('/rules', {
        method: 'POST',
        body: {
          type,
          value: trimmed,
          impact,
          matchField: type === 'keyword' ? matchField : undefined,
        },
      });
      setValue('');
      await loadRules();
      setMessage('Rule added! Existing emails will re-score automatically.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      await api(`/rules/${id}`, { method: 'DELETE' });
      await loadRules();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleRescan = async () => {
    setError(null);
    setMessage(null);
    setRescaling(true);
    try {
      const result = await api<{ jobId: string; message: string }>('/rules/re-scan', {
        method: 'POST',
      });
      setMessage(`${result.message}. Processing...`);
      onRescanDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start re-scan');
    } finally {
      setRescaling(false);
    }
  };

  const userRuleCount = data ? data.userKeywords.length + data.userSenders.length : 0;
  const isSetupComplete = userRuleCount >= 3;

  const ruleTitle = (rule: Rule): string => rule.keyword ?? rule.domain ?? '(unnamed)';
  const ruleCategory = (rule: Rule): string =>
    rule.domain ? `Sender Domain` : `Keyword · ${rule.matchField ?? 'any'}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content horizontal-rules-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Top Section */}
        <div className="rules-fixed-top">
          {/* Header with Title & Setup Progress */}
          <div className="modal-header">
            <div>
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                🎯 Priority Rules & Filters
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    background: isSetupComplete ? 'rgba(74, 222, 128, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    border: `1px solid ${isSetupComplete ? 'rgba(74, 222, 128, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    color: isSetupComplete ? '#4ade80' : '#fcd34d',
                    fontWeight: 600,
                  }}
                >
                  {isSetupComplete ? 'Setup Goal Met (3/3+ Rules)' : `Setup Progress: ${userRuleCount}/3 Rules`}
                </span>
              </h2>
            </div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <p className="modal-description" style={{ marginBottom: '0.75rem' }}>
            Define keywords (e.g. &quot;NPTEL&quot;, &quot;Placement&quot;) or senders (e.g. &quot;nptel.iitm.ac.in&quot;) to score all incoming mail.
          </p>

          {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          {message && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{message}</div>}

          {/* Horizontal Rule Creation Bar */}
          <div className="rule-creation-bar">
            <div className="rule-bar-header">
              <span className="bar-title">➕ Quick Rule Creator</span>
              <span className="bar-subtitle">Create a rule to boost or filter mail</span>
            </div>

            <div className="rule-bar-controls">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'keyword' | 'sender')}
                className="search-input rule-input-select"
              >
                <option value="keyword">🔤 Keyword</option>
                <option value="sender">🌐 Sender Domain</option>
              </select>

              <input
                className="search-input rule-input-text"
                placeholder={type === 'keyword' ? 'e.g. NPTEL or Placement' : 'e.g. nptel.iitm.ac.in'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />

              <select
                value={impact}
                onChange={(e) => setImpact(e.target.value as Impact)}
                className="search-input rule-input-select"
              >
                <option value="high">🔴 High (+25)</option>
                <option value="medium">🟡 Medium (+15)</option>
                <option value="low">⚪ Low (+5)</option>
              </select>

              {type === 'keyword' && (
                <select
                  value={matchField}
                  onChange={(e) => setMatchField(e.target.value as typeof matchField)}
                  className="search-input rule-input-select"
                >
                  <option value="any">Subject or Body</option>
                  <option value="subject">Subject only</option>
                  <option value="snippet">Body only</option>
                </select>
              )}

              <button
                className="btn btn-primary rule-add-btn"
                onClick={handleAdd}
                disabled={loading}
              >
                {loading ? 'Adding...' : '+ Add Rule'}
              </button>
            </div>
          </div>

          {/* Section Divider & Active Rules Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              margin: '0.85rem 0 0.4rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              📋 Active Custom Rules
              <span className="feed-count" style={{ marginLeft: 0 }}>{userRuleCount}</span>
            </span>
            <button className="btn btn-secondary btn-sm" onClick={handleRescan} disabled={rescaling}>
              {rescaling ? 'Re-scanning...' : '🔄 Re-scan inbox'}
            </button>
          </div>
        </div>

        {/* Scrollable Active Rules Area */}
        <div className="rules-scroll-area">
          {data && (
            <>
              {data.userKeywords.length === 0 && data.userSenders.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: '0.88rem',
                    padding: '2.5rem 1rem',
                    textAlign: 'center',
                    background: 'var(--bg-inset)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-subtle)',
                  }}
                >
                  💡 No custom rules created yet. Create at least 3 rules above (e.g. <code>nptel.iitm.ac.in</code> or <code>NPTEL</code>) to complete your setup!
                </div>
              ) : (
                <div className="rules-grid-list">
                  {[...data.userKeywords, ...data.userSenders].map((rule) => {
                    const ruleImpact = getImpactFromWeight(rule.weight);
                    return (
                      <div key={rule.id} className="rule-card-item">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="rule-item-title">
                            {ruleTitle(rule)}
                          </div>
                          <div className="rule-item-category">
                            {ruleCategory(rule)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: IMPACT_COLORS[ruleImpact],
                              background: IMPACT_BG[ruleImpact],
                              border: `1px solid ${IMPACT_BORDER[ruleImpact]}`,
                            }}
                          >
                            +{rule.weight} PTS
                          </span>
                          <button
                            className="modal-close"
                            onClick={() => handleDelete(rule.id)}
                            style={{ width: '26px', height: '26px', fontSize: '0.85rem' }}
                            title="Delete rule"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Global System Defaults */}
          {data && data.globalKeywords.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem' }}>
                System Base Defaults
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {[...data.globalKeywords, ...data.globalSenders].map((rule) => (
                  <span key={rule.id} className="reason-tag">
                    {ruleTitle(rule)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
