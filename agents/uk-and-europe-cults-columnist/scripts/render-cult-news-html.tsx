/// <reference types="node" />
/* @jsxRuntime classic */
/** @jsx h */
/** @jsxFrag Fragment */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  Fragment,
  LOG_PATH,
  OUTPUT_PATH,
  extractDraftsFromLog,
  extractRunSummary,
  fetchStoryMeta,
  formatPublishedAt,
  h,
  renderDocument,
  type EnrichedStory,
} from './render-cult-news-html.helpers.js';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}

type StoryGroup = {
  label: string;
  type: 'streamer-seeded' | 'independent';
  stories: EnrichedStory[];
};

function renderCard(story: EnrichedStory) {
  const hostname = story.host || new URL(story.url).hostname.replace(/^www\./, '');
  const logo = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  return (
    <article className="card">
      {story.image ? (
        <img src={story.image} alt={story.title} className="story-image" loading="lazy" />
      ) : (
        <div className="story-image fallback">No image found</div>
      )}
      <div className="card-body">
        <div className="publisher-row">
          <img src={logo} alt={`${hostname} logo`} className="logo" loading="lazy" />
          <span className="publisher">{hostname}</span>
          <span className="dot">•</span>
          <span className="published">{formatPublishedAt(story.publishedAt)}</span>
        </div>
        <h2>
          <a href={story.url} target="_blank" rel="noopener noreferrer">
            {story.title}
          </a>
        </h2>
        <p>{story.description || 'No abstract available.'}</p>
        <a className="read" href={story.url} target="_blank" rel="noopener noreferrer">
          Read full story
        </a>
      </div>
    </article>
  );
}

