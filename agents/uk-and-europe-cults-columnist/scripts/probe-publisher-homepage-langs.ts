/**
 * Fetch watchlist publisher homepages, read <html lang> / content-language / tinyld on text,
 * and suggest googleNewsLocaleIds. Writes reports/publisher-homepage-probe-{iso}.json.
 *
 * Usage: npm run probe:publisher-langs
 * Optional: npx tsx scripts/probe-publisher-homepage-langs.ts --only=elpais.com,lavanguardia.com
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { detect } from 'tinyld';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** When the CDN returns 403 or a minimal error document, prefer editorial market over parsed `lang`. */
const PROBE_HOST_MARKET_FALLBACK: Record<string, string[]> = {
  'elpais.com': ['ES-es'],
  'scotsman.com': ['GB-en'],
  'heraldscotland.com': ['GB-en'],
  'ilsole24ore.com': ['IT-it'],
  'diepresse.com': ['AT-de'],
  'ekathimerini.com': ['GR-el'],
  'lavanguardia.com': ['ES-es'],
  'irishexaminer.com': ['IE-en'],
};

const CC_TLD_HAS_EUROPE_LOCALE: Record<string, true> = {
  ie: true,
  fr: true,
  es: true,
  it: true,
  nl: true,
  be: true,
  at: true,
  ch: true,
  pl: true,
  pt: true,
  gr: true,
  cy: true,
  cz: true,
  sk: true,
  hu: true,
  ro: true,
  bg: true,
  hr: true,
  si: true,
  rs: true,
  ba: true,
  me: true,
  mk: true,
  al: true,
  ua: true,
  md: true,
  se: true,
  no: true,
  dk: true,
  fi: true,
  is: true,
  ee: true,
  lv: true,
  lt: true,
  lu: true,
  mt: true,
  de: true,
  uk: true,
  eu: true,
};

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^["']+|["']+$/g, '');
}

function extractHtmlLang(html: string): string | undefined {
  const m = html.match(/<html[^>]*\slang\s*=\s*["']([^"']+)["']/i);
  return m?.[1]?.trim();
}

