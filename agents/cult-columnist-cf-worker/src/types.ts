import type { AgentNamespace } from 'agents';
import type { CultAgentOrchestrator } from './orchestrator';

export type Env = {
  AGENT_DB: D1Database;
  AGENT_STORE: R2Bucket;
  ORCHESTRATOR: AgentNamespace<CultAgentOrchestrator>;
  AUTH0_DOMAIN: string;
  AUTH0_API_AUDIENCE: string;
  AUTH0_ROLES_CLAIM_NAMESPACE?: string;
};

export type RunStatus =
  | 'started'
  | 'awaiting_review_feed_fetch'
  | 'awaiting_review_candidate_extract'
  | 'failed'
  | 'no_stories'
  | 'published_draft';

export type FeedRow = {
  id: string;
  title: string;
  url: string;
  source_format: string;
  source_category: string;
  language: string;
  requires_url_resolution: number;
  enabled: number;
};

export type CandidateInsert = {
  runId: string;
  feedId: string;
  sourceLanguage: string;
  rawUrl: string;
  title: string | null;
  pubDate: string | null;
  requiresUrlResolution: number;
};

export type StageName = 'feed_fetch' | 'candidate_extract';
