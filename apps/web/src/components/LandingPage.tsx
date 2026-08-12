import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ParticleBackground } from './ParticleBackground';
import { EmailCaptureForm } from './EmailCaptureForm';
import { FAQSection } from './FAQSection';

gsap.registerPlugin(ScrollTrigger);

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
    desc: "Add your own keywords and senders. 'placement' = high priority? Done. One click.",
  },
  {
    icon: '📅',
    title: 'Deadline Extraction',
    desc: 'Automatically detects deadlines in email text and generates Google Calendar links. Never miss a submission.',
  },
  {
    icon: '🔒',
    title: 'Read-Only Access',
    desc: "We can't send, delete, or modify your emails. Tokens are AES-256 encrypted. Your Gmail stays yours.",
  },
  {
    icon: '🚀',
    title: 'Zero Setup',
    desc: 'Connect your Google account, link Telegram, done. Takes 30 seconds. No complex configuration.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero entrance animations
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      heroTl
        .fromTo('.hero-badge', { y: -30, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.6 })
        .fromTo('.hero-title', { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, '-=0.3')
        .fromTo('.hero-subtitle', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, '-=0.5')
        .fromTo('.hero-cta', { y: 30, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.6 }, '-=0.4')
        .fromTo('.hero-social-proof', { opacity: 0 }, { opacity: 1, duration: 0.5 }, '-=0.2')
        .fromTo('.hero-login-link', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.1');

      // Features scroll animation
      gsap.fromTo(
        '.features-section .section-title',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.features-section',
            start: 'top 85%',
            end: 'top 50%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      gsap.fromTo(
        '.features-section .section-subtitle',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.features-section',
            start: 'top 80%',
            end: 'top 45%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      gsap.utils.toArray<HTMLElement>('.feature-card').forEach((card, i) => {
        gsap.fromTo(
          card,
          { y: 80, opacity: 0, rotateX: 15 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            duration: 0.7,
            ease: 'power3.out',
            delay: i * 0.08,
            scrollTrigger: {
              trigger: card,
              start: 'top 90%',
              end: 'top 60%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      });

      // How it works scroll animation
      gsap.fromTo(
        '.how-it-works-section .section-title',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.how-it-works-section',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      gsap.utils.toArray<HTMLElement>('.step-card').forEach((card, i) => {
        gsap.fromTo(
          card,
          { y: 100, opacity: 0, scale: 0.85 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.7,
            ease: 'back.out(1.4)',
            delay: i * 0.15,
            scrollTrigger: {
              trigger: '.steps-grid',
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>('.step-connector').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, x: -20 },
          {
            opacity: 1,
            x: 0,
            duration: 0.4,
            delay: 0.3 + i * 0.15,
            scrollTrigger: {
              trigger: '.steps-grid',
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      });

      // CTA section
      gsap.fromTo(
        '.cta-box',
        { y: 60, opacity: 0, scale: 0.95 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.cta-section',
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      // FAQ section
      gsap.fromTo(
        '.faq-section-title',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.faq-section',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        },
      );

      gsap.utils.toArray<HTMLElement>('.faq-item').forEach((item, i) => {
        gsap.fromTo(
          item,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            delay: i * 0.06,
            scrollTrigger: {
              trigger: item,
              start: 'top 92%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      });
    }, heroRef);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div className="landing-page landing-light" ref={heroRef}>
      <ParticleBackground />

      {/* Navigation */}
      <nav className="landing-nav landing-nav-light">
        <div className="nav-brand">
          <span className="nav-logo">📬</span>
          <span className="nav-name">PriorityPush</span>
          <span className="beta-badge">Beta</span>
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#faq">FAQ</a>
          <button className="nav-login-btn" onClick={() => navigate('/dashboard')}>
            Login →
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section hero-light">
        <div className="hero-badge hero-badge-light">
          <span className="pulse-dot" /> Currently in Testing Phase
        </div>
        <h1 className="hero-title hero-title-light">
          Never miss an
          <br />
          <span className="hero-gradient">important email</span>
          <br />
          again.
        </h1>
        <p className="hero-subtitle hero-subtitle-light">
          Real-time Telegram alerts for Gmail. Built exclusively for
          <strong> JECRC University</strong> students.
          <br />
          Transparent rules, not black-box AI.
        </p>
        <div className="hero-cta">
          <EmailCaptureForm lightMode />
        </div>
        <p className="hero-login-link">
          Already have an account?{' '}
          <button onClick={() => navigate('/dashboard')} className="inline-login-link">
            Connect your email →
          </button>
        </p>
        <div className="hero-social-proof hero-social-proof-light">
          <div className="avatar-stack">
            <div className="avatar" style={{ background: '#3b82f6' }}>P</div>
            <div className="avatar" style={{ background: '#8b5cf6' }}>A</div>
            <div className="avatar" style={{ background: '#06b6d4' }}>S</div>
            <div className="avatar" style={{ background: '#f59e0b' }}>R</div>
          </div>
          {/* <span>
            Trusted by <strong>100+</strong> JECRC students
          </span> */}
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="features-section" id="features">
        <h2 className="section-title section-title-light">
          Why <span className="text-gradient">PriorityPush</span>?
        </h2>
        <p className="section-subtitle section-subtitle-light">
          Stop drowning in inbox noise. Start knowing what matters.
        </p>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="feature-card feature-card-light glass-card-light">
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} className="how-it-works-section" id="how-it-works">
        <h2 className="section-title section-title-light">
          Up and running in <span className="text-gradient">30 seconds</span>
        </h2>
        <div className="steps-grid">
          <div className="step-card step-card-light glass-card-light">
            <div className="step-number">1</div>
            <h3>Connect Gmail</h3>
            <p>One-click Google OAuth. Read-only access — we can't send or delete anything.</p>
          </div>
          <div className="step-connector step-connector-light">→</div>
          <div className="step-card step-card-light glass-card-light">
            <div className="step-number">2</div>
            <h3>Link Telegram</h3>
            <p>Send one message to our bot. Instant push notifications, right in your pocket.</p>
          </div>
          <div className="step-connector step-connector-light">→</div>
          <div className="step-card step-card-light glass-card-light">
            <div className="step-number">3</div>
            <h3>Set Rules</h3>
            <p>Customize what's important. Or use our pre-built rules for placement, exams, and more.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaRef} className="cta-section">
        <div className="cta-box cta-box-light glass-card-light">
          <h2>Ready to take control of your inbox?</h2>
          <p>
            Join the waitlist. Be the first to know when PriorityPush opens up.
          </p>
          <EmailCaptureForm lightMode />
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection lightMode />

      {/* Footer */}
      <footer className="landing-footer landing-footer-light">
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
