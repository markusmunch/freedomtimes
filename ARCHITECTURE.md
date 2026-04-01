# Freedom Times — High-Level Architecture

> **Status:** Draft for discussion  
> **Goal:** Agree on a stack and delivery plan that can produce a public-facing MVP within two weeks.

---

## 1. Product Overview

Freedom Times is a UK/Europe-focused news platform for cult survivors. It vets stories and routes them as exclusives to established journalists. The two primary user groups are:

| Group | Need |
|---|---|
| **Public visitors** | Fast, readable, accessible news stories |
| **Admin editors** | Secure ability to create, edit, publish and delete stories |

---

## 2. Key Non-Functional Requirements

| Requirement | Notes |
|---|---|
| **Core Web Vitals / LCP** | Server-rendered HTML on first request; minimal JS shipped to the browser |
| **SEO** | Full SSR; pages must be crawlable without executing JavaScript |
| **Hosting** | Cloudflare Workers (not Pages) for full programmatic control; Workers can still serve static Assets |
| **PWA / App** | Packagable via Google Bubblewrap as Android/iOS TWA apps; requires HTTPS, Web App Manifest, Service Worker |
| **Push notifications** | Web Push API; note Apple only enabled this in iOS 16.4+ |
| **Newsletter** | Email subscription + periodic digest |

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public Internet                          │
└───────────┬─────────────────────────────┬───────────────────────┘
            │                             │
    Browser (Visitor)              Browser (Editor / Admin)
            │                             │
            ▼                             │
┌───────────────────────┐                 │
│  Cloudflare Workers   │◄────────────────┘
│  (SSR + Asset Serving)│
│                       │  reads stories
│  ┌─────────────────┐  │◄──────────────┐
│  │ KV Store        │  │               │
│  │ (published      │  │  ┌────────────┴──────────┐
│  │  story cache)   │  │  │  Azure HTTP Functions  │
│  └─────────────────┘  │  │  (CRUD API)            │
│                       │  │                        │
│  ┌─────────────────┐  │  │  ┌──────────────────┐  │
│  │ R2 Bucket       │  │  │  │  Cosmos DB        │  │
│  │ (images/videos/ │  │  │  │  (canonical store │  │
│  │  static assets) │  │  │  │   for stories)   │  │
│  └─────────────────┘  │  │  └──────────────────┘  │
└───────────────────────┘  └────────────────────────┘
                                       ▲
                               Auth0 (RBAC)
                                       ▲
                               Editor's browser
```

---

## 4. Component Breakdown

### 4.1 Cloudflare Workers — Public SSR Layer

**Role:** Receives every HTTP request from the public; renders HTML server-side using data pulled from KV; serves static assets from R2/Workers Assets.

**Recommended framework:** [Astro](https://astro.build/) with the [`@astrojs/cloudflare` adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

- Astro's **Islands architecture** ships zero JS to the browser by default — ideal for a content-heavy news site where most pages are essentially read-only.
- Selective hydration means interactive widgets (search, subscribe form) are hydrated in isolation without blocking LCP.
- Astro can use the Cloudflare Workers runtime natively (no Node.js emulation layer, no cold-start overhead — Cloudflare uses V8 isolates, not containers).
- Astro generates a standard `manifest.webmanifest` and supports Service Worker injection, making PWA integration straightforward.

**Alternative worth considering:** [SvelteKit](https://kit.svelte.dev/) with the Cloudflare adapter — slightly heavier default JS bundle than Astro but still excellent, and gives a richer reactive component model for the progressive Admin UI.

> **Discussion point:** Does the Admin UI need enough reactivity to tip the balance toward SvelteKit? If the admin surface is small (a few CRUD forms), Astro with a sprinkle of Svelte islands is likely the better trade-off.

**Caching strategy:**

```
Request → Worker
  → Check KV for rendered HTML fragment (or full story data)
    → Cache hit  → stream HTML to client
    → Cache miss → fetch from Azure Function → render → store in KV → stream to client
