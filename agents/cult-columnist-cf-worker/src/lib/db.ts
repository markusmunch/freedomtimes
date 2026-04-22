import type { CandidateInsert, FeedRow, RunStatus } from '../types';
import { describeDynamicSourceFromUrl } from './dynamicSources';

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
    r2Key: string;
    cacheKey: string;
    bodySha256: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO http_cache_entries
       (cache_key, request_url, final_url, status, fetched_at, expires_at, content_type, r2_key, body_sha256, updated_at)
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
      input.r2Key,
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

export async function deleteRunData(
  db: D1Database,
  runId: string,
): Promise<{
  existed: boolean;
  articleR2Keys: string[];
  deletedCandidates: number;
  deletedReviews: number;
  deletedLogs: number;
  deletedGroups: number;
  deletedRuns: number;
}> {
  const existingRun = await db.prepare('SELECT id FROM runs WHERE id = ?').bind(runId).first<{ id: string }>();
  if (!existingRun) {
    return {
      existed: false,
      articleR2Keys: [],
      deletedCandidates: 0,
      deletedReviews: 0,
      deletedLogs: 0,
      deletedGroups: 0,
      deletedRuns: 0,
    };
  }

  const articleRows = await db
    .prepare(
      `SELECT DISTINCT article_r2_key
       FROM candidates
       WHERE run_id = ?
         AND article_r2_key IS NOT NULL
         AND TRIM(article_r2_key) != ''`,
    )
    .bind(runId)
    .all<{ article_r2_key: string }>();

  const articleR2Keys = (articleRows.results ?? []).map((row) => row.article_r2_key).filter(Boolean);

  const deletedLogs = await db.prepare('DELETE FROM stage_logs WHERE run_id = ?').bind(runId).run();
  const deletedReviews = await db.prepare('DELETE FROM stage_reviews WHERE run_id = ?').bind(runId).run();
  const deletedCandidates = await db.prepare('DELETE FROM candidates WHERE run_id = ?').bind(runId).run();
  const deletedGroups = await db.prepare('DELETE FROM story_groups WHERE run_id = ?').bind(runId).run();
  const deletedRuns = await db.prepare('DELETE FROM runs WHERE id = ?').bind(runId).run();

  return {
    existed: true,
    articleR2Keys,
    deletedCandidates: Number(deletedCandidates.meta.changes ?? 0),
    deletedReviews: Number(deletedReviews.meta.changes ?? 0),
    deletedLogs: Number(deletedLogs.meta.changes ?? 0),
    deletedGroups: Number(deletedGroups.meta.changes ?? 0),
    deletedRuns: Number(deletedRuns.meta.changes ?? 0),
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

export async function logStageEvent(
  db: D1Database,
  input: {
    runId: string;
    stage: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const id = `${input.runId}:${input.stage}:${new Date().getTime()}:${Math.random().toString(36).slice(2, 9)}`;
  await db
    .prepare(
      `INSERT INTO stage_logs (id, run_id, stage, level, message, data, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      id,
      input.runId,
      input.stage,
      input.level,
      input.message,
      input.data ? JSON.stringify(input.data) : null,
    )
    .run();
}

export type FeedFetchResult = {
  feed_id: string;
  feed_title: string;
  feed_url: string;
  source_category: string;
  language: string;
  status: number | null;
  fetched_at: string | null;
  expires_at: string | null;
  content_type: string | null;
  r2_key: string | null;
};

export type FeedFetchCacheEntry = {
  feed_id: string;
  feed_title: string;
  feed_url: string;
  content_type: string | null;
  r2_key: string | null;
  fetched_at: string | null;
};

export async function getFeedFetchResults(db: D1Database): Promise<FeedFetchResult[]> {
  const staticResult = await db
    .prepare(
      `SELECT
         f.id          AS feed_id,
         f.title       AS feed_title,
         f.url         AS feed_url,
         f.source_category,
         f.language,
         h.status,
         h.fetched_at,
         h.expires_at,
         h.content_type,
         h.r2_key
       FROM feeds f
       LEFT JOIN http_cache_entries h ON h.request_url = f.url
       WHERE f.enabled = 1
       ORDER BY
         CASE WHEN h.status IS NULL THEN 999
              WHEN h.status >= 200 AND h.status < 300 THEN 0
              ELSE h.status
         END,
         f.id`,
    )
    .all<FeedFetchResult>();

  const dynamicResult = await db
    .prepare(
      `SELECT request_url, status, fetched_at, expires_at, content_type, r2_key
       FROM http_cache_entries
       WHERE request_url LIKE 'https://news.google.com/rss/search?%'
          OR request_url LIKE 'https://newsdata.io/api/1/latest?%'
       ORDER BY fetched_at DESC`,
    )
    .all<{
      request_url: string;
      status: number | null;
      fetched_at: string | null;
      expires_at: string | null;
      content_type: string | null;
      r2_key: string | null;
    }>();

  const dynamicRows: FeedFetchResult[] = (dynamicResult.results ?? [])
    .map((row) => {
      const source = describeDynamicSourceFromUrl(row.request_url);
      if (!source) {
        return null;
      }

      return {
        feed_id: source.id,
        feed_title: source.title,
        feed_url: source.url,
        source_category: source.sourceCategory,
        language: source.language,
        status: row.status,
        fetched_at: row.fetched_at,
        expires_at: row.expires_at,
        content_type: row.content_type,
        r2_key: row.r2_key,
      };
    })
    .filter((row): row is FeedFetchResult => row !== null);

  const allRows = [...(staticResult.results ?? []), ...dynamicRows];
  allRows.sort((a, b) => {
    const rank = (status: number | null): number => {
      if (status === null) return 999;
      if (status >= 200 && status < 300) return 0;
      return status;
    };

    const rankDiff = rank(a.status) - rank(b.status);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.feed_id.localeCompare(b.feed_id);
  });

  return allRows;
}

export async function getFeedFetchCacheEntryById(db: D1Database, feedId: string): Promise<FeedFetchCacheEntry | null> {
  const row = await db
    .prepare(
      `SELECT
         f.id AS feed_id,
         f.title AS feed_title,
         f.url AS feed_url,
         h.content_type,
         h.r2_key,
         h.fetched_at
       FROM feeds f
       LEFT JOIN http_cache_entries h ON h.request_url = f.url
       WHERE f.id = ? AND f.enabled = 1
       LIMIT 1`,
    )
    .bind(feedId)
    .first<FeedFetchCacheEntry>();

  return row ?? null;
}

export async function getFeedFetchCacheEntryByRequestUrl(db: D1Database, requestUrl: string): Promise<FeedFetchCacheEntry | null> {
  const staticRow = await db
    .prepare(
      `SELECT
         f.id AS feed_id,
         f.title AS feed_title,
         f.url AS feed_url,
         h.content_type,
         h.r2_key,
         h.fetched_at
       FROM feeds f
       LEFT JOIN http_cache_entries h ON h.request_url = f.url
       WHERE f.url = ? AND f.enabled = 1
       LIMIT 1`,
    )
    .bind(requestUrl)
    .first<FeedFetchCacheEntry>();

  if (staticRow) {
    return staticRow;
  }

  const dynamicMeta = describeDynamicSourceFromUrl(requestUrl);
  if (!dynamicMeta) {
    return null;
  }

  const cacheRow = await db
    .prepare(
      `SELECT request_url, content_type, r2_key, fetched_at
       FROM http_cache_entries
       WHERE request_url = ?
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .bind(requestUrl)
    .first<{ request_url: string; content_type: string | null; r2_key: string | null; fetched_at: string | null }>();

  if (!cacheRow) {
    return null;
  }

  return {
    feed_id: dynamicMeta.id,
    feed_title: dynamicMeta.title,
    feed_url: requestUrl,
    content_type: cacheRow.content_type,
    r2_key: cacheRow.r2_key,
    fetched_at: cacheRow.fetched_at,
  };
}

export async function getStageEvents(
  db: D1Database,
  runId: string,
): Promise<
  Array<{
    id: string;
    stage: string;
    level: string;
    message: string;
    data: Record<string, unknown> | null;
    logged_at: string;
  }>
> {
  const result = await db
    .prepare('SELECT id, stage, level, message, data, logged_at FROM stage_logs WHERE run_id = ? ORDER BY logged_at ASC')
    .bind(runId)
    .all<{
      id: string;
      stage: string;
      level: string;
      message: string;
      data: string | null;
      logged_at: string;
    }>();

  return (result.results ?? []).map((row) => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : null,
  }));
}
