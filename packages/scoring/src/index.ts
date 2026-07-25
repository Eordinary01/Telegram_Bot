export {
  extractSenderDomain,
  isAllowedSender,
  checkSenderDomain,
} from './domain-filter.js';

export {
  scoreEmail,
  classifyPriority,
  loadSenderRules,
  loadKeywordRules,
  PRIORITY_LABELS,
  type ScoringResult,
  type PriorityLabel,
  type SenderRuleEntry,
  type KeywordRuleEntry,
} from './scoring-engine.js';
