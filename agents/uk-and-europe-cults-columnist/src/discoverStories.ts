import { readFileSync } from 'node:fs';
import { ALL_CULT_TERMS, getCultTermsForLanguage } from './cultTerms.js';
import {
  GOOGLE_NEWS_COUNTRY_TERMS,
  GOOGLE_NEWS_GENERIC_QUERIES,
  GOOGLE_NEWS_WATCHLIST_SITES,
  NEWSDATA_COUNTRY_CODES,
  NEWSDATA_LANGUAGES,
  NEWSDATA_QUERIES,
  PRIORITY_WATCHLIST_HOSTS,
  REGION_TERMS,
} from './discoveryConfig.js';

export type DiscoveredStory = {
  url: string;
  title: string;
  discoveryScore?: number;
  discoveryScoreBreakdown?: Record<string, number>;
  sourceFeed: string;
  sourceFormat: 'rss' | 'atom' | 'xml' | 'x' | 'newsio' | 'html';
  sourceCategory: 'publisher-feed' | 'aggregator-feed' | 'platform' | 'api' | 'web-page';
  requiresUrlResolution: boolean;
  sourceLanguage?: string;
  publisherName?: string;
  publisherUrl?: string;
};

type FeedDefinition = {
  id: string;
  title: string;
  url: string;
  language: string;
  sourceFormat: 'rss' | 'atom' | 'xml';
  sourceCategory: 'publisher-feed' | 'aggregator-feed';
  requiresUrlResolution: boolean;
  enabled: boolean;
};

