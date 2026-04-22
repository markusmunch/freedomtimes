import { Agent, callable } from 'agents';
import type { Env, StageName } from './types';
import {
  createRun,
  getRunSummary,
  purgeExpiredHttpCache,
  recordStageReview,
  setRunStatus,
} from './lib/db';
import { runFeedFetchStage } from './stages/feedFetch';
import { runCandidateExtractStage } from './stages/candidateExtract';

type AgentState = {
  activeRunId: string | null;
};

type StageTransition = {
  current: StageName;
  next: StageName | null;
};

const STAGE_FLOW: Record<StageName, StageTransition> = {
  feed_fetch: {
    current: 'feed_fetch',
    next: 'candidate_extract',
  },
  candidate_extract: {
    current: 'candidate_extract',
    next: null,
  },
};

export class CultAgentOrchestrator extends Agent<Env, AgentState> {
  initialState: AgentState = { activeRunId: null };

  private async runSingleStage(runId: string, stage: StageName): Promise<Record<string, unknown>> {
    if (stage === 'feed_fetch') {
      const metrics = await runFeedFetchStage(this.env.AGENT_DB);
      await setRunStatus(this.env.AGENT_DB, runId, 'awaiting_review_feed_fetch', stage);
      return { stage, ...metrics };
    }

    const metrics = await runCandidateExtractStage(this.env.AGENT_DB, runId);
    await setRunStatus(this.env.AGENT_DB, runId, 'awaiting_review_candidate_extract', stage);
    return { stage, ...metrics };
  }

  @callable()
  async startRun(): Promise<Record<string, unknown>> {
    const runId = new Date().toISOString();

    const stageResult = await this.runFiber(`start-run:${runId}`, async (ctx) => {
      await createRun(this.env.AGENT_DB, runId);
      const purged = await purgeExpiredHttpCache(this.env.AGENT_DB, new Date().toISOString());
      const stage = await this.runSingleStage(runId, 'feed_fetch');
      ctx.stash({ runId, stage: 'feed_fetch' });
      return { purgedExpiredHttpCache: purged, stage };
    });

    this.setState({ activeRunId: runId });
    return { runId, ...stageResult };
  }

  @callable()
  async listRuns(): Promise<Record<string, unknown>> {
    const rows = await this.env.AGENT_DB
      .prepare('SELECT id, status, current_stage, started_at, updated_at, error FROM runs ORDER BY started_at DESC LIMIT 50')
      .all();

    return { runs: rows.results ?? [] };
  }

  @callable()
  async getRun(runId: string): Promise<Record<string, unknown>> {
    return getRunSummary(this.env.AGENT_DB, runId);
  }

  @callable()
  async rejectStage(runId: string, stage: StageName, notes: string | null, reviewedBy: string | null): Promise<Record<string, unknown>> {
    await recordStageReview(this.env.AGENT_DB, {
      runId,
      stage,
      signal: 'reject',
      notes,
      reviewedBy,
    });

    await setRunStatus(this.env.AGENT_DB, runId, 'failed', stage);
    return { runId, stage, signal: 'reject', status: 'failed' };
  }

  @callable()
  async approveStage(runId: string, stage: StageName, notes: string | null, reviewedBy: string | null): Promise<Record<string, unknown>> {
    await recordStageReview(this.env.AGENT_DB, {
      runId,
      stage,
      signal: 'approve',
      notes,
      reviewedBy,
    });

    const transition = STAGE_FLOW[stage];
    if (!transition.next) {
      await setRunStatus(this.env.AGENT_DB, runId, 'published_draft', stage);
      return { runId, stage, signal: 'approve', status: 'published_draft' };
    }

    const nextStage = transition.next;
    const stageResult = await this.runFiber(`approve:${runId}:${stage}`, async (ctx) => {
      const result = await this.runSingleStage(runId, nextStage);
      ctx.stash({ runId, stage: nextStage });
      return result;
    });

    return {
      runId,
      signal: 'approve',
      advancedTo: nextStage,
      stageResult,
    };
  }
}
