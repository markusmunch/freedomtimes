/**
 * Builds reports/pipeline-rejection-review-latest.html from pipeline-rejections-latest.json
 * (written by the agent when any candidate is rejected). No network.
 *
 *   node scripts/render-pipeline-rejection-review-html.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inPath = join(root, 'reports', 'pipeline-rejections-latest.json');
const outPath = join(root, 'reports', 'pipeline-rejection-review-latest.html');

const TARGET_REASONS = new Set([
  'Source failed reliability checks',
  'Story does not meet UK/EU cult-topic relevance threshold',
  'Story does not have a configured regional source or configured regional geographic signal',
]);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(rowsByReason, generatedAt, sourceNote) {
  const sections = [];
  for (const reason of TARGET_REASONS) {
    const rows = rowsByReason.get(reason) ?? [];
    const cards = rows
      .map((r) => {
        const title = r.title ? escapeHtml(r.title) : '(no title)';
        const prev = r.textPreview ? escapeHtml(r.textPreview) : '';
        const rel = escapeHtml((r.relevance?.reasons ?? []).join('; ') || '—');
        const relHost = escapeHtml((r.reliabilityReasons ?? []).join('; ') || '—');
        const cand = escapeHtml(r.candidateUrl);
        const eff = escapeHtml(r.effectiveUrl);
        const same = r.candidateUrl === r.effectiveUrl;
        return `<article class="card">
  <h3 class="card-title"><a href="${cand}" target="_blank" rel="noopener">${title}</a></h3>
  <p class="meta"><strong>Candidate URL:</strong> <a href="${cand}" target="_blank" rel="noopener">${cand}</a></p>
  ${
    same
      ? ''
      : `<p class="meta"><strong>Effective URL:</strong> <a href="${eff}" target="_blank" rel="noopener">${eff}</a></p>`
  }
  <p class="meta"><strong>Reliability score:</strong> ${r.reliabilityScore} · <strong>Region:</strong> ${escapeHtml(r.relevance?.region ?? '—')} · <strong>Relevance accepted:</strong> ${r.relevance?.accepted}</p>
  <p class="meta small"><strong>Reliability reasons:</strong> ${relHost}</p>
  <p class="meta small"><strong>Relevance reasons:</strong> ${rel}</p>
  ${prev ? `<p class="preview">${prev}</p>` : ''}
</article>`;
      })
      .join('\n');

    sections.push(`<section class="reason-block" id="${escapeHtml(reason.replace(/\s+/g, '-').toLowerCase())}">
<h2>${escapeHtml(reason)} <span class="count">(${rows.length})</span></h2>
<div class="cards">${cards}</div>
</section>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pipeline rejection review</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 920px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; }
    h1 { font-size: 1.35rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
    .count { color: #555; font-weight: normal; }
    .toc { background: #f4f4f4; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
    .toc a { display: block; margin: 4px 0; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; margin: 12px 0; background: #fff; }
    .card-title { margin: 0 0 8px; font-size: 1rem; }
    .card-title a { color: #0b5; }
    .meta { margin: 4px 0; font-size: 0.88rem; word-break: break-all; }
    .meta.small { color: #444; font-size: 0.82rem; }
    .preview { margin-top: 10px; font-size: 0.9rem; line-height: 1.45; color: #222; }
    .stamp { color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Pipeline rejection review</h1>
  <p class="stamp">Source: ${escapeHtml(sourceNote)} · Generated ${escapeHtml(generatedAt)}</p>
  <nav class="toc">
    ${[...TARGET_REASONS]
      .map(
        (r) =>
          `<a href="#${escapeHtml(r.replace(/\s+/g, '-').toLowerCase())}">${escapeHtml(r)} (${rowsByReason.get(r)?.length ?? 0})</a>`,
      )
      .join('\n    ')}
  </nav>
  ${sections.join('\n')}
</body>
</html>
`;
}

if (!existsSync(inPath)) {
  console.error('Missing', inPath, '— run the agent once (rejects are recorded automatically).');
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(inPath, 'utf-8'));
const rows = bundle.rows ?? [];
const rowsByReason = new Map();
for (const r of TARGET_REASONS) rowsByReason.set(r, []);

for (const row of rows) {
  if (TARGET_REASONS.has(row.reason)) {
    rowsByReason.get(row.reason).push(row);
  }
}

const generatedAt = new Date().toISOString();
const html = renderHtml(
  rowsByReason,
  generatedAt,
  `pipeline-rejections-latest.json (${rows.length} total rejection rows)`,
);
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(outPath, html, 'utf-8');
console.log('Wrote', outPath);
for (const r of TARGET_REASONS) {
  console.log(r, rowsByReason.get(r).length);
}
