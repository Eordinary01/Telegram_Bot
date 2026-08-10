import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../lib/api';

interface ServerWakeupCardProps {
  onReady?: () => void;
  isManualTesting?: boolean;
  onCloseManual?: () => void;
}

const FUNNY_MESSAGES = [
  "😴 Shhh... Server was taking a quick nap on Render free tier. Waking it up...",
  "☕ Server is brewing an extra-strong espresso before reading your emails...",
  "🐢 Free tier hamster wheel initializing... spinning up the gears!",
  "📬 Brushing server teeth before inspecting high-priority emails...",
  "⚡ Zapping database connectors back to life... 3... 2... 1...",
  "🚀 Warming up CPU engines! Almost ready for launch...",
];

const FUNNY_SUBTEXTS = [
  "Tip: Free tier servers need love too (and ~30 seconds of patience)!",
  "Fun Fact: While you wait, the backend server is doing 10 quick pushups.",
  "Render free tier is heating up its cold coffee... hang tight!",
  "Checking email filters, Telegram bots, and rocket engines...",
];

export function ServerWakeupCard({ onReady, isManualTesting = false, onCloseManual }: ServerWakeupCardProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [subtextIndex, setSubtextIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isWokenUp, setIsWokenUp] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Rotate funny messages every 3.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % FUNNY_MESSAGES.length);
      setSubtextIndex((prev) => (prev + 1) % FUNNY_SUBTEXTS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Timer counter
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll /health/live to detect when server wakes up
  const checkHealth = useCallback(async () => {
    if (isWokenUp && !isManualTesting) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_URL}/health/live`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        setIsWokenUp(true);
        if (onReady) {
          setTimeout(() => {
            onReady();
          }, 1200); // Give user a brief moment to see success
        }
      }
    } catch {
      // Server still sleeping, ignore error and let retry loop continue
    } finally {
      setCheckCount((prev) => prev + 1);
    }
  }, [isWokenUp, isManualTesting, onReady]);

  useEffect(() => {
    if (isWokenUp && !isManualTesting) return;

    // Immediate check, then poll every 2.5s
    checkHealth();
    const interval = setInterval(checkHealth, 2500);
    return () => clearInterval(interval);
  }, [checkHealth, isWokenUp, isManualTesting]);

  // 3D Card Tilt effect on mouse movement
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within card
    const y = e.clientY - rect.top; // y position within card

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (-15deg to +15deg max)
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 }); // reset tilt smooth transition
  };

  // Progress percentage (estimated over ~35s)
  const progressPercent = isWokenUp ? 100 : Math.min(95, Math.floor((elapsedSeconds / 35) * 100));

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m > 0 ? `${m}m ` : ''}${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div className="wakeup-overlay" onMouseMove={handleMouseMove}>
      {/* Dynamic ambient backdrop blur & lighting */}
      <div className="wakeup-backdrop-glow" />

      {/* 3D Card Container */}
      <div
        ref={cardRef}
        className={`wakeup-card 3d-card ${isWokenUp ? 'is-woken' : ''} ${isHovered ? 'hovered' : ''}`}
        style={{
          transform: `perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) ${
            isHovered ? 'scale3d(1.02, 1.02, 1.02)' : 'scale3d(1, 1, 1)'
          }`,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Card Shine Layer */}
        <div
          className="wakeup-card-shine"
          style={{
            background: `radial-gradient(circle at ${50 + rotation.y * 3}% ${
              50 - rotation.x * 3
            }%, rgba(255, 255, 255, 0.15) 0%, transparent 60%)`,
          }}
        />

        {/* 3D Layer 1: Floating Icon */}
        <div className="wakeup-3d-layer layer-top">
          <div className={`wakeup-avatar-wrapper ${isWokenUp ? 'pulse-green' : 'pulse-orange'}`}>
            <div className="wakeup-avatar-icon">
              {isWokenUp ? '⚡' : '😴'}
            </div>
            <div className="wakeup-radar-ring" />
            <div className="wakeup-radar-ring delay" />
          </div>
        </div>

        {/* 3D Layer 2: Status Badge */}
        <div className="wakeup-3d-layer layer-badge">
          <span className={`wakeup-status-badge ${isWokenUp ? 'ready' : 'waking'}`}>
            <span className="badge-dot" />
            {isWokenUp ? 'Backend Ready & Online!' : `Waking Server (Attempt ${checkCount})`}
          </span>
        </div>

        {/* 3D Layer 3: Main Taunt / Funny Message */}
        <div className="wakeup-3d-layer layer-middle">
          <h2 className="wakeup-title">
            {isWokenUp ? "🚀 Boom! Server is awake!" : FUNNY_MESSAGES[messageIndex]}
          </h2>
          <p className="wakeup-subtext">
            {isWokenUp ? "Transitioning to your dashboard..." : FUNNY_SUBTEXTS[subtextIndex]}
          </p>
        </div>

        {/* 3D Layer 4: Progress Bar & Timer */}
        <div className="wakeup-3d-layer layer-bottom">
          <div className="wakeup-progress-container">
            <div className="wakeup-progress-header">
              <span className="progress-label">
                {isWokenUp ? "Server Warmup Complete" : "Warming up Render Instance..."}
              </span>
              <span className="progress-timer">{formatTimer(elapsedSeconds)}</span>
            </div>
            <div className="wakeup-progress-track">
              <div
                className={`wakeup-progress-bar ${isWokenUp ? 'complete' : ''}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Controls / Manual actions */}
        <div className="wakeup-actions">
          {isWokenUp ? (
            <button className="wakeup-btn primary" onClick={onReady || onCloseManual}>
              Enter Dashboard →
            </button>
          ) : isManualTesting ? (
            <button className="wakeup-btn secondary" onClick={onCloseManual}>
              Close Preview
            </button>
          ) : (
            <div className="wakeup-hint">
              <span>Automatic redirection as soon as backend answers live check...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