function buildPage(groups: StoryGroup[], totalCount: number, generatedAt: string) {
  const hasStories = totalCount > 0;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Cult News Digest</title>
        <style>{`
          :root {
            --bg: #f4f2ea;
            --ink: #222018;
            --accent: #b22d20;
            --card: #fffdfa;
            --line: #ded6c4;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            color: var(--ink);
            background: radial-gradient(circle at top right, #fff7df 0%, var(--bg) 45%);
          }
          .wrap {
            max-width: 1040px;
            margin: 0 auto;
            padding: 28px 18px 44px;
          }
          header h1 {
            margin: 0;
            font-size: clamp(1.8rem, 2.4vw, 2.6rem);
            letter-spacing: 0.02em;
          }
          header p {
            margin: 8px 0 18px;
            color: #4a463d;
          }
          .story-group {
            margin-bottom: 36px;
          }
          .group-header {
            display: flex;
            align-items: baseline;
            gap: 10px;
            margin: 0 0 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--line);
          }
          .group-label {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 700;
            letter-spacing: 0.01em;
          }
          .group-badge {
            font-size: 0.75rem;
            font-family: system-ui, sans-serif;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 2px 7px;
            border-radius: 4px;
          }
          .group-badge.streamer-seeded {
            background: #e8e0f4;
            color: #4a2e8a;
          }
          .group-badge.independent {
            background: #dff0e8;
            color: #1a5c38;
          }
          .group-count {
            font-size: 0.85rem;
            color: #756f63;
            font-family: system-ui, sans-serif;
          }
          .grid {
            display: grid;
            gap: 14px;
            grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          }
          .empty-state {
            grid-column: 1 / -1;
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 24px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.07);
          }
          .empty-state h2 { margin-top: 0; }
          .card {
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0,0,0,0.07);
            display: flex;
            flex-direction: column;
            min-height: 420px;
          }
          .story-image {
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            background: #e9e2d6;
          }
          .story-image.fallback {
            display: grid;
            place-items: center;
            color: #756f63;
            font-size: 0.95rem;
          }
          .card-body { padding: 14px 14px 16px; }
          .publisher-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.84rem;
            color: #5c5548;
            flex-wrap: wrap;
          }
          .logo {
            width: 18px;
            height: 18px;
            border-radius: 3px;
          }
          h2 {
            margin: 10px 0 8px;
            font-size: 1.15rem;
            line-height: 1.28;
          }
          h2 a {
            color: var(--ink);
            text-decoration: none;
          }
          h2 a:hover { color: var(--accent); }
          p {
            margin: 0;
            line-height: 1.45;
            color: #39352d;
          }
          .read {
            margin-top: 12px;
            display: inline-block;
            color: var(--accent);
            font-weight: 600;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>
        <main className="wrap">
          <header>
            <h1>Cult News Digest</h1>
            <p>Generated from latest agent run. {totalCount} shortlisted stories. Generated at {generatedAt}.</p>
          </header>
          {hasStories ? (
            groups.map((group) => (
              <div className="story-group">
                <div className="group-header">
                  <h3 className="group-label">{group.label}</h3>
                  <span className={`group-badge ${group.type}`}>
                    {group.type === 'streamer-seeded' ? 'Streamer-seeded' : 'Independent'}
                  </span>
                  <span className="group-count">{group.stories.length} {group.stories.length === 1 ? 'article' : 'articles'}</span>
                </div>
                <div className="grid">
                  {group.stories.map((story) => renderCard(story))}
                </div>
              </div>
            ))
          ) : (
            <div className="story-group">
              <div className="grid">
                <article className="empty-state">
                  <h2>No stories passed the cult precision filter</h2>
                  <p>
                    The latest run completed successfully, but every candidate was rejected or failed fetch-level
                    validation.
                  </p>
                </article>
              </div>
            </div>
          )}
        </main>
      </body>
    </html>
  );
}

type GroupConfig = {
  label: string;
  type: 'streamer-seeded' | 'independent';
  patterns: string[];
};

function classifyStories(stories: EnrichedStory[], groupConfigs: GroupConfig[]): StoryGroup[] {
  const compiled = groupConfigs.map((gc) => ({
    ...gc,
    regexes: gc.patterns.map((p) => new RegExp(p, 'i')),
    stories: [] as EnrichedStory[],
  }));
  const ungrouped: EnrichedStory[] = [];

  for (const story of stories) {
    const haystack = `${story.title} ${story.url}`;
    const matched = compiled.find((gc) => gc.regexes.some((re) => re.test(haystack)));
    if (matched) {
      matched.stories.push(story);
    } else {
      ungrouped.push(story);
    }
  }

  const result: StoryGroup[] = compiled
    .filter((gc) => gc.stories.length > 0)
    .map((gc) => ({ label: gc.label, type: gc.type, stories: gc.stories }));

  if (ungrouped.length > 0) {
    result.push({ label: 'Independent Journalism', type: 'independent', stories: ungrouped });
  }

  return result;
}

async function main(): Promise<void> {
  const logText = readFileSync(LOG_PATH, 'utf-8');
  const rawDrafts = extractDraftsFromLog(logText);
  const summary = extractRunSummary(logText);

  const excludeUrls = new Set<string>(
    JSON.parse(readFileSync(new URL('../data/render-exclude-urls.json', import.meta.url), 'utf-8')) as string[]
  );

  // Deduplicate: same URL path on different hosts (e.g. independent.co.uk vs the-independent.com),
  // and same title from different syndication outlets (e.g. AP wire stories).
  const seenPaths = new Set<string>();
  const seenTitles = new Set<string>();
  const drafts = rawDrafts.filter((draft) => {
    if (excludeUrls.has(draft.url)) return false;
    let path: string;
    try {
      path = new URL(draft.url).pathname.toLowerCase();
    } catch {
      path = draft.url.toLowerCase();
    }
    const title = draft.title.trim().toLowerCase();
    if (seenPaths.has(path) || seenTitles.has(title)) return false;
    seenPaths.add(path);
    seenTitles.add(title);
    return true;
  });

  const stories: EnrichedStory[] = [];
  for (const draft of drafts) {
    const meta = await fetchStoryMeta(draft.url);
    stories.push({
      ...draft,
      title: meta.title?.trim() || draft.title,
      description: meta.description?.trim() || '',
      image: meta.image,
      publishedAt: meta.publishedAt || draft.publishedAt,
    });
  }

  const groupConfigs = JSON.parse(
    readFileSync(new URL('../data/story-groups.json', import.meta.url), 'utf-8')
  ) as GroupConfig[];

  const groups = classifyStories(stories, groupConfigs);

  const html = renderDocument(buildPage(groups, stories.length, new Date().toISOString()));
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(OUTPUT_PATH, html, 'utf-8');

  if (summary) {
    console.log(`[agent] wrote ${stories.length} stories to ${OUTPUT_PATH.pathname} from ${summary.processed ?? 0} processed candidates`);
  } else {
    console.log(`[agent] wrote ${stories.length} stories to ${OUTPUT_PATH.pathname}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[agent] failed to render html digest', { message });
  process.exitCode = 1;
});
