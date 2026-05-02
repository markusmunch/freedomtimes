export type CachedEntry = {
  fetchedAt: string;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  body: string;
};

export type CacheFile = {
  version: 1;
  entries: Record<string, CachedEntry>;
};

export type CachedFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  headers: Record<string, string>;
  text: string;
  fromCache: boolean;
  /** Wall-clock ms for this logical call (cache read is near-instant; network includes retries + backoff). */
  requestDurationMs?: number;
  /** HTTP attempts for the last network round-trip (1 if no retry); 0 on cache hit. */
  networkAttempts?: number;
};