```

Published stories are written to KV by the Azure Function at publish time, so the Worker rarely needs to call the Azure Function for reads. Cache TTL can be long (hours/days) because the Azure Function explicitly invalidates/rewrites the KV entry whenever a story is updated or deleted.

**Concern — KV eventual consistency:** Cloudflare KV has eventual consistency across regions. A freshly published story could take up to 60 seconds to propagate globally. For a news agency this is acceptable; the Azure Function's KV write will propagate before editors share the link. If sub-second global consistency is required, [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) or direct R2 reads would need to be evaluated.

---

### 4.2 Cloudflare KV — Published Story Cache

Stores pre-serialised story payloads (JSON) keyed by story `slug`. The Worker reads from KV on every public page request — sub-millisecond reads within the same region.

```
Key:   story:{slug}
Value: JSON blob (headline, body, author, tags, publishDate, images…)

Key:   index:homepage
Value: JSON array of the latest N story summaries for the front page
```

Index keys (homepage, by-tag, etc.) are rewritten by the Azure Function whenever a story changes.

---

### 4.3 Cloudflare R2 — Media Storage

Stores:
- Uploaded images and videos attached to stories
- Static assets (fonts, icons) that are too large or binary for KV

R2 is S3-compatible and has no egress fees, making it well-suited for media. The Astro Worker can generate signed URLs or serve assets through a dedicated `assets.freedomtimes.com` Worker route.

---

### 4.4 Azure HTTP-Triggered Functions — CRUD API

**Language:** TypeScript (Node.js runtime on Azure Functions v4).

Responsibilities:
1. Authenticate the requesting editor via Auth0 JWT validation (JWKS endpoint).
2. Validate role claims (`role: editor` or `role: admin`).
3. Perform CRUD against Cosmos DB.
4. On **publish** or **update**: serialise the story and write to Cloudflare KV via the [Cloudflare API](https://developers.cloudflare.com/api/operations/workers-kv-namespace-write-key-value-pair-with-metadata) (authenticated with a KV API token stored as a Function secret).
5. On **delete**: remove the KV entry and update index keys.
6. On **media upload**: accept the binary, store in R2 via the S3-compatible API, return the CDN URL.

**Endpoints (sketch):**

| Method | Path | Description |
|---|---|---|
| `GET` | `/stories` | List stories (drafts + published) — admin only |
| `GET` | `/stories/{id}` | Get a single story by internal ID |
| `POST` | `/stories` | Create a draft story |
| `PUT` | `/stories/{id}` | Update headline/body/status/tags/etc. |
| `DELETE` | `/stories/{id}` | Soft-delete (archive) |
| `POST` | `/stories/{id}/publish` | Publish: writes to KV, sets `status=published` in Cosmos |
| `POST` | `/media/upload` | Upload image or video to R2 |
| `POST` | `/subscribers` | Register a newsletter subscriber |

**Cosmos DB container design:**

```
Database: freedomtimes
  Container: stories        (partition key: /status)
  Container: subscribers    (partition key: /email)
