import { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { API_URL } from '../lib/api';

interface EmailCaptureFormProps {
  lightMode?: boolean;
}

export function EmailCaptureForm({ lightMode }: EmailCaptureFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [position, setPosition] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/waitlist/count`)
      .then((r) => r.json())
      .then((data) => setPosition(data.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === 'success' && successRef.current) {
      gsap.fromTo(
        successRef.current,
        { scale: 0.8, opacity: 0, y: 20 },
        { scale: 1, opacity: 1, y: 0, duration: 0.6, ease: 'back.out(1.7)' },
      );
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setPosition(data.position);
      setStatus('success');

      if (buttonRef.current) {
        gsap.to(buttonRef.current, {
          scale: 1.05,
          duration: 0.15,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        });
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (status === 'success') {
    return (
      <div ref={successRef} className={`waitlist-success ${lightMode ? 'waitlist-success-light' : ''}`}>
        <div className="success-icon">🎉</div>
        <h3>You're on the list!</h3>
        <p>
          You're <strong>#{position}</strong> on the PriorityPush waitlist.
          <br />
          We're currently testing with JECRC students only. We'll notify you when we launch.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} className={`waitlist-form ${lightMode ? 'waitlist-form-light' : ''}`} onSubmit={handleSubmit}>
      <div className="form-row">
        <input
          type="text"
          placeholder="Your name (JECRC student)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`waitlist-input ${lightMode ? 'waitlist-input-light' : ''}`}
          disabled={status === 'loading'}
        />
        <input
          type="email"
          placeholder="you@jecrcu.edu.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`waitlist-input ${lightMode ? 'waitlist-input-light' : ''}`}
          required
          disabled={status === 'loading'}
        />
      </div>
      <button
        ref={buttonRef}
        type="submit"
        className="waitlist-btn"
        disabled={status === 'loading' || !email.trim()}
      >
        {status === 'loading' ? (
          <span className="btn-spinner" />
        ) : (
          <>
            Join the Waitlist
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 6 }}>
              <path
                d="M3 8H13M13 8L9 4M13 8L9 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {status === 'error' && <p className="form-error">{errorMsg}</p>}
      {position !== null && (
        <p className={`waitlist-count ${lightMode ? 'waitlist-count-light' : ''}`}>
          <strong>{position}+</strong> JECRC students already on the list
        </p>
      )}
    </form>
  );
}
