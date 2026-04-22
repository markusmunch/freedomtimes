import { insertCandidates, listEnabledFeeds } from '../lib/db';
import { parseFeedItems } from '../lib/rss';

export async function runCandidateExtractStage(db: D1Database, runId: string): Promise<{ inserted: number }> {
  const feeds = await listEnabledFeeds(db);
  let inserted = 0;

  for (const feed of feeds) {
    const cacheEntry = await db
      .prepare(
        `SELECT body, status
         FROM http_cache_entries
         WHERE request_url = ? AND expires_at > datetime('now')
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .bind(feed.url)
      .first<{ body: string; status: number }>();

    if (!cacheEntry || cacheEntry.status < 200 || cacheEntry.status >= 300) {
      continue;
    }

    const items = parseFeedItems(cacheEntry.body)
      .filter((item) => item.url.startsWith('http://') || item.url.startsWith('https://'))
      .map((item) => ({
        runId,
        feedId: feed.id,
        sourceLanguage: feed.language,
        rawUrl: item.url,
        title: item.title,
        pubDate: item.pubDate,
        requiresUrlResolution: feed.requires_url_resolution,
      }));

    await insertCandidates(db, items);
    inserted += items.length;
  }

  return { inserted };
}
