import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

const FAQ_ITEMS = [
  {
    q: 'Do you store my emails?',
    a: 'No. We only sync metadata (sender, subject, snippet) and encrypted OAuth tokens. Your full email content is never stored. You can delete your data anytime.',
  },
  {
    q: 'Why Telegram instead of email or SMS?',
    a: "Telegram is instant, already open on your phone, and more private than SMS. Push notifications arrive in under a second — no polling, no delays.",
  },
  {
    q: 'How is this different from SaneBox or Gmail\'s built-in priority?',
    a: "SaneBox uses opaque ML you can't control. Gmail's Priority Inbox is a black box. PriorityPush gives you transparent, customizable rules — you see exactly WHY every email scored high, and you can change it.",
  },
  {
    q: 'Is my Google account safe?',
    a: "We request read-only access (gmail.readonly) and can't send, delete, or modify any emails. Tokens are encrypted with AES-256-GCM at rest. We never log them.",
  },
  {
    q: 'Which email domains are supported?',
    a: "Currently we support @jecrcu.edu.in for our pilot. We're expanding to more .edu domains soon — join the waitlist to be notified.",
  },
  {
    q: 'Can I customize which emails are important?',
    a: "Absolutely. Add custom keyword rules (e.g., 'placement', 'exam') and sender rules (e.g., 'hod@university.edu.in'). Set impact levels: high, medium, or low.",
  },
];

function FAQItem({ item, index }: { item: (typeof FAQ_ITEMS)[0]; index: number }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && answerRef.current) {
      gsap.fromTo(
        answerRef.current,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.35, ease: 'power2.out' },
      );
    } else if (!open && answerRef.current) {
      gsap.to(answerRef.current, { height: 0, opacity: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [open]);

  return (
    <div
      className={`faq-item ${open ? 'faq-item--open' : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <button className="faq-question" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{item.q}</span>
        <span className="faq-chevron">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div ref={contentRef} className="faq-answer-wrapper">
        <div ref={answerRef} className="faq-answer" style={{ height: 0, opacity: 0, overflow: 'hidden' }}>
          <p>{item.a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.faq-section-title',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
          },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="faq-section" id="faq">
      <h2 className="faq-section-title">Frequently Asked Questions</h2>
      <div className="faq-grid">
        {FAQ_ITEMS.map((item, i) => (
          <FAQItem key={i} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}
