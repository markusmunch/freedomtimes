import { getAgentByName, routeAgentRequest } from 'agents';
import type { Env } from './types';
import { requireEditor } from './lib/auth';
import { getStageEvents } from './lib/db';
import { createFetchHandler, type FetchDeps } from './httpHandler';
import { CultAgentOrchestrator } from './orchestrator';

export { CultAgentOrchestrator };

const defaultFetchDeps: FetchDeps = {
  routeRequest: routeAgentRequest,
  getAgent: (env) => getAgentByName<Env, CultAgentOrchestrator>(env.ORCHESTRATOR, 'global'),
  requireEditor,
  getStageEvents,
};

export { createFetchHandler };

export default {
  fetch: createFetchHandler(defaultFetchDeps),
};
