import { insertCandidates, listEnabledFeeds } from '../lib/db';
import { describeDynamicSourceFromUrl } from '../lib/dynamicSources';
import { parseFeedItems } from '../lib/rss';

export async function runCandidateExtractStage(db: D1Database, r2: R2Bucket, runId: string): Promise<{ inserted: number }> {
  const feeds = await listEnabledFeeds(db);
  let inserted = 0;

  for (const feed of feeds) {
    const cacheEntry = await db
      .prepare(
        `SELECT r2_key, status
         FROM http_cache_entries
         WHERE request_url = ? AND expires_at > datetime('now')
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .bind(feed.url)
      .first<{ r2_key: string; status: number }>();

    if (!cacheEntry || cacheEntry.status < 200 || cacheEntry.status >= 300) {
      continue;
    }

    // Fetch XML from R2
    const xmlObj = await r2.get(cacheEntry.r2_key);
    if (!xmlObj) continue;
    const body = await xmlObj.text();

    const items = parseFeedItems(body)
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

  const dynamicCacheEntries = await db
    .prepare(
      `SELECT request_url, r2_key, status
       FROM http_cache_entries
       WHERE expires_at > datetime('now')
         AND status >= 200
         AND status < 300
         AND (
           request_url LIKE 'https://news.google.com/rss/search?%'
           OR request_url LIKE 'https://newsdata.io/api/1/latest?%'
         )
       ORDER BY fetched_at DESC`,
    )
    .all<{ request_url: string; r2_key: string; status: number }>();

  for (const entry of dynamicCacheEntries.results ?? []) {
    const source = describeDynamicSourceFromUrl(entry.request_url);
    if (!source) {
      continue;
    }

    const xmlObj = await r2.get(entry.r2_key);
    if (!xmlObj) {
      continue;
    }
    const body = await xmlObj.text();

    const items = parseFeedItems(body)
      .filter((item) => item.url.startsWith('http://') || item.url.startsWith('https://'))
      .map((item) => ({
        runId,
        feedId: source.id,
        sourceLanguage: source.language,
        rawUrl: item.url,
        title: item.title,
        pubDate: item.pubDate,
        requiresUrlResolution: source.requiresUrlResolution,
      }));

    await insertCandidates(db, items);
    inserted += items.length;
  }

  return { inserted };
}
