import React, { useState, useEffect, useRef } from 'react';

interface ThemeColors {
  primary: string;
  secondary: string;
  bgKey: string; // key into BG_PRESETS
}

const THEME_STORAGE_KEY = 'jecrc_theme';

const PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: 'Ocean', primary: '#3b82f6', secondary: '#8b5cf6' },
  { name: 'Emerald', primary: '#10b981', secondary: '#14b8a6' },
  { name: 'Rose', primary: '#f43f5e', secondary: '#f97316' },
  { name: 'Violet', primary: '#a855f7', secondary: '#ec4899' },
  { name: 'Amber', primary: '#f59e0b', secondary: '#84cc16' },
  { name: 'Slate', primary: '#6366f1', secondary: '#06b6d4' },
];

interface BgPreset {
  key: string;
  label: string;
  bgDark: string;
  bgSurface: string;
  bgSurfaceHover: string;
  bgElevated: string;
  bgInset: string;
  borderSubtle: string;
  borderDefault: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  swatch: string; // preview color for the button
}

const BG_PRESETS: BgPreset[] = [
  {
    key: 'midnight',
    label: 'Midnight',
    bgDark: '#060910',
    bgSurface: 'rgba(14, 20, 36, 0.82)',
    bgSurfaceHover: 'rgba(22, 32, 56, 0.9)',
    bgElevated: 'rgba(24, 34, 58, 0.85)',
    bgInset: 'rgba(8, 12, 24, 0.6)',
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    borderDefault: 'rgba(255, 255, 255, 0.09)',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    swatch: '#0a0f1c',
  },
  {
    key: 'charcoal',
    label: 'Charcoal',
    bgDark: '#111111',
    bgSurface: 'rgba(26, 26, 26, 0.85)',
    bgSurfaceHover: 'rgba(38, 38, 38, 0.9)',
    bgElevated: 'rgba(42, 42, 42, 0.85)',
    bgInset: 'rgba(16, 16, 16, 0.6)',
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    borderDefault: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#e5e5e5',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
    swatch: '#1a1a1a',
  },
  {
    key: 'abyss',
    label: 'Abyss',
    bgDark: '#000208',
    bgSurface: 'rgba(6, 10, 22, 0.88)',
    bgSurfaceHover: 'rgba(12, 18, 36, 0.92)',
    bgElevated: 'rgba(14, 22, 44, 0.88)',
    bgInset: 'rgba(2, 4, 12, 0.7)',
    borderSubtle: 'rgba(255, 255, 255, 0.04)',
    borderDefault: 'rgba(255, 255, 255, 0.07)',
    textPrimary: '#e2e8f0',
    textSecondary: '#8896ab',
    textTertiary: '#556377',
    swatch: '#020510',
  },
  {
    key: 'warm',
    label: 'Warm Dark',
    bgDark: '#0f0b08',
    bgSurface: 'rgba(24, 18, 12, 0.82)',
    bgSurfaceHover: 'rgba(36, 28, 18, 0.9)',
    bgElevated: 'rgba(40, 30, 20, 0.85)',
    bgInset: 'rgba(14, 10, 6, 0.6)',
    borderSubtle: 'rgba(255, 230, 200, 0.06)',
    borderDefault: 'rgba(255, 230, 200, 0.1)',
    textPrimary: '#f5ebe0',
    textSecondary: '#b8a898',
    textTertiary: '#7a6e62',
    swatch: '#1a1408',
  },
  {
    key: 'forest',
    label: 'Forest',
    bgDark: '#040d08',
    bgSurface: 'rgba(10, 22, 16, 0.82)',
    bgSurfaceHover: 'rgba(16, 34, 24, 0.9)',
    bgElevated: 'rgba(18, 38, 28, 0.85)',
    bgInset: 'rgba(6, 14, 10, 0.6)',
    borderSubtle: 'rgba(200, 255, 220, 0.05)',
    borderDefault: 'rgba(200, 255, 220, 0.08)',
    textPrimary: '#e8f5e9',
    textSecondary: '#90b098',
    textTertiary: '#5a7a62',
    swatch: '#081a0e',
  },
  {
    key: 'oled',
    label: 'OLED Black',
    bgDark: '#000000',
    bgSurface: 'rgba(12, 12, 12, 0.9)',
    bgSurfaceHover: 'rgba(22, 22, 22, 0.92)',
    bgElevated: 'rgba(18, 18, 18, 0.9)',
    bgInset: 'rgba(6, 6, 6, 0.7)',
    borderSubtle: 'rgba(255, 255, 255, 0.05)',
    borderDefault: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1a1',
    textTertiary: '#666666',
    swatch: '#000000',
  },
];

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '59, 130, 246';
  return `${parseInt(result[1]!, 16)}, ${parseInt(result[2]!, 16)}, ${parseInt(result[3]!, 16)}`;
}

