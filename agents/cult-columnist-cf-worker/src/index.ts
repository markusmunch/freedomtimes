import { getAgentByName, routeAgentRequest } from 'agents';
import type { Env } from './types';
import { requireEditor } from './lib/auth';
import {
  getFeedFetchCacheEntryById,
  getFeedFetchCacheEntryByRequestUrl,
  getFeedFetchResults,
  getStageEvents,
} from './lib/db';
import { createFetchHandler, type FetchDeps } from './httpHandler';
import { CultAgentOrchestrator } from './orchestrator';

export { CultAgentOrchestrator };

const defaultFetchDeps: FetchDeps = {
  routeRequest: routeAgentRequest,
  getAgent: (env) => getAgentByName<Env, CultAgentOrchestrator>(env.ORCHESTRATOR, 'global'),
  requireEditor,
  getStageEvents,
  getFeedFetchResults,
  getFeedFetchCacheEntryByRequestUrl,
  getFeedFetchCacheEntryById,
};

export { createFetchHandler };

export default {
  fetch: createFetchHandler(defaultFetchDeps),
};