```

Using `/status` as the partition key for stories keeps all `published` stories in the same logical partition, making "list published stories" queries cheap. Drafts live in their own partition, which aligns with query patterns.

**Cost and CPU consideration:** Azure Functions on the Consumption plan have a very generous free tier (1 million invocations/month). Because admin writes are infrequent (not in the hot read path), this adds negligible cost.

---

### 4.5 Auth0 — Authentication & RBAC

Auth0 handles login for editors/admins and issues JWTs with custom role claims. The Admin UI requests a token from Auth0 (SPA flow or PKCE), then includes the Bearer token with every call to the Azure Function.

**Roles:**

| Role | Permissions |
|---|---|
| `editor` | Create and update own stories; upload media |
| `admin` | All editor permissions + delete stories + manage subscribers |

The Cloudflare Worker also validates tokens for any protected admin routes served within the same origin (e.g., `/admin/*`). This allows the progressive Admin UI to be progressively revealed within the same Astro application without a separate admin domain.

**Discussion point:** Hosting the admin UI within the same Workers origin (progressive enhancement) vs a separate subdomain (`admin.freedomtimes.com`). The same-origin approach gives a single deployment artefact and avoids CORS issues between admin UI and API. The trade-off is that the Worker needs to handle JWT validation.

---

### 4.6 Progressive Admin UI

The Admin UI is a set of **Astro islands** (or Svelte components) that are conditionally rendered when the Worker detects a valid admin JWT in the request (e.g., in a cookie set after Auth0 login). This avoids shipping any admin UI code to unauthenticated visitors.

Admin surfaces needed for MVP:
- Story list view (drafts + published)
- Story create/edit form (rich text body editor — e.g., [Tiptap](https://tiptap.dev/) or [Quill](https://quilljs.com/))
- Image/video upload widget
- Publish / Unpublish / Delete controls
- Subscriber list (read-only count + export for MVP)

---

### 4.7 PWA, Service Worker & Bubblewrap

1. **Web App Manifest** (`manifest.webmanifest`): name, icons, `display: standalone`, `theme_color` matching the Times-inspired palette.
2. **Service Worker**: pre-cache the shell (header, footer, fonts, CSS). Use a Stale-While-Revalidate strategy for story pages so they remain readable offline.
3. **Web Push**: subscribe visitors to push notifications via the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API). Store subscription objects in Cosmos DB (`subscribers` container). When a story is published, the Azure Function (or a secondary timer-triggered Function) sends push messages via VAPID.
   - ⚠️ **iOS caveat**: Web Push is only available in iOS 16.4+ when the site is added to the Home Screen as a PWA. For earlier iOS the Bubblewrap TWA wrapping gives native push notifications via FCM.
4. **Bubblewrap**: wraps the PWA as an Android TWA and an iOS WKWebView app. Both platforms use FCM/APNs via a thin native wrapper, bypassing the Web Push iOS limitation.

---

### 4.8 Newsletter

- Subscribers provide email via a form (POST `/subscribers`).
- A **timer-triggered Azure Function** (e.g., weekly) queries recently published stories from Cosmos DB, renders an HTML email digest, and sends via a transactional email provider.
- **Recommended provider**: [SendGrid](https://sendgrid.com/) (free tier: 100 emails/day) or [Resend](https://resend.com/) (100/day free, modern API, TypeScript SDK). Resend is worth evaluating — simple API and good developer experience.
- Double opt-in should be implemented (GDPR requirement for EU subscribers).

---

## 5. Story Data Model

```typescript
interface Story {
  id: string;                  // UUID, Cosmos document ID
  slug: string;                // URL-safe, human-readable, unique
  headline: string;
  subHeadline?: string;
  summary?: string;            // 1–2 sentences for index pages / OG tags
  body: string;                // Rich HTML or Markdown (decided at build)
  authorAlias: string;         // Pseudonym to protect sources
  status: 'draft' | 'published' | 'archived';
  tags: string[];              // ["trafficking", "uk", "courts"]
  images: StoryMedia[];
  videos: StoryMedia[];
  publishDate?: string;        // ISO 8601, set on first publish
  modifiedDate: string;        // ISO 8601, updated on every save
}

interface StoryMedia {
  url: string;                 // R2 CDN URL
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}
```

---

## 6. Look & Feel — Broadsheet / Times-Inspired

| Element | Approach |
|---|---|
| **Typeface** | Serif for headlines (e.g., *Playfair Display* or *Georgia*); clean sans-serif for body text (e.g., *Inter* or system-ui). Self-host fonts in R2 to avoid Google Fonts round-trips that hurt LCP. |
| **Colour palette** | Off-white background (`#FAFAF8`), near-black ink (`#1A1A1A`), a single accent (deep red `#B22222` or navy `#0A2540`) for section labels and interactive elements. |
| **Layout** | CSS Grid multi-column layout mimicking broadsheet column proportions. Large hero story with image; secondary stories in a 3-column grid below the fold. |
| **Whitespace** | Generous line-height (1.7), wide margins, clear typographic hierarchy. |
| **Images** | `<img loading="lazy">` with explicit `width`/`height` to prevent layout shift (CLS). Hero image eager-loaded for LCP. |
| **Dark mode** | `prefers-color-scheme` media query from day one; minimal overhead and good a11y. |

---

## 7. Deployment Pipeline

```
Developer / Editor action
        │
        ▼
GitHub repository
  (source of truth for frontend code)
        │
        ▼
GitHub Actions CI
  ├── Lint + type-check
  ├── Build Astro → Workers bundle
  └── Deploy to Cloudflare Workers via Wrangler
        │
        ▼
Cloudflare Workers (production)
        │
        reads stories from
        ▼
Cloudflare KV  ◄───── Azure Function (publish event)
```

Azure Functions are deployed separately (either via GitHub Actions + Azure CLI or VS Code Azure extension) and are independent of the Workers deployment.

---

## 8. Open Questions & Discussion Points

| # | Question | Options |
|---|---|---|
| 1 | **Astro vs SvelteKit** for the Worker? | Astro = less JS by default, simpler for content sites. SvelteKit = richer reactive admin UI. Can we use Astro + Svelte islands to get both? |
| 2 | **Rich text format** for story body: HTML or Markdown? | Markdown is easier to diff/store; HTML gives editors more control. Markdown-to-HTML at render time (e.g., `marked`) adds ~0.1 ms CPU. |
| 3 | **KV vs R2 for story cache**: KV values are limited to 25 MB; R2 objects are unlimited. For stories with many embedded images, should the canonical SSR source be R2 JSON files? | KV is fine for text payloads; R2 for blobs. Recommend KV for story JSON, R2 for media. |
| 4 | **Admin UI same-origin vs subdomain?** | Same-origin simplifies auth; subdomain gives a clean separation of concerns. |
| 5 | **Newsletter provider**: SendGrid vs Resend vs Mailchimp? | Resend recommended for developer simplicity; Mailchimp if list management UI is needed before admin is built. |
| 6 | **Cosmos DB partition key**: `/status` vs `/tags[0]` vs something else? | `/status` suits the admin read pattern; consider `/publishDate` (year-month) for archival query efficiency at scale. |
| 7 | **GDPR / UK-GDPR compliance**: subscriber double opt-in, right to erasure, data residency? | Azure region should be `uksouth` or `northeurope`. Cosmos DB has point-in-time restore for accidental deletes. |
| 8 | **Source protection**: stories about cult survivors require careful handling of author/source metadata in the DB. | Author aliases only in public-facing fields; real identities (if stored at all) in a separate, highly restricted Cosmos container. |

---

## 9. Deliverables

The following items are listed in priority order. Each should be completed and verified before moving to the next.

1. Scaffold Astro project; configure Cloudflare Workers with `wrangler`; deploy "Hello World" to production URL.
2. Design system: typography, colour palette, CSS Grid layout; homepage shell.
3. KV integration: Worker reads story JSON from KV; story page template.
4. Static story fixtures in KV; homepage + article page rendering; Core Web Vitals baseline.
5. PWA: Web App Manifest + Service Worker; Lighthouse PWA audit.
6. Azure Function scaffold; Cosmos DB containers; CRUD endpoints; deploy to Azure.
7. Auth0 tenant setup; login flow in Astro Worker; JWT validation middleware.
8. Admin UI: story list, create/edit form, publish action (writes to KV).
9. Image and video upload to R2; media embedding in the story editor.
10. Newsletter subscribe form; email digest wiring (Resend/SendGrid).
11. End-to-end smoke test; Lighthouse audit; MVP sign-off.

---

## 10. Technology Summary

| Layer | Technology | Rationale |
|---|---|---|
| SSR Framework | [Astro](https://astro.build/) + `@astrojs/cloudflare` | Zero-JS-by-default, Islands hydration, native Workers runtime |
| Hosting | Cloudflare Workers | V8 isolates (no cold starts), global edge network, KV/R2 integration |
| Story Cache | Cloudflare KV | Sub-millisecond reads, ideal for published story payloads |
| Media Storage | Cloudflare R2 | S3-compatible, zero egress fees |
| CRUD API | Azure Functions (TypeScript, v4) | Serverless, Cosmos DB SDK, scalable |
| Database | Azure Cosmos DB (NoSQL) | Low-latency, globally distributed, flexible schema |
| Auth | Auth0 | Managed OIDC/JWT, RBAC, SPA + API support |
| Email | Resend (or SendGrid) | Simple API, TypeScript SDK, generous free tier |
| Push Notifications | Web Push (VAPID) + FCM via Bubblewrap | Cross-platform; TWA bridges iOS Web Push gap |
| App Packaging | Google Bubblewrap (TWA) | Wraps PWA as Android/iOS apps |
| CI/CD | GitHub Actions + Wrangler | Automated lint/build/deploy on push |
