import type { CandidateInsert, FeedRow, RunStatus } from '../types';

export async function createRun(db: D1Database, runId: string): Promise<void> {
  await db
    .prepare('INSERT INTO runs (id, status, current_stage) VALUES (?, ?, ?)')
    .bind(runId, 'started', 'feed_fetch')
    .run();
}

export async function setRunStatus(db: D1Database, runId: string, status: RunStatus, stage: string): Promise<void> {
  await db
    .prepare('UPDATE runs SET status = ?, current_stage = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(status, stage, runId)
    .run();
}

export async function listEnabledFeeds(db: D1Database): Promise<FeedRow[]> {
  const result = await db
    .prepare('SELECT id, title, url, source_format, source_category, language, requires_url_resolution, enabled FROM feeds WHERE enabled = 1 ORDER BY id')
    .all<FeedRow>();
  return result.results ?? [];
}

export async function insertFeedFetchCache(
  db: D1Database,
  input: {
    requestUrl: string;
    finalUrl: string;
    status: number;
    fetchedAt: string;
    expiresAt: string;
    contentType: string | null;
    body: string;
    bodySha256: string;
    cacheKey: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO http_cache_entries
       (cache_key, request_url, final_url, status, fetched_at, expires_at, content_type, body, body_sha256, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      input.cacheKey,
      input.requestUrl,
      input.finalUrl,
      input.status,
      input.fetchedAt,
      input.expiresAt,
      input.contentType,
      input.body,
      input.bodySha256,
    )
    .run();
}

export async function insertCandidates(db: D1Database, items: CandidateInsert[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const stmt = db.prepare(
    `INSERT INTO candidates
      (run_id, raw_url, title, pub_date, feed_id, source_language, requires_url_resolution, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  );

  const batch = items.map((item) =>
    stmt.bind(
      item.runId,
      item.rawUrl,
      item.title,
      item.pubDate,
      item.feedId,
      item.sourceLanguage,
      item.requiresUrlResolution,
    ),
  );

  await db.batch(batch);
}

export async function getRunSummary(db: D1Database, runId: string): Promise<Record<string, unknown>> {
  const run = await db.prepare('SELECT id, status, current_stage, started_at, updated_at, error FROM runs WHERE id = ?').bind(runId).first();
  const feedFetchCount = await db.prepare('SELECT COUNT(*) as count FROM http_cache_entries').first<{ count: number }>();
  const candidateCount = await db.prepare('SELECT COUNT(*) as count FROM candidates WHERE run_id = ?').bind(runId).first<{ count: number }>();

  return {
    run,
    stageMetrics: {
      feedFetchRows: feedFetchCount?.count ?? 0,
      candidateRows: candidateCount?.count ?? 0,
    },
  };
}

export async function recordStageReview(
  db: D1Database,
  input: {
    runId: string;
    stage: string;
    signal: 'approve' | 'reject';
    notes: string | null;
    reviewedBy: string | null;
  },
): Promise<void> {
  await db
    .prepare('INSERT INTO stage_reviews (run_id, stage, signal, notes, reviewed_by) VALUES (?, ?, ?, ?, ?)')
    .bind(input.runId, input.stage, input.signal, input.notes, input.reviewedBy)
    .run();
}

export async function purgeExpiredHttpCache(db: D1Database, nowIso: string): Promise<number> {
  const result = await db.prepare('DELETE FROM http_cache_entries WHERE expires_at <= ?').bind(nowIso).run();
  return Number(result.meta.changes ?? 0);
}
