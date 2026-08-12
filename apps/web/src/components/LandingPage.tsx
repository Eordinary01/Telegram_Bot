import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { EmailCaptureForm } from './EmailCaptureForm';
import { FAQSection } from './FAQSection';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Real-Time Push',
    desc: 'High-priority emails hit your Telegram in under 1 second. No polling. No refresh. Just instant awareness.',
  },
  {
    icon: '🔍',
    title: 'Transparent Scoring',
    desc: "Every email shows EXACTLY why it scored high. Sender domain, keywords, deadlines — all visible, all customizable.",
  },
  {
    icon: '🎯',
    title: 'Custom Rules',
    desc: "Add your own keywords and senders. 'placement' = high priority? Done. 'hod@university.edu.in' = urgent? One click.",
  },
  {
    icon: '📅',
    title: 'Deadline Extraction',
    desc: 'Automatically detects deadlines in email text and generates Google Calendar links. Never miss a submission date.',
  },
  {
    icon: '🔒',
    title: 'Read-Only Access',
    desc: "We can't send, delete, or modify your emails. Tokens are AES-256 encrypted. Your Gmail stays yours.",
  },
  {
    icon: '🚀',
    title: 'Zero Setup',
    desc: 'Connect your Google account, link Telegram, done. Takes 30 seconds. No complex configuration needed.',
  },
];

export function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero animations
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      heroTl
        .fromTo('.hero-badge', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 })
        .fromTo('.hero-title', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, '-=0.2')
        .fromTo('.hero-subtitle', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '-=0.4')
        .fromTo('.hero-cta', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
        .fromTo('.hero-social-proof', { opacity: 0 }, { opacity: 1, duration: 0.5 }, '-=0.2');

      // Floating orbs animation
      gsap.to('.orb-1', {
        y: -30,
        x: 20,
        duration: 6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('.orb-2', {
        y: 25,
        x: -15,
        duration: 5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: 1,
      });
      gsap.to('.orb-3', {
        y: -20,
        x: -25,
        duration: 7,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: 2,
      });

      // Features stagger animation
      gsap.fromTo(
        '.feature-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: featuresRef.current,
            start: 'top 75%',
          },
        },
      );

      // How it works animation
      gsap.fromTo(
        '.step-card',
        { scale: 0.8, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: 0.15,
          ease: 'back.out(1.4)',
          scrollTrigger: {
            trigger: howItWorksRef.current,
            start: 'top 75%',
          },
        },
      );

      // CTA section
      gsap.fromTo(
        '.cta-box',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ctaRef.current,
            start: 'top 80%',
          },
        },
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="landing-page" ref={heroRef}>
      {/* Floating Background Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-brand">
          <span className="nav-logo">📬</span>
          <span className="nav-name">PriorityPush</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#faq">FAQ</a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">Built for JECRC University</div>
        <h1 className="hero-title">
          Never miss an
          <br />
          <span className="hero-gradient">important email</span>
          <br />
          again.
        </h1>
        <p className="hero-subtitle">
          Real-time Telegram alerts for Gmail. Transparent rules, not black-box AI.
          <br />
          See exactly why every email matters — and customize it yourself.
        </p>
        <div className="hero-cta">
          <EmailCaptureForm />
        </div>
        <div className="hero-social-proof">
          <div className="avatar-stack">
            <div className="avatar" style={{ background: '#3b82f6' }}>P</div>
            <div className="avatar" style={{ background: '#8b5cf6' }}>A</div>
            <div className="avatar" style={{ background: '#06b6d4' }}>S</div>
            <div className="avatar" style={{ background: '#f59e0b' }}>R</div>
          </div>
          <span>
            Trusted by <strong>100+</strong> JECRC students
          </span>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="features-section" id="features">
        <h2 className="section-title">
          Why <span className="text-gradient">PriorityPush</span>?
        </h2>
        <p className="section-subtitle">
          Stop drowning in inbox noise. Start knowing what matters.
        </p>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="feature-card glass-card">
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} className="how-it-works-section" id="how-it-works">
        <h2 className="section-title">
          Up and running in <span className="text-gradient">30 seconds</span>
        </h2>
        <div className="steps-grid">
          <div className="step-card glass-card">
            <div className="step-number">1</div>
            <h3>Connect Gmail</h3>
            <p>One-click Google OAuth. Read-only access — we can't send or delete anything.</p>
          </div>
          <div className="step-connector">→</div>
          <div className="step-card glass-card">
            <div className="step-number">2</div>
            <h3>Link Telegram</h3>
            <p>Send one message to our bot. Instant push notifications, right in your pocket.</p>
          </div>
          <div className="step-connector">→</div>
          <div className="step-card glass-card">
            <div className="step-number">3</div>
            <h3>Set Rules</h3>
            <p>Customize what's important. Or use our pre-built rules for placement, exams, and more.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaRef} className="cta-section">
        <div className="cta-box glass-card">
          <h2>Ready to take control of your inbox?</h2>
          <p>
            Join the waitlist. Be the first to know when PriorityPush opens up.
          </p>
          <EmailCaptureForm />
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="nav-logo">📬</span>
            <span className="nav-name">PriorityPush</span>
          </div>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#faq">FAQ</a>
          </div>
          <p className="footer-copy">Built for JECRC University students. Open source. Privacy first.</p>
        </div>
      </footer>
    </div>
  );
}
