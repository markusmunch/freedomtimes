const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: Georgia, serif; background: #faf7f2; color: #2c2416; margin: 0; padding: 1.5rem; }
  a { color: #1d4b3e; }
  h1 { font-size: 1.4rem; margin: 0; }
  .page-header { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
  .muted { font-size: 0.85rem; color: #5c5346; }
  .error-box { background: #fdf0ee; border: 1px solid #d9534f; border-radius: 4px; padding: 0.75rem 1rem; color: #a02020; margin-bottom: 1rem; }
  .info-box  { background: #f5f0e8; border: 1px solid #c9b99a; border-radius: 4px; padding: 0.75rem 1rem; color: #5c5346; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; border-bottom: 2px solid #c9b99a; padding: 0.35rem 0.6rem; font-weight: 600; white-space: nowrap; }
  td { border-bottom: 1px solid #e5ddd0; padding: 0.35rem 0.6rem; vertical-align: top; }
  tr:hover td { background: #f5f0e8; }
  .mono { font-family: monospace; font-size: 0.82rem; }
  .badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.78rem; font-weight: 600; }
  .badge-warn    { background: #fff3cd; color: #856404; }
  .badge-error   { background: #f8d7da; color: #842029; }
  .badge-ok      { background: #d1e7dd; color: #0a3622; }
  .badge-neutral { background: #e2e8f0; color: #4a4a4a; }
  .btn { border: none; border-radius: 4px; padding: 0.5rem 1.2rem; font-size: 0.9rem; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #1d4b3e; color: #fff; }
  .btn-danger  { background: #a02020; color: #fff; }
  .btn-row { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.75rem; }
  .status-bar { display: flex; gap: 1.5rem; margin: 0.75rem 0 1.5rem; }
  .stat { text-align: center; }
  .stat-num   { font-size: 1.8rem; font-weight: 700; line-height: 1; }
  .stat-label { font-size: 0.75rem; color: #7a6e62; text-transform: uppercase; letter-spacing: 0.04em; }
  .num-ok      { color: #0a6e3a; }
  .num-err     { color: #a02020; }
  .num-pending { color: #856404; }
  .review-panel { background: #f5f0e8; border: 1px solid #c9b99a; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
  .review-panel h2 { margin: 0 0 0.75rem; font-size: 1rem; }
  textarea { width: 100%; border: 1px solid #c9b99a; border-radius: 4px; padding: 0.5rem; font-family: Georgia, serif; font-size: 0.9rem; resize: vertical; background: #fffdf8; }
  .http-ok      { color: #0a6e3a; font-weight: 700; }
  .http-err     { color: #a02020; font-weight: 700; }
  .http-pending { color: #856404; }
  .ct-warn      { color: #856404; font-weight: 600; }
  td.overflow   { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: #7a6e62; font-style: italic; }
`;

const HEAD = (title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>`;

const FOOT = `</body></html>`;

// ── Error page ────────────────────────────────────────────────────────────────

export function errorHtml(message: string, status = 400): Response {
  const html = HEAD('Error') + `
<div class="page-header"><h1>Error</h1></div>
<div class="error-box">${message.replace(/[<>"'&]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;' }[c] ?? c))}</div>
<p><a href="/ui">← back to runs</a></p>
` + FOOT;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export function runsListHtml(): Response {
  const html = HEAD('Agent Runs') + `
<div class="page-header">
  <h1>Agent Runs</h1>
</div>

<button class="btn btn-primary" id="start-btn" type="button">Start new run</button>
<span id="start-status" class="muted" style="margin-left:0.75rem"></span>

<div id="content" class="info-box" style="margin-top:1rem">Loading…</div>

<script>
(async function () {
  function badgeClass(status) {
    if (status.startsWith('awaiting_review')) return 'badge-warn';
    if (status === 'failed') return 'badge-error';
    if (status === 'published_draft') return 'badge-ok';
    return 'badge-neutral';
  }

  async function load() {
    const el = document.getElementById('content');
    try {
      const res = await fetch('/runs');
      if (res.status === 401) {
        window.location.assign('/ui/auth/login');
        return;
      }
      if (!res.ok) { el.innerHTML = '<span class="error-box">Error ' + res.status + '</span>'; return; }
      const data = await res.json();
      const runs = data.runs ?? [];
      if (runs.length === 0) { el.innerHTML = '<p class="empty">No runs yet.</p>'; return; }
      let rows = runs.map(r => \`<tr>
        <td class="mono"><a href="/ui/\${encodeURIComponent(r.id)}">\${r.id}</a></td>
        <td><span class="badge \${badgeClass(r.status)}">\${r.status.replace(/_/g,' ')}</span></td>
        <td>\${r.current_stage ?? '—'}</td>
        <td>\${new Date(r.started_at).toLocaleString()}</td>
        <td>\${new Date(r.updated_at).toLocaleString()}</td>
      </tr>\`).join('');
      el.innerHTML = '<table><thead><tr><th>Run ID</th><th>Status</th><th>Stage</th><th>Started</th><th>Updated</th></tr></thead><tbody>' + rows + '</tbody></table>';
    } catch (e) {
      el.innerHTML = '<span class="error-box">' + e.message + '</span>';
    }
  }

  document.getElementById('start-btn').addEventListener('click', async () => {
    const btn = document.getElementById('start-btn');
    const st  = document.getElementById('start-status');
    btn.disabled = true;
    st.textContent = 'Starting…';
    try {
      const res = await fetch('/runs/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (res.ok) { st.textContent = 'Started: ' + data.runId; setTimeout(() => load(), 1500); }
      else { st.textContent = 'Error: ' + (data.error ?? res.status); btn.disabled = false; }
    } catch (e) { st.textContent = e.message; btn.disabled = false; }
  });

  load();
})();
</script>
` + FOOT;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Run detail ────────────────────────────────────────────────────────────────

export function runDetailHtml(runId: string): Response {
  const escaped = runId.replace(/[<>"'&]/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;' }[c] ?? c));
  const html = HEAD('Stage 1 Review') + `
<div class="page-header">
  <h1>Stage 1 Review</h1>
  <span class="muted mono">${escaped}</span>
  <a class="muted" href="/ui">← all runs</a>
</div>

<div id="stats"></div>
<div id="run-actions"></div>
<div id="review"></div>
<div id="feeds"></div>

<script>
(async function () {
  const runId = ${JSON.stringify(runId)};

  function httpClass(s) { if (s === null) return 'http-pending'; if (s >= 200 && s < 300) return 'http-ok'; return 'http-err'; }
  function ctShort(ct) {
    if (!ct) return '—';
    if (ct.includes('xml'))  return 'XML';
    if (ct.includes('html')) return '<span class="ct-warn">HTML ⚠</span>';
    if (ct.includes('json')) return 'JSON';
    return ct.split(';')[0] ?? ct;
  }
  function badgeClass(status) {
    if (!status) return 'badge-neutral';
    if (status.startsWith('awaiting_review')) return 'badge-warn';
    if (status === 'failed') return 'badge-error';
    if (status === 'published_draft') return 'badge-ok';
    return 'badge-neutral';
  }

  async function load() {
    const statsEl  = document.getElementById('stats');
    const actionsEl = document.getElementById('run-actions');
    const reviewEl = document.getElementById('review');
    const feedsEl  = document.getElementById('feeds');

    try {
      const res = await fetch('/runs/' + encodeURIComponent(runId) + '/stages/feed_fetch');
      if (res.status === 401) {
        window.location.assign('/ui/auth/login');
        return;
      }
      if (!res.ok) { statsEl.innerHTML = '<div class="error-box">Error ' + res.status + '</div>'; return; }

      const data   = await res.json();
      const run    = data.run?.run ?? null;
      const results = data.results ?? [];

      const fetched = results.filter(r => r.status !== null && r.status >= 200 && r.status < 300).length;
      const failed  = results.filter(r => r.status !== null && (r.status < 200 || r.status >= 300)).length;
      const pending = results.filter(r => r.status === null).length;

      statsEl.innerHTML = run ? \`
        <div class="status-bar">
          <div class="stat"><div class="stat-num num-ok">\${fetched}</div><div class="stat-label">Fetched</div></div>
          <div class="stat"><div class="stat-num num-err">\${failed}</div><div class="stat-label">Failed</div></div>
          <div class="stat"><div class="stat-num num-pending">\${pending}</div><div class="stat-label">Not cached</div></div>
          <div class="stat"><div class="stat-num">\${results.length}</div><div class="stat-label">Total</div></div>
        </div>
        <p class="muted">Status: <span class="badge \${badgeClass(run.status)}">\${(run.status ?? '—').replace(/_/g,' ')}</span></p>
      \` : '';

      actionsEl.innerHTML = run ? \`
        <div class="review-panel">
          <h2>Run actions</h2>
          <p class="muted">Deleting a run removes run records and run-specific article blobs from R2. Shared Stage 1 feed cache snapshots are retained.</p>
          <div class="btn-row">
            <button class="btn btn-danger" id="btn-delete-run" type="button">Delete run</button>
            <span id="delete-status" class="muted"></span>
          </div>
        </div>
      \` : '';

      if (run) {
        document.getElementById('btn-delete-run')?.addEventListener('click', async () => {
          const confirmed = window.confirm('Delete this run? Shared Stage 1 feed cache will be kept.');
          if (!confirmed) {
            return;
          }

          const btn = document.getElementById('btn-delete-run');
          const st = document.getElementById('delete-status');
          btn.disabled = true;
          st.textContent = 'Deleting…';

          try {
            const res = await fetch('/runs/' + encodeURIComponent(runId) + '/delete', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.deleted !== true) {
              st.textContent = 'Error: ' + (data.error ?? data.message ?? res.status);
              btn.disabled = false;
              return;
            }

            st.textContent = 'Deleted. Redirecting…';
            setTimeout(() => window.location.assign('/ui'), 700);
          } catch (e) {
            st.textContent = e.message;
            btn.disabled = false;
          }
        });
      }

      const isAwaiting = run?.status === 'awaiting_review_feed_fetch';
      reviewEl.innerHTML = isAwaiting ? \`
        <div class="review-panel">
          <h2>Approve or reject to continue</h2>
          <textarea id="notes" rows="2" placeholder="Optional notes…"></textarea>
          <div class="btn-row">
            <button class="btn btn-primary" id="btn-approve" type="button">Approve → Stage 2</button>
            <button class="btn btn-danger"  id="btn-reject"  type="button">Reject</button>
            <span id="review-status" class="muted"></span>
          </div>
        </div>
      \` : '';

      if (isAwaiting) {
        async function submitReview(action) {
          const notes = document.getElementById('notes')?.value.trim() || null;
          const btnA  = document.getElementById('btn-approve');
          const btnR  = document.getElementById('btn-reject');
          const st    = document.getElementById('review-status');
          btnA.disabled = btnR.disabled = true;
          st.textContent = 'Submitting…';
          try {
            const r = await fetch('/runs/' + encodeURIComponent(runId) + '/stages/feed_fetch/' + action, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ notes }),
            });
            const d = await r.json();
            if (r.ok) {
              st.textContent = action === 'approve' ? '✓ Approved — Stage 2 running…' : '✗ Rejected';
              setTimeout(() => window.location.reload(), 2000);
            } else {
              st.textContent = 'Error: ' + (d.error ?? r.status);
              btnA.disabled = btnR.disabled = false;
            }
          } catch (e) { st.textContent = e.message; btnA.disabled = btnR.disabled = false; }
        }
        document.getElementById('btn-approve').addEventListener('click', () => submitReview('approve'));
        document.getElementById('btn-reject').addEventListener('click',  () => submitReview('reject'));
      }

      if (results.length > 0) {
        const rows = results.map(r => \`<tr>
          <td class="overflow" title="\${r.feed_url ?? ''}"><a href="\${r.r2_key ? ('/runs/' + encodeURIComponent(runId) + '/stages/feed_fetch/cache?u=' + encodeURIComponent(r.feed_url ?? '')) : (r.feed_url ?? '#')}" target="_blank" rel="noopener noreferrer">\${r.feed_title ?? r.feed_id}</a></td>
          <td>\${r.source_category ?? '—'}</td>
          <td>\${r.language ?? '—'}</td>
          <td class="\${httpClass(r.status)}">\${r.status ?? '—'}</td>
          <td>\${ctShort(r.content_type)}</td>
          <td>\${r.fetched_at ? new Date(r.fetched_at).toLocaleTimeString() : '—'}</td>
          <td>\${r.expires_at ? new Date(r.expires_at).toLocaleTimeString() : '—'}</td>
        </tr>\`).join('');
        feedsEl.innerHTML = '<table><thead><tr><th>Feed</th><th>Category</th><th>Lang</th><th>HTTP</th><th>Content-Type</th><th>Fetched</th><th>Expires</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
    } catch (e) {
      document.getElementById('stats').innerHTML = '<div class="error-box">' + e.message + '</div>';
    }
  }

  load();
})();
</script>
` + FOOT;

  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
