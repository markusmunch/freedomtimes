import { evaluateRelevance } from './relevance.js';
import { evaluateSourceReliability } from './sourceReliability.js';
import type { DraftPayload, PipelineResult } from './types.js';

type UrlResolver = (html: string, pageUrl: string) => string | undefined;
type RunPipelineOptions = {
  requiresUrlResolution?: boolean;
};

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function decodeHtmlHref(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractCultNews101SourceUrl(html: string, pageUrl: string): string | undefined {
  const excludedHosts = new Set([
    'cultnews101.com',
    'blogger.com',
    'blogspot.com',
    'google.com',
    'youtube.com',
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'reddit.com',
    'wikipedia.org',
  ]);

  const preferred: string[] = [];
  const fallback: string[] = [];
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = anchorRegex.exec(html);

  while (match) {
    const rawHref = match[1] ? decodeHtmlHref(match[1]) : undefined;
    if (!rawHref) {
      match = anchorRegex.exec(html);
      continue;
    }

    try {
      const absolute = new URL(rawHref, pageUrl).toString();
      const host = normalizeHost(new URL(absolute).hostname);

      if (Array.from(excludedHosts).some((excluded) => host === excluded || host.endsWith(`.${excluded}`))) {
        match = anchorRegex.exec(html);
        continue;
      }

      const contextStart = Math.max(0, match.index - 140);
      const contextEnd = Math.min(html.length, match.index + 220);
      const context = html.slice(contextStart, contextEnd).toLowerCase();
      const hasSourceHint = /(source|original|via|read\s+(full|more)|full\s+article|article\s+at|from\s+the)/i.test(
        context,
      );

      if (hasSourceHint) {
        preferred.push(absolute);
      } else {
        fallback.push(absolute);
      }
    } catch {
      // Ignore malformed links.
    }

    match = anchorRegex.exec(html);
  }

  const pick = preferred.length > 0 ? preferred[preferred.length - 1] : fallback[fallback.length - 1];
  return pick;
}

const URL_RESOLVERS_BY_HOST: Record<string, UrlResolver> = {
  'cultnews101.com': extractCultNews101SourceUrl,
};

function getResolverForUrl(url: string): UrlResolver | undefined {
  try {
    const host = normalizeHost(new URL(url).hostname);
    for (const [resolverHost, resolver] of Object.entries(URL_RESOLVERS_BY_HOST)) {
      if (host === resolverHost || host.endsWith(`.${resolverHost}`)) {
        return resolver;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPublishedAt(html: string): string | undefined {
  const metaMatch = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (metaMatch?.[1]) {
    return metaMatch[1];
  }

  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  return timeMatch?.[1];
}

function detectTitle(html: string, fallback: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() || fallback;
}

function createDraft(title: string, text: string, sourceLine: string, region: 'UK' | 'Europe', confidence: number, source: PipelineResult['source']): DraftPayload {
  const trimmed = text.slice(0, 1400);

  return {
    title,
    dek: `Summary of a ${region} cult-related story from a reliable source.`,
    body: `${trimmed}\n\nSource: ${sourceLine}`,
    tags: ['cult', region.toLowerCase(), 'draft-agent'],
    region,
    confidence,
    reviewNotes: 'Auto-generated draft. Editorial review is required before publication.',
    source,
  };
}

export async function runPipeline(
  url: string,
  allowedHosts: Set<string>,
  options: RunPipelineOptions = {},
): Promise<PipelineResult> {
  let effectiveUrl = url;
  let response = await fetch(effectiveUrl, {
    headers: {
      'User-Agent': 'FreedomTimes-Local-Agent/0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source URL: HTTP ${response.status}`);
  }

  let html = await response.text();

  if (options.requiresUrlResolution) {
    const resolver = getResolverForUrl(effectiveUrl);
    const resolvedUrl = resolver?.(html, effectiveUrl);
    if (resolvedUrl && resolvedUrl !== effectiveUrl) {
      try {
        const resolvedResponse = await fetch(resolvedUrl, {
          headers: {
            'User-Agent': 'FreedomTimes-Local-Agent/0.1',
          },
        });

        if (resolvedResponse.ok) {
          effectiveUrl = resolvedUrl;
          response = resolvedResponse;
          html = await resolvedResponse.text();
        }
      } catch {
        // Keep original page fallback when source URL cannot be fetched.
      }
    }
  }

  const publishedAt = detectPublishedAt(html);
  const source = evaluateSourceReliability(effectiveUrl, allowedHosts, publishedAt);
  const missingAllowlistOnly =
    source.reliabilityReasons.includes('Source host is not on reliability allowlist') &&
    !source.reliabilityReasons.includes('Non-HTTPS source URL') &&
    !source.reliabilityReasons.includes('No publication date detected');

  if (source.reliabilityScore < 70 && !missingAllowlistOnly) {
    return {
      status: 'rejected',
      source,
      relevance: {
        accepted: false,
        region: 'Unknown',
        confidence: 0,
        reasons: ['Source reliability below threshold'],
      },
      reason: 'Source failed reliability checks',
    };
  }

  const title = detectTitle(html, 'Untitled source story');
  const text = stripHtml(html);
  const relevance = evaluateRelevance(`${title} ${text}`);

  if (!relevance.accepted || (relevance.region !== 'UK' && relevance.region !== 'Europe')) {
    return {
      status: 'rejected',
      source,
      relevance,
      reason: 'Story does not meet UK/EU cult-topic relevance threshold',
    };
  }

  const sourceLine = `${source.publisher} (${source.url})`;
  const draft = createDraft(title, text, sourceLine, relevance.region, relevance.confidence, source);

  return {
    status: 'drafted',
    source,
    relevance,
    draft,
  };
}
