import { insertFeedFetchCache, listEnabledFeeds } from '../lib/db';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

function ttlHoursForStatus(status: number): number {
  return status >= 200 && status < 300 ? 24 : 2;
}

function addHours(iso: string, hours: number): string {
  const dt = new Date(iso);
  dt.setUTCHours(dt.getUTCHours() + hours);
  return dt.toISOString();
}

export async function runFeedFetchStage(db: D1Database, r2: R2Bucket): Promise<{ fetched: number; failed: number }> {
  const feeds = await listEnabledFeeds(db);
  let fetched = 0;
  let failed = 0;

  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          'user-agent': 'FreedomTimes-CultAgent/0.1',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1',
        },
      });

      const body = await response.text();
      const fetchedAt = new Date().toISOString();
      const status = response.status;

      const cacheKey = await sha256Hex(feed.url);
      const r2Key = `feeds/${cacheKey}.xml`;

      // Store XML in R2
      await r2.put(r2Key, body);

      await insertFeedFetchCache(db, {
        cacheKey,
        requestUrl: feed.url,
        finalUrl: response.url,
        status,
        fetchedAt,
        expiresAt: addHours(fetchedAt, ttlHoursForStatus(status)),
        contentType: response.headers.get('content-type'),
        r2Key,
      });

      if (status >= 200 && status < 300) {
        fetched += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { fetched, failed };
}