function extractMetaContentLang(html: string): string | undefined {
  const m1 = html.match(
    /<meta[^>]+http-equiv\s*=\s*["']content-language["'][^>]+content\s*=\s*["']([^"']+)["']/i,
  );
  if (m1?.[1]) {
    return m1[1].trim();
  }
  const m2 = html.match(
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+http-equiv\s*=\s*["']content-language["']/i,
  );
  return m2?.[1]?.trim();
}

function stripTagsForLanguageProbe(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function primarySubtag(tag: string | undefined): string {
  if (!tag) {
    return '';
  }
  const first = tag.split(/[;,]/)[0]?.trim().toLowerCase() ?? '';
  return (first.split('-')[0] ?? '').trim();
}

function suggestLocaleIds(params: {
  host: string;
  htmlLang?: string;
  contentLang?: string;
  textSample: string;
}): { suggestedIds: string[]; signals: Record<string, string | undefined> } {
  const textLang =
    params.textSample.length >= 120 ? detect(params.textSample) : undefined;
  const primaryRaw = params.htmlLang ?? params.contentLang;
  const sub = primarySubtag(primaryRaw);
  const hostn = normalizeHost(params.host);
  const tld = hostn.split('.').pop() ?? '';

  const signals: Record<string, string | undefined> = {
    htmlLang: params.htmlLang,
    contentLang: params.contentLang,
    textLang,
    primarySubtag: sub || undefined,
  };

  if (hostn.endsWith('.co.uk') || hostn.endsWith('.uk')) {
    return { suggestedIds: ['GB-en'], signals };
  }
  if (hostn.endsWith('.ie') || hostn === 'irishexaminer.com') {
    return { suggestedIds: ['IE-en'], signals };
  }
  if (hostn === 'scotsman.com' || hostn === 'heraldscotland.com') {
    return { suggestedIds: ['GB-en'], signals };
  }

  const tldToId: Record<string, string> = {
    fr: 'FR-fr',
    es: 'ES-es',
    it: 'IT-it',
    de: 'DE-de',
    nl: 'NL-nl',
    at: 'AT-de',
    pl: 'PL-pl',
    pt: 'PT-pt',
    gr: 'GR-el',
    cz: 'CZ-cs',
    sk: 'SK-sk',
    hu: 'HU-hu',
    ro: 'RO-ro',
    bg: 'BG-bg',
    hr: 'HR-hr',
    si: 'SI-sl',
    se: 'SE-sv',
    no: 'NO-no',
    dk: 'DK-da',
    fi: 'FI-fi',
    ch: 'CH-de',
  };
  if (tldToId[tld]) {
    return { suggestedIds: [tldToId[tld]!], signals };
  }

  const subToId: Record<string, string> = {
    en: 'GB-en',
    fr: 'FR-fr',
    es: 'ES-es',
    it: 'IT-it',
    de: 'DE-de',
    nl: 'NL-nl',
    el: 'GR-el',
    pt: 'PT-pt',
    pl: 'PL-pl',
    cs: 'CZ-cs',
    sk: 'SK-sk',
    hu: 'HU-hu',
    ro: 'RO-ro',
    bg: 'BG-bg',
    hr: 'HR-hr',
    sl: 'SI-sl',
    sv: 'SE-sv',
    no: 'NO-no',
    da: 'DK-da',
    fi: 'FI-fi',
  };

  if (sub && subToId[sub]) {
    return { suggestedIds: [subToId[sub]!], signals };
  }
  if (textLang && subToId[textLang]) {
    return { suggestedIds: [subToId[textLang]!], signals };
  }

  return { suggestedIds: [], signals };
}

async function probeHost(host: string): Promise<{
  host: string;
  ok: boolean;
  status?: number;
  finalUrl?: string;
  error?: string;
  htmlLang?: string;
  contentLanguage?: string;
  textLangTinyld?: string;
  suggestedLocaleIds: string[];
  signals: Record<string, string | undefined>;
  suggestionNote?: string;
}> {
  const hostn = normalizeHost(host);
  const url = `https://${hostn}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    const marketFallback = PROBE_HOST_MARKET_FALLBACK[hostn];
    const trustMarkup = res.ok && html.length > 2000;
    const htmlLang = trustMarkup ? extractHtmlLang(html) : undefined;
    const contentLanguage = trustMarkup ? extractMetaContentLang(html) : undefined;
    const textSample = trustMarkup ? stripTagsForLanguageProbe(html) : '';
    const textLangTinyld = textSample.length >= 120 ? detect(textSample) : undefined;
    let suggestedIds: string[];
    let signals: Record<string, string | undefined>;
    let suggestionNote: string | undefined;
    if (!res.ok && marketFallback) {
      suggestedIds = marketFallback;
      signals = { fallback: 'editorial-market' };
      suggestionNote = 'non-ok HTTP body ignored; using editorial fallback map';
    } else {
      const out = suggestLocaleIds({
        host,
        htmlLang,
        contentLang: contentLanguage,
        textSample,
      });
      suggestedIds = out.suggestedIds;
      signals = out.signals;
    }
    return {
      host: hostn,
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      htmlLang,
      contentLanguage,
      textLangTinyld,
      suggestedLocaleIds: suggestedIds,
      signals,
      suggestionNote,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const marketFallback = PROBE_HOST_MARKET_FALLBACK[hostn];
    if (marketFallback) {
      return {
        host: hostn,
        ok: false,
        error: message,
        suggestedLocaleIds: marketFallback,
        signals: { fallback: 'editorial-market' },
        suggestionNote: 'fetch failed; using editorial fallback map',
      };
    }
    return {
      host: hostn,
      ok: false,
      error: message,
      suggestedLocaleIds: [],
      signals: {},
    };
  }
}

function loadWatchlistHosts(): string[] {
  const url = new URL('../watchlist-sites.json', import.meta.url);
  const raw = readFileSync(url, 'utf-8');
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) {
    throw new Error('watchlist-sites.json must be a JSON array');
  }
  return list.filter((x): x is string => typeof x === 'string').map(normalizeHost);
}

function loadConfigUseAllAndHosts(): { useAll: Set<string>; configuredHosts: Set<string> } {
  const url = new URL('../data/publisher-host-config.json', import.meta.url);
  const raw = readFileSync(url, 'utf-8');
  const parsed = JSON.parse(raw) as {
    useAllLocalesHosts?: string[];
    hosts?: Record<string, unknown>;
  };
  const useAll = new Set((parsed.useAllLocalesHosts ?? []).map(normalizeHost));
  const configuredHosts = new Set(
    Object.keys(parsed.hosts ?? {})
      .filter((k) => !k.startsWith('_'))
      .map(normalizeHost),
  );
  return { useAll, configuredHosts };
}

function loadValidLocaleIds(): Set<string> {
  const url = new URL('../data/google-news-europe-locales.json', import.meta.url);
  const raw = readFileSync(url, 'utf-8');
  const parsed = JSON.parse(raw) as { locales?: { id: string }[] };
  const ids = new Set<string>();
  for (const l of parsed.locales ?? []) {
    if (l?.id) {
      ids.add(l.id);
    }
  }
  return ids;
}

async function main(): Promise<void> {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlySet = onlyArg
    ? new Set(
        onlyArg
          .slice('--only='.length)
          .split(',')
          .map((s) => normalizeHost(s))
          .filter(Boolean),
      )
    : null;

  const watchlist = loadWatchlistHosts();
  const { useAll, configuredHosts } = loadConfigUseAllAndHosts();
  const validIds = loadValidLocaleIds();

  let targets: string[];
  if (onlySet && onlySet.size > 0) {
    targets = [...onlySet];
  } else {
    targets = watchlist.filter((h) => !useAll.has(h));
  }

  console.error(`Probing ${targets.length} hosts (sequential, ~20s timeout each)…`);

  const rows: Awaited<ReturnType<typeof probeHost>>[] = [];
  for (const host of targets) {
    process.stderr.write(`${host}… `);
    const row = await probeHost(host);
    rows.push(row);
    console.error(row.ok ? `ok ${row.htmlLang ?? row.contentLanguage ?? '?'}` : `fail ${row.error ?? row.status}`);
  }

  const flagged = rows.filter((r) => {
    if (!r.ok) {
      return true;
    }
    for (const id of r.suggestedLocaleIds) {
      if (!validIds.has(id)) {
        return true;
      }
    }
    return r.suggestedLocaleIds.length === 0;
  });

  const out = {
    recordedAt: new Date().toISOString(),
    hints: {
      useAllLocalesCount: useAll.size,
      watchlistHosts: watchlist.length,
      probedHosts: targets.length,
      rowsMissingSuggestion: flagged.filter((r) => r.ok && r.suggestedLocaleIds.length === 0).length,
    },
    rows,
    review: flagged,
  };

  const reportsDir = new URL('../reports/', import.meta.url);
  mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new URL(`publisher-homepage-probe-${stamp}.json`, reportsDir);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
  const latest = new URL('publisher-homepage-probe-latest.json', reportsDir);
  writeFileSync(latest, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');

  console.error(`Wrote ${file.pathname}`);

  const missingRule = watchlist.filter(
    (h) => !useAll.has(h) && !configuredHosts.has(h) && !hostHasTldLocaleScope(h),
  );
  if (missingRule.length > 0) {
    console.error(
      `\nWatchlist hosts with no publisher-host-config row and no ccTLD / .uk scope (${missingRule.length}); discovery falls back to all editions until configured:`,
    );
    console.error(missingRule.join(', '));
  }
}

function hostHasTldLocaleScope(host: string): boolean {
  const h = normalizeHost(host);
  if (h.endsWith('.co.uk') || h.endsWith('.uk')) {
    return true;
  }
  const parts = h.split('.').filter(Boolean);
  const tld = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
  return CC_TLD_HAS_EUROPE_LOCALE[tld] === true || tld === 'eu';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
