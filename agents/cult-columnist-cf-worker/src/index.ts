import { getAgentByName, routeAgentRequest } from 'agents';
import type { Env, StageName } from './types';
import { requireEditor } from './lib/auth';
import { CultAgentOrchestrator } from './orchestrator';

export { CultAgentOrchestrator };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseRunId(pathname: string): string | null {
  const m = pathname.match(/^\/runs\/([^/]+)$/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function parseStageAction(pathname: string): { runId: string; stage: StageName; action: 'approve' | 'reject' } | null {
  const m = pathname.match(/^\/runs\/([^/]+)\/stages\/([^/]+)\/(approve|reject)$/i);
  if (!m || !m[1] || !m[2] || !m[3]) {
    return null;
  }

  const stageRaw = m[2].toLowerCase();
  if (stageRaw !== 'feed_fetch' && stageRaw !== 'candidate_extract') {
    return null;
  }

  return {
    runId: decodeURIComponent(m[1]),
    stage: stageRaw,
    action: m[3].toLowerCase() as 'approve' | 'reject',
  };
}

function isProtectedOperationalEndpoint(pathname: string, method: string): boolean {
  if (pathname === '/runs/start' && method === 'POST') {
    return true;
  }

  if (pathname === '/runs' && method === 'GET') {
    return true;
  }

  if (pathname.startsWith('/runs/') && method === 'GET') {
    return true;
  }

  if (pathname.includes('/stages/') && method === 'POST') {
    return true;
  }

  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await routeAgentRequest(request, env);
    if (routed) {
      return routed;
    }

    try {
      const pathname = new URL(request.url).pathname;
      const agent = await getAgentByName<Env, CultAgentOrchestrator>(env.ORCHESTRATOR, 'global');
      const needsAuth = isProtectedOperationalEndpoint(pathname, request.method);

      if (!needsAuth && pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, runtime: 'agents-sdk' });
      }

      let reviewedBy: string | null = null;
      if (needsAuth) {
        const payload = await requireEditor(request, env);
        reviewedBy = typeof payload.sub === 'string' ? payload.sub : null;
      }

      if (pathname === '/runs/start' && request.method === 'POST') {
        const result = await agent.startRun();
        return json(result, 202);
      }

      if (pathname === '/runs' && request.method === 'GET') {
        const result = await agent.listRuns();
        return json(result);
      }

      if (pathname.startsWith('/runs/') && request.method === 'GET') {
        const runId = parseRunId(pathname);
        if (!runId) {
          return json({ error: 'Invalid run path' }, 400);
        }
        const result = await agent.getRun(runId);
        return json(result);
      }

      if (pathname.includes('/stages/') && request.method === 'POST') {
        const parsed = parseStageAction(pathname);
        if (!parsed) {
          return json({ error: 'Invalid stage path' }, 400);
        }

        const body = (await request.json().catch(() => ({}))) as { notes?: unknown };
        const notes = typeof body.notes === 'string' ? body.notes : null;

        if (parsed.action === 'approve') {
          const result = await agent.approveStage(parsed.runId, parsed.stage, notes, reviewedBy);
          return json(result, 202);
        }

        const result = await agent.rejectStage(parsed.runId, parsed.stage, notes, reviewedBy);
        return json(result, 202);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }
  },
};
