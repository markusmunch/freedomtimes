import type { RelevanceResult } from './types.js';
import { ALL_CULT_TERMS } from './cultTerms.js';

const STRONG_CULT_KEYWORDS = ALL_CULT_TERMS;

const UK_TERMS = ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'london'];

const EUROPE_TERMS = [
  'europe',
  'european',
  'france',
  'germany',
  'spain',
  'italy',
  'netherlands',
  'belgium',
  'sweden',
  'norway',
  'denmark',
  'ireland',
  'poland',
  'romania',
  'portugal',
  'greece',
  'czech republic',
  'austria',
  'finland',
  'switzerland',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = escapeRegExp(phrase.toLowerCase());
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(text);
}

function includesAnyPhrase(text: string, terms: string[]): boolean {
  return terms.some((term) => containsPhrase(text, term));
}

export function evaluateRelevance(rawText: string): RelevanceResult {
  const text = rawText.toLowerCase();
  const reasons: string[] = [];
  let confidence = 0;

  const hasCultSignal = includesAnyPhrase(text, STRONG_CULT_KEYWORDS);
  if (hasCultSignal) {
    confidence += 60;
    reasons.push('Strong cult-related keywords detected');
  } else {
    reasons.push('No strong cult-related keywords detected');
  }

  const hasUkSignal = includesAnyPhrase(text, UK_TERMS);
  const hasEuropeSignal = includesAnyPhrase(text, EUROPE_TERMS);

  if (hasUkSignal) {
    confidence += 30;
    reasons.push('UK geographic signal detected');
  }

  if (hasEuropeSignal) {
    confidence += 25;
    reasons.push('Europe geographic signal detected');
  }

  let region: 'UK' | 'Europe' | 'Unknown' = 'Unknown';
  if (hasUkSignal) {
    region = 'UK';
  } else if (hasEuropeSignal) {
    region = 'Europe';
  }

  const accepted = hasCultSignal && region !== 'Unknown' && confidence >= 75;

  return {
    accepted,
    region,
    confidence: Math.min(100, confidence),
    reasons,
  };
}