function loadFeedDefinitions(): FeedDefinition[] {
  try {
    const configUrl = new URL('../feeds.json', import.meta.url);
    const raw = readFileSync(configUrl, 'utf-8');
    const parsed = JSON.parse(raw) as { feeds?: FeedDefinition[] };
    const feeds = parsed.feeds ?? [];

    return feeds.filter((feed) => {
      return (
        typeof feed.id === 'string' &&
        typeof feed.title === 'string' &&
        typeof feed.url === 'string' &&
        typeof feed.language === 'string' &&
        typeof feed.sourceFormat === 'string' &&
        typeof feed.sourceCategory === 'string' &&
        typeof feed.requiresUrlResolution === 'boolean' &&
        typeof feed.enabled === 'boolean'
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[agent] failed to load feeds.json', { message });
    return [];
  }
}

const FEEDS = loadFeedDefinitions();

const MAX_WATCHLIST_GOOGLE_QUERIES_PER_RUN = 28;

const NEWSDATA_ENABLED = (process.env.NEWSDATA_ENABLED ?? 'false').toLowerCase() === 'true';
const NEWSIO_API_KEY = process.env.NEWSIO_API_KEY ?? process.env.NEWSDATA_API_KEY;
const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1/latest';
const NEWSDATA_QUERY_LIMIT = 10;
const DEFAULT_NEWSIO_MAX_CREDITS_PER_RUN = 6;
const NEWSIO_MAX_CREDITS_PER_RUN = Math.max(
  1,
  Number.parseInt(process.env.NEWSIO_MAX_CREDITS_PER_RUN ?? `${DEFAULT_NEWSIO_MAX_CREDITS_PER_RUN}`, 10) ||
    DEFAULT_NEWSIO_MAX_CREDITS_PER_RUN,
);

function buildWatchlistQueries(): string[] {
  const queries: string[] = [];
  for (const site of GOOGLE_NEWS_WATCHLIST_SITES) {
    for (const country of GOOGLE_NEWS_COUNTRY_TERMS) {
      queries.push(`site:${site} cult "${country}"`);
    }
  }

  return queries;
}

function rotateArray<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return items;
  }

  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

const CULT_TERMS = ALL_CULT_TERMS;

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

function extractAtomLink(block: string): string | undefined {
  const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return linkMatch?.[1];
}

function containsTerm(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function parseFeed(
  xml: string,
  feed: Pick<FeedDefinition, 'url' | 'language' | 'sourceFormat' | 'sourceCategory' | 'requiresUrlResolution'>,
): DiscoveredStory[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const blocks = [...itemBlocks, ...entryBlocks];

  const stories: DiscoveredStory[] = [];
  const languageCultTerms = getCultTermsForLanguage(feed.language);

  for (const block of blocks) {
    const title = extractTag(block, 'title') ?? '';
    const description = extractTag(block, 'description') ?? extractTag(block, 'summary') ?? '';
    const link = extractTag(block, 'link') ?? extractAtomLink(block);

    if (!title || !link) {
      continue;
    }

    const haystack = `${title} ${description}`;
    if (!containsTerm(haystack, languageCultTerms)) {
      continue;
    }

    if (!containsTerm(haystack, REGION_TERMS)) {
      continue;
    }

    stories.push({
      url: link.trim(),
      title: title.trim(),
      sourceFeed: feed.url,
      sourceFormat: feed.sourceFormat,
      sourceCategory: feed.sourceCategory,
      requiresUrlResolution: feed.requiresUrlResolution,
      sourceLanguage: feed.language,
    });
  }

  return stories;
}

type GoogleNewsFeedItem = {
  title: string;
  link: string;
  publisherName?: string;
  publisherUrl?: string;
  originalUrlFromMetadata?: string;
};

function extractSourceTag(block: string): { publisherName?: string; publisherUrl?: string } {
  const sourceMatch = block.match(/<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
  if (!sourceMatch) {
    return {};
  }

  const publisherUrl = sourceMatch[1] ? decodeXml(sourceMatch[1]).trim() : undefined;
  const publisherName = sourceMatch[2] ? decodeXml(sourceMatch[2]).trim() : undefined;
  return { publisherName, publisherUrl };
}

function extractOriginalUrlFromDescription(description: string): string | undefined {
  const hrefMatches = description.match(/href=["']([^"']+)["']/gi) ?? [];
  for (const token of hrefMatches) {
    const hrefMatch = token.match(/href=["']([^"']+)["']/i);
    const href = hrefMatch?.[1] ? decodeXml(hrefMatch[1]).trim() : undefined;
    if (!href) {
      continue;
    }

    try {
      const host = normalizeHost(new URL(href).hostname);
      if (host === 'news.google.com' || host.endsWith('.google.com') || host === 'google.com') {
        continue;
      }
      return href;
    } catch {
      // Ignore malformed links in description.
    }
  }

  return undefined;
}

function parseGoogleNewsFeed(xml: string): GoogleNewsFeedItem[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const items: GoogleNewsFeedItem[] = [];

  for (const block of itemBlocks) {
    const title = extractTag(block, 'title') ?? '';
    const description = extractTag(block, 'description') ?? '';
    const link = extractTag(block, 'link') ?? '';
    const source = extractSourceTag(block);

    if (!title || !link) {
      continue;
    }

    items.push({
      title: title.trim(),
      link: link.trim(),
      publisherName: source.publisherName,
      publisherUrl: source.publisherUrl,
      originalUrlFromMetadata: extractOriginalUrlFromDescription(description),
    });
  }

  return items;
}

function buildGoogleNewsRssUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-GB&gl=GB&ceid=GB:en`;
}

type NewsDataResult = {
  title?: string;
  link?: string;
  source_name?: string;
  source_url?: string;
  description?: string;
};

function buildNewsDataUrl(query: string): string {
  const params = new URLSearchParams({
    apikey: NEWSIO_API_KEY ?? '',
    q: query,
    country: NEWSDATA_COUNTRY_CODES,
    language: NEWSDATA_LANGUAGES,
    size: String(NEWSDATA_QUERY_LIMIT),
    removeduplicate: '1',
  });

  return `${NEWSDATA_BASE_URL}?${params.toString()}`;
}

function normalizePossibleUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

async function discoverFromNewsData(maxItems: number): Promise<DiscoveredStory[]> {
  if (!NEWSDATA_ENABLED) {
    return [];
  }

  if (!NEWSIO_API_KEY) {
    console.warn('[agent] NewsData enabled but NEWSIO_API_KEY is missing');
    return [];
  }

  const discovered: DiscoveredStory[] = [];
  const queries = NEWSDATA_QUERIES.slice(0, NEWSIO_MAX_CREDITS_PER_RUN);

  for (const query of queries) {
    if (discovered.length >= maxItems) {
      break;
    }

    const url = buildNewsDataUrl(query);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FreedomTimes-Local-Agent/0.1',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('[agent] newsdata fetch failed', { status: response.status, query });
        continue;
      }

      const payload = (await response.json()) as { results?: NewsDataResult[] };
      const results = payload.results ?? [];

      for (const item of results) {
        if (discovered.length >= maxItems) {
          break;
        }

        const link = normalizePossibleUrl(item.link);
        const title = (item.title ?? '').trim();

        if (!link || !title) {
          continue;
        }

        if (!getHost(link)) {
          continue;
        }

        const haystack = `${title} ${item.description ?? ''}`;
        if (!containsTerm(haystack, CULT_TERMS) || !containsTerm(haystack, REGION_TERMS)) {
          continue;
        }

        discovered.push({
          url: link,
          title,
          sourceFeed: `newsdata:${query}`,
          sourceFormat: 'newsio',
          sourceCategory: 'api',
          requiresUrlResolution: false,
          publisherName: item.source_name,
          publisherUrl: normalizePossibleUrl(item.source_url),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[agent] newsdata fetch error', { query, message });
    }
  }

  return discovered;
}

async function resolveGoogleNewsLink(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'FreedomTimes-Local-Agent/0.1',
      },
    });

    return response.url;
  } catch {
    // Fallback to original URL.
  }

  return url;
}

async function discoverFromGoogleNews(maxItems: number): Promise<DiscoveredStory[]> {
  const discovered: DiscoveredStory[] = [];
  const seen = new Set<string>();
  const watchlistQueries = buildWatchlistQueries();
  const runSeed = Number.parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''), 10);
  const rotatedWatchlistQueries = rotateArray(watchlistQueries, runSeed);
  const boundedWatchlistQueries = rotatedWatchlistQueries.slice(0, MAX_WATCHLIST_GOOGLE_QUERIES_PER_RUN);
  const queries = [...boundedWatchlistQueries, ...GOOGLE_NEWS_GENERIC_QUERIES];
  const perQueryLimit = 2;
  const globalCeiling = Math.max(maxItems * 3, queries.length);

  for (const query of queries) {
    if (discovered.length >= globalCeiling) {
      break;
    }

    const rssUrl = buildGoogleNewsRssUrl(query);

    try {
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'FreedomTimes-Local-Agent/0.1',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        continue;
      }

      const xml = await response.text();
      const parsed = parseGoogleNewsFeed(xml);

      let addedForQuery = 0;

      for (const item of parsed) {
        if (discovered.length >= globalCeiling || addedForQuery >= perQueryLimit) {
          break;
        }

        let selectedUrl = item.originalUrlFromMetadata;
        if (!selectedUrl) {
          selectedUrl = await resolveGoogleNewsLink(item.link);
        }

        if (seen.has(selectedUrl)) {
          continue;
        }

        seen.add(selectedUrl);
        discovered.push({
          url: selectedUrl,
          title: item.title,
          sourceFeed: `google-news:${query}`,
          sourceFormat: 'rss',
          sourceCategory: 'aggregator-feed',
          requiresUrlResolution: true,
          publisherName: item.publisherName,
          publisherUrl: item.publisherUrl,
        });
        addedForQuery += 1;
      }
    } catch {
      // Continue with remaining queries.
    }
  }

  return discovered;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function getHost(url: string): string | undefined {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

function isPriorityWatchlistHost(url: string): boolean {
  const host = getHost(url);
  if (!host) {
    return false;
  }

  return PRIORITY_WATCHLIST_HOSTS.some((watchHost) => host === watchHost || host.endsWith(`.${watchHost}`));
}

function scoreDiscoveredStory(story: DiscoveredStory, allowedHosts: Set<string>): {
  score: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let score = 0;
  const host = getHost(story.url);

  const add = (reason: string, points: number): void => {
    if (points === 0) {
      return;
    }
    score += points;
    breakdown[reason] = (breakdown[reason] ?? 0) + points;
  };

  if (host && isAllowedOrSubdomain(host, allowedHosts)) {
    add('allowlist_host', 18);
  }

  if (isPriorityWatchlistHost(story.url)) {
    add('priority_watchlist_host', 14);
  }

  if (story.url.startsWith('https://')) {
    add('https_url', 10);
  }

  if (story.publisherName || story.publisherUrl) {
    add('publisher_metadata_present', 8);
  }

  if (!story.requiresUrlResolution) {
    add('direct_url_no_resolution', 6);
  }

  if (story.sourceCategory === 'publisher-feed') {
    add('source_publisher_feed', 12);
  } else if (story.sourceCategory === 'api') {
    add('source_api', 8);
  } else if (story.sourceCategory === 'web-page') {
    add('source_web_page', 4);
  } else if (story.sourceCategory === 'aggregator-feed') {
    add('source_aggregator_feed', 2);
  } else if (story.sourceCategory === 'platform') {
    add('source_platform_penalty', -8);
  }

  const titleLength = story.title.trim().length;
  if (titleLength >= 24 && titleLength <= 180) {
    add('title_length_good', 6);
  } else if (titleLength > 0) {
    add('title_length_ok', 2);
  }

  const titleLower = story.title.toLowerCase();
  if (containsTerm(titleLower, CULT_TERMS)) {
    add('title_has_cult_signal', 12);
  }

  if (containsTerm(titleLower, REGION_TERMS)) {
    add('title_has_region_signal', 8);
  }

  try {
    const parsed = new URL(story.url);
    const path = parsed.pathname.toLowerCase();

    if (/\/(video|videos|audio|podcast)\//.test(path)) {
      add('url_media_format_penalty', -6);
    }

    if (/\/\d{4}\/\w{3}\/\d{1,2}\//.test(path) || /\/\d{4}\/\d{1,2}\/\d{1,2}\//.test(path)) {
      add('url_article_date_pattern', 6);
    }
  } catch {
    add('url_parse_penalty', -10);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
  };
}

function isAllowedOrSubdomain(hostname: string, allowedHosts: Set<string>): boolean {
  const host = normalizeHost(hostname);
  for (const allowed of allowedHosts) {
    const normalizedAllowed = normalizeHost(allowed);
    if (host === normalizedAllowed || host.endsWith(`.${normalizedAllowed}`)) {
      return true;
    }
  }
  return false;
}

export async function discoverCandidateStories(maxItems: number, allowedHosts: Set<string>): Promise<DiscoveredStory[]> {
  const discovered: DiscoveredStory[] = [];

  try {
    discovered.push(...(await discoverFromNewsData(maxItems)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[agent] newsdata discovery failed', { message });
  }

  try {
    discovered.push(...(await discoverFromGoogleNews(maxItems * 2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[agent] google-news discovery failed', { message });
  }

  const uniqueFeeds = Array.from(new Map(FEEDS.filter((feed) => feed.enabled).map((feed) => [feed.url, feed])).values());

  for (const feed of uniqueFeeds) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'FreedomTimes-Local-Agent/0.1',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        console.warn('[agent] feed fetch failed', { feedUrl: feed.url, status: response.status });
        continue;
      }

      const xml = await response.text();
      discovered.push(...parseFeed(xml, feed));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[agent] feed fetch error', { feedUrl: feed.url, message });
    }
  }

  const deduped = Array.from(new Map(discovered.map((item) => [item.url, item])).values());
  const scored = deduped.map((item) => {
    const scoredStory = scoreDiscoveredStory(item, allowedHosts);
    return {
      ...item,
      discoveryScore: scoredStory.score,
      discoveryScoreBreakdown: scoredStory.breakdown,
    };
  });

  scored.sort((a, b) => {
    const scoreDiff = (b.discoveryScore ?? 0) - (a.discoveryScore ?? 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const aPriority = isPriorityWatchlistHost(a.url) ? 1 : 0;
    const bPriority = isPriorityWatchlistHost(b.url) ? 1 : 0;
    return bPriority - aPriority;
  });

  return scored.slice(0, Math.max(1, maxItems));
}