function applyAccentColors(primary: string, secondary: string) {
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-rgb', hexToRgb(primary));
  root.style.setProperty('--primary-glow', `rgba(${hexToRgb(primary)}, 0.35)`);
  root.style.setProperty('--secondary', secondary);
  root.style.setProperty('--secondary-rgb', hexToRgb(secondary));
  root.style.setProperty('--secondary-glow', `rgba(${hexToRgb(secondary)}, 0.3)`);
}

function applyBgTheme(bgKey: string) {
  const preset = BG_PRESETS.find((p) => p.key === bgKey) ?? BG_PRESETS[0]!;
  const root = document.documentElement;
  root.style.setProperty('--bg-dark', preset.bgDark);
  root.style.setProperty('--bg-surface', preset.bgSurface);
  root.style.setProperty('--bg-surface-hover', preset.bgSurfaceHover);
  root.style.setProperty('--bg-elevated', preset.bgElevated);
  root.style.setProperty('--bg-inset', preset.bgInset);
  root.style.setProperty('--border-subtle', preset.borderSubtle);
  root.style.setProperty('--border-default', preset.borderDefault);
  root.style.setProperty('--text-primary', preset.textPrimary);
  root.style.setProperty('--text-secondary', preset.textSecondary);
  root.style.setProperty('--text-tertiary', preset.textTertiary);
}

function applyTheme(theme: ThemeColors) {
  applyAccentColors(theme.primary, theme.secondary);
  applyBgTheme(theme.bgKey);
}

function loadSavedTheme(): ThemeColors {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ThemeColors;
      if (parsed.primary && parsed.secondary) {
        return {
          primary: parsed.primary,
          secondary: parsed.secondary,
          bgKey: parsed.bgKey || 'midnight',
        };
      }
    }
  } catch {
    // ignore
  }
  return { primary: '#3b82f6', secondary: '#8b5cf6', bgKey: 'midnight' };
}

/** Initializes theme from localStorage on page load. Call once in App root. */
export function initializeTheme() {
  const theme = loadSavedTheme();
  applyTheme(theme);
}

interface ThemePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemePicker: React.FC<ThemePickerProps> = ({ isOpen, onClose }) => {
  const [colors, setColors] = useState<ThemeColors>(loadSavedTheme);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [isOpen, onClose]);

  const updateColors = (newColors: ThemeColors) => {
    setColors(newColors);
    applyTheme(newColors);
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(newColors));
  };

  if (!isOpen) return null;

  const activePreset = PRESETS.find(
    (p) => p.primary === colors.primary && p.secondary === colors.secondary,
  );

  return (
    <div className="theme-picker-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
      {/* Accent Colors Section */}
      <div className="theme-picker-title">🎨 Accent Colors</div>

      <div className="theme-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`theme-preset-btn ${activePreset?.name === preset.name ? 'active' : ''}`}
            onClick={() => updateColors({ ...colors, primary: preset.primary, secondary: preset.secondary })}
            title={preset.name}
          >
            <span className="preset-swatch" style={{ backgroundColor: preset.primary }} />
            <span className="preset-swatch" style={{ backgroundColor: preset.secondary }} />
          </button>
        ))}
      </div>

      <div className="theme-custom-section">
        <div className="theme-color-row">
          <span className="theme-color-label">Primary</span>
          <input
            type="color"
            className="theme-color-input"
            value={colors.primary}
            onChange={(e) => updateColors({ ...colors, primary: e.target.value })}
          />
          <span className="theme-color-hex">{colors.primary.toUpperCase()}</span>
        </div>
        <div className="theme-color-row">
          <span className="theme-color-label">Secondary</span>
          <input
            type="color"
            className="theme-color-input"
            value={colors.secondary}
            onChange={(e) => updateColors({ ...colors, secondary: e.target.value })}
          />
          <span className="theme-color-hex">{colors.secondary.toUpperCase()}</span>
        </div>
      </div>

      <div className="theme-divider" />

      {/* Background Theme Section */}
      <div className="theme-picker-title" style={{ marginTop: '0.25rem' }}>🌑 Background</div>

      <div className="theme-bg-presets">
        {BG_PRESETS.map((bg) => (
          <button
            key={bg.key}
            className={`theme-bg-btn ${colors.bgKey === bg.key ? 'active' : ''}`}
            onClick={() => updateColors({ ...colors, bgKey: bg.key })}
            title={bg.label}
          >
            <span
              className="bg-swatch"
              style={{
                backgroundColor: bg.swatch,
                boxShadow: colors.bgKey === bg.key ? `0 0 8px ${bg.swatch === '#000000' ? 'rgba(255,255,255,0.2)' : bg.swatch}` : 'none',
              }}
            />
            <span className="bg-label">{bg.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
