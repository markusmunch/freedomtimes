/**
 * Reads reports/google-news-query-plan-latest.json and prints optimization-oriented stats
 * (query count, RSS cell budget, longest queries, host buckets).
 *
 * Usage: node scripts/analyze-google-news-query-plan.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const planPath = join(root, 'reports', 'google-news-query-plan-latest.json');

if (!existsSync(planPath)) {
  console.error('Missing query plan:', planPath);
  console.error('Run the agent once with GOOGLE_NEWS_RECORD_QUERY_PLAN=true (default) to generate it.');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
const rows = plan.mainPassThisRun?.rows ?? [];
const queries = rows.map((r) => r.query).filter(Boolean);
const rssSumFromRows = rows.reduce((acc, r) => acc + (typeof r.rssCells === 'number' ? r.rssCells : 0), 0);
const longest = queries.reduce((m, q) => Math.max(m, q.length), 0);
const byLen = [...queries].sort((a, b) => b.length - a.length).slice(0, 20);

const watchlistByHost = plan.watchlistByHost ?? {};
const hostRows = Object.entries(watchlistByHost)
  .map(([host, v]) => ({
    host,
    queryCount: v.queryCount ?? 0,
    rssCellsSum: v.rssCellsSum ?? 0,
  }))
  .sort((a, b) => b.rssCellsSum - a.rssCellsSum);

const out = {
  planFile: planPath,
  recordedAt: plan.recordedAt,
  watchlistSiteOrChunk: plan.watchlistSiteOrChunk,
  googleNewsTotalCap: plan.googleNewsTotalCap,
  summary: plan.summary,
  mainPassQueryCount: queries.length,
  rssCellsMainPassFromRows: rssSumFromRows,
  longestQueryChars: longest,
  longestQueryPreviews: byLen.map((q) => ({ chars: q.length, preview: q.slice(0, 200) })),
  watchlistHostsByRssCells: hostRows.slice(0, 40),
  optimizationHints: [
    'If longest q= approaches ~1500–2048 chars, Google may truncate; split OR-groups or reduce site: merge size (GOOGLE_NEWS_WATCHLIST_SITE_OR_CHUNK).',
    'Compare summary.rssCellsMainPassThisRun to rssCellsFullConfigPool; merged watchlist should shrink cells vs one-query-per-site.',
    'After a discovery run, open reports/google-news-wrapped-links-latest.json to count RSS rows that stayed on news.google.com; enable GOOGLE_NEWS_RESOLVE_USE_PLAYWRIGHT=true if the count justifies browser cost.',
    'Tune data/discovery/lang/*.json and google-news-locale-cult-keywords.json instead of adding redundant Google News query strings.',
  ],
};

console.log(JSON.stringify(out, null, 2));
