/**
 * Role definitions and their priority rule presets for PriorityPush.
 *
 * Each role has a label, description, and a set of pre-configured sender rules
 * and keyword rules that get seeded as userId-scoped rules when the user selects
 * that role during onboarding.
 *
 * Roles are intentionally generic (not college-specific) so the system works
 * for any user regardless of their email domain.
 *
 * ROLES:
 *   student      — placement, exams, deadlines, scholarships
 *   teacher      — meetings, timetables, exam duty, research, circulars
 *   businessman  — proposals, invoices, contracts, partnerships, payments
 *   freelancer   — projects, deliverables, deadlines, payments, client comms
 *   developer    — deployments, incidents, security advisories, code reviews
 *   other        — minimal starter set (urgent + action required keywords)
 */

export type Role = 'student' | 'teacher' | 'businessman' | 'freelancer' | 'developer' | 'other';

export interface RolePreset {
  label: string;
  description: string;
  senderRules: { domain: string; label: string; weight: number }[];
  keywordRules: { keyword: string; weight: number; category: string; matchField: 'subject' | 'snippet' | 'any' }[];
}

export const ROLE_PRESETS: Record<Role, RolePreset> = {
  student: {
    label: 'Student',
    description: 'Placement drives, exam schedules, fee deadlines, scholarship alerts — campus life, prioritized.',
    senderRules: [
      { domain: 'placement@jecrcu.edu.in', label: 'Placement cell', weight: 30 },
      { domain: 'examcell@jecrcu.edu.in', label: 'Exam department', weight: 25 },
      { domain: 'academics@jecrcu.edu.in', label: 'Academics office', weight: 20 },
      { domain: 'hod@jecrcu.edu.in', label: 'HOD / department head', weight: 25 },
      { domain: 'scholarship@jecrcu.edu.in', label: 'Scholarship cell', weight: 20 },
      { domain: 'library@jecrcu.edu.in', label: 'Library notices', weight: 10 },
      { domain: 'hostel@jecrcu.edu.in', label: 'Hostel / residential', weight: 10 },
      { domain: 'nptel@jecrcu.edu.in', label: 'NPTEL / online courses', weight: 15 },
    ],
    keywordRules: [
      { keyword: 'placement', weight: 20, category: 'placement', matchField: 'subject' },
      { keyword: 'campus drive', weight: 25, category: 'placement', matchField: 'any' },
      { keyword: 'job offer', weight: 30, category: 'placement', matchField: 'subject' },
      { keyword: 'interview', weight: 20, category: 'placement', matchField: 'subject' },
      { keyword: 'recruitment', weight: 20, category: 'placement', matchField: 'subject' },
      { keyword: 'company visit', weight: 20, category: 'placement', matchField: 'any' },
      { keyword: 'exam', weight: 20, category: 'exam', matchField: 'subject' },
      { keyword: 'midterm', weight: 20, category: 'exam', matchField: 'subject' },
      { keyword: 'semester exam', weight: 25, category: 'exam', matchField: 'subject' },
      { keyword: 'results', weight: 20, category: 'exam', matchField: 'subject' },
      { keyword: 'grade', weight: 15, category: 'exam', matchField: 'subject' },
      { keyword: 'marksheet', weight: 15, category: 'exam', matchField: 'subject' },
      { keyword: 'deadline', weight: 20, category: 'deadline', matchField: 'subject' },
      { keyword: 'last date', weight: 20, category: 'deadline', matchField: 'subject' },
      { keyword: 'registration', weight: 15, category: 'deadline', matchField: 'subject' },
      { keyword: 'fee payment', weight: 20, category: 'finance', matchField: 'any' },
      { keyword: 'scholarship', weight: 20, category: 'scholarship', matchField: 'subject' },
      { keyword: 'nptel', weight: 15, category: 'courses', matchField: 'subject' },
      { keyword: 'certificate', weight: 15, category: 'courses', matchField: 'subject' },
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'important', weight: 20, category: 'urgency', matchField: 'subject' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    ],
  },

  teacher: {
    label: 'Teacher / Faculty',
    description: 'Meeting invites, timetable changes, exam duty rosters, circulars, research correspondence.',
    senderRules: [
      { domain: 'hod@jecrcu.edu.in', label: 'HOD office', weight: 25 },
      { domain: 'examcell@jecrcu.edu.in', label: 'Exam cell', weight: 20 },
      { domain: 'placement@jecrcu.edu.in', label: 'Placement cell', weight: 15 },
      { domain: 'admin@jecrcu.edu.in', label: 'Administration', weight: 15 },
      { domain: 'academic@jecrcu.edu.in', label: 'Academic affairs', weight: 15 },
      { domain: 'nptel@jecrcu.edu.in', label: 'NPTEL coordinator', weight: 10 },
    ],
    keywordRules: [
      { keyword: 'meeting', weight: 15, category: 'meetings', matchField: 'subject' },
      { keyword: 'timetable', weight: 20, category: 'schedule', matchField: 'subject' },
      { keyword: 'duty roster', weight: 20, category: 'schedule', matchField: 'subject' },
      { keyword: 'exam duty', weight: 25, category: 'exam', matchField: 'subject' },
      { keyword: 'evaluation', weight: 15, category: 'exam', matchField: 'subject' },
      { keyword: 'result submission', weight: 25, category: 'exam', matchField: 'subject' },
      { keyword: 'circular', weight: 15, category: 'circulars', matchField: 'subject' },
      { keyword: 'notice', weight: 15, category: 'circulars', matchField: 'subject' },
      { keyword: 'workshop', weight: 15, category: 'events', matchField: 'subject' },
      { keyword: 'seminar', weight: 15, category: 'events', matchField: 'subject' },
      { keyword: 'conference', weight: 15, category: 'events', matchField: 'subject' },
      { keyword: 'research', weight: 20, category: 'research', matchField: 'subject' },
      { keyword: 'publication', weight: 20, category: 'research', matchField: 'subject' },
      { keyword: 'grant', weight: 20, category: 'research', matchField: 'subject' },
      { keyword: 'proposal', weight: 20, category: 'research', matchField: 'subject' },
      { keyword: 'hod', weight: 20, category: 'administration', matchField: 'subject' },
      { keyword: 'dept meeting', weight: 15, category: 'meetings', matchField: 'subject' },
      { keyword: 'staff meeting', weight: 15, category: 'meetings', matchField: 'subject' },
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'important', weight: 20, category: 'urgency', matchField: 'subject' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    ],
  },

  businessman: {
    label: 'Business / Professional',
    description: 'Client proposals, invoices, contracts, partnership offers, market updates — work-critical mail surfaced.',
    senderRules: [
      { domain: 'invoices@company.com', label: 'Accounts payable', weight: 25 },
      { domain: 'clients@company.com', label: 'Client communications', weight: 30 },
      { domain: 'legal@company.com', label: 'Legal / compliance', weight: 25 },
      { domain: 'partners@company.com', label: 'Partnership office', weight: 20 },
      { domain: 'support@company.com', label: 'Customer support', weight: 10 },
    ],
    keywordRules: [
      { keyword: 'proposal', weight: 25, category: 'business', matchField: 'subject' },
      { keyword: 'quote', weight: 20, category: 'business', matchField: 'subject' },
      { keyword: 'invoice', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'payment', weight: 20, category: 'finance', matchField: 'subject' },
      { keyword: 'due date', weight: 20, category: 'finance', matchField: 'subject' },
      { keyword: 'contract', weight: 30, category: 'legal', matchField: 'subject' },
      { keyword: 'agreement', weight: 25, category: 'legal', matchField: 'subject' },
      { keyword: 'partnership', weight: 25, category: 'partnership', matchField: 'subject' },
      { keyword: 'meeting', weight: 15, category: 'meetings', matchField: 'subject' },
      { keyword: 'pitch', weight: 25, category: 'business', matchField: 'subject' },
      { keyword: 'investment', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'funding', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'deadline', weight: 20, category: 'deadline', matchField: 'subject' },
      { keyword: 'last date', weight: 20, category: 'deadline', matchField: 'subject' },
      { keyword: 'registration', weight: 15, category: 'deadline', matchField: 'subject' },
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'important', weight: 20, category: 'urgency', matchField: 'subject' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    ],
  },

  freelancer: {
    label: 'Freelancer / Gig Worker',
    description: 'Client briefs, project deadlines, invoice reminders, platform updates — income-critical mail, prioritized.',
    senderRules: [
      { domain: 'clients@company.com', label: 'Client communications', weight: 30 },
      { domain: 'payments@platform.com', label: 'Payment / escrow', weight: 25 },
      { domain: 'support@platform.com', label: 'Platform support', weight: 10 },
      { domain: 'notifications@platform.com', label: 'Platform notifications', weight: 15 },
    ],
    keywordRules: [
      { keyword: 'project', weight: 20, category: 'work', matchField: 'subject' },
      { keyword: 'brief', weight: 25, category: 'work', matchField: 'subject' },
      { keyword: 'deliverable', weight: 25, category: 'work', matchField: 'subject' },
      { keyword: 'milestone', weight: 20, category: 'work', matchField: 'subject' },
      { keyword: 'deadline', weight: 30, category: 'deadline', matchField: 'subject' },
      { keyword: 'last date', weight: 25, category: 'deadline', matchField: 'subject' },
      { keyword: 'invoice', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'payment', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'escrow', weight: 25, category: 'finance', matchField: 'subject' },
      { keyword: 'milestone payment', weight: 30, category: 'finance', matchField: 'subject' },
      { keyword: 'contract', weight: 30, category: 'legal', matchField: 'subject' },
      { keyword: 'scope', weight: 15, category: 'work', matchField: 'subject' },
      { keyword: 'feedback', weight: 15, category: 'work', matchField: 'subject' },
      { keyword: 'revision', weight: 15, category: 'work', matchField: 'subject' },
      { keyword: 'approved', weight: 20, category: 'approval', matchField: 'subject' },
      { keyword: 'rejected', weight: 20, category: 'rejection', matchField: 'subject' },
      { keyword: 'proposal', weight: 25, category: 'work', matchField: 'subject' },
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'asap', weight: 25, category: 'urgency', matchField: 'any' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    ],
  },

  developer: {
    label: 'Developer / Engineer',
    description: 'Deployment alerts, code reviews, incident reports, security advisories, pull requests — ship-critical mail, amplified.',
    senderRules: [
      { domain: 'ci@company.com', label: 'CI/CD pipeline', weight: 25 },
      { domain: 'deploy@company.com', label: 'Deployment system', weight: 25 },
      { domain: 'incidents@company.com', label: 'Incident / on-call', weight: 30 },
      { domain: 'security@company.com', label: 'Security advisories', weight: 30 },
      { domain: 'github@github.com', label: 'GitHub notifications', weight: 15 },
      { domain: 'releases@company.com', label: 'Release announcements', weight: 15 },
    ],
    keywordRules: [
      { keyword: 'deployment', weight: 25, category: 'deploy', matchField: 'subject' },
      { keyword: 'deployed', weight: 25, category: 'deploy', matchField: 'subject' },
      { keyword: 'build failed', weight: 30, category: 'ci', matchField: 'subject' },
      { keyword: 'pipeline failed', weight: 30, category: 'ci', matchField: 'subject' },
      { keyword: 'incident', weight: 30, category: 'incident', matchField: 'subject' },
      { keyword: 'outage', weight: 30, category: 'incident', matchField: 'subject' },
      { keyword: 'downtime', weight: 25, category: 'incident', matchField: 'subject' },
      { keyword: 'on-call', weight: 25, category: 'incident', matchField: 'subject' },
      { keyword: 'pager', weight: 30, category: 'incident', matchField: 'subject' },
      { keyword: 'security', weight: 30, category: 'security', matchField: 'subject' },
      { keyword: 'vulnerability', weight: 30, category: 'security', matchField: 'subject' },
      { keyword: 'advisory', weight: 25, category: 'security', matchField: 'subject' },
      { keyword: 'patch', weight: 20, category: 'security', matchField: 'subject' },
      { keyword: 'pr', weight: 15, category: 'code', matchField: 'subject' },
      { keyword: 'pull request', weight: 15, category: 'code', matchField: 'subject' },
      { keyword: 'code review', weight: 15, category: 'code', matchField: 'subject' },
      { keyword: 'merge', weight: 15, category: 'code', matchField: 'subject' },
      { keyword: 'release', weight: 15, category: 'release', matchField: 'subject' },
      { keyword: 'changelog', weight: 15, category: 'release', matchField: 'subject' },
      { keyword: 'hotfix', weight: 25, category: 'deploy', matchField: 'subject' },
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    ],
  },

  other: {
    label: 'Other',
    description: 'Start with a minimal rule set and build your own. You can customize everything from the Rules panel.',
    senderRules: [],
    keywordRules: [
      { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'important', weight: 20, category: 'urgency', matchField: 'subject' },
      { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
      { keyword: 'deadline', weight: 20, category: 'deadline', matchField: 'subject' },
      { keyword: 'meeting', weight: 15, category: 'meetings', matchField: 'subject' },
    ],
  },
};

/**
 * List of all available roles in the order they should appear in the picker.
 */
export const AVAILABLE_ROLES: Role[] = [
  'student',
  'teacher',
  'businessman',
  'freelancer',
  'developer',
  'other',
];

/**
 * Valid roles set for validation.
 */
export const VALID_ROLES = new Set(AVAILABLE_ROLES);
