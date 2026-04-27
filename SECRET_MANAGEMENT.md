# Secret Management & Synchronization

This document explains how secrets and environment variables flow through the system and how to keep them in sync.

## Canonical Source Hierarchy

```
Local Environment Files (Primary Source)
  ├─ .env.dev (base, shared)
  ├─ .env.staging (staging overlay)
  └─ .env.production (production overlay)
        ↓ (scripts/set-github-secrets.ps1)
GitHub Actions Secrets & Variables (Secondary Store)
        ↓ (GitHub Actions workflows read)
CI/CD Automation Channels:
  ├─ terraform-staging.yml / terraform-production.yml
  └─ GitHub Actions variables propagate to Terraform
        ↓ (workflows execute during apply)
Cloudflare Worker Secrets & Terraform-managed Resources
  ├─ Worker AUTH0_* secrets
  └─ Terraform-managed infrastructure
```

## Local Development (Your Machine)

**Source Files:**
- `.env.dev` — shared base config
- `.env.staging` — staging-specific overrides (if needed)
- `.env.production` — production-specific overrides (handled carefully)

**How they're used:**
- `wrangler dev` reads `.env.*` files directly via `--env` flags
- Local development does NOT use the sync script
- Astro/Wrangler load variables at runtime from these files

**When to update:**
- Add new secrets or config values here first
- These are the truth; GitHub secrets should mirror these values

## Syncing to GitHub

**Script:** `scripts/set-github-secrets.ps1`

**What it does:**
1. Reads `.env.dev` (base) + `.env.staging` / `.env.production` (overlays)
2. Parses into GitHub secrets (encrypted) and variables (public)
3. Optionally syncs Cloudflare Worker secrets via `wrangler secret put`

**When to run:**
- After updating `.env.staging` or `.env.production`
- Before triggering CI/CD workflows

**How to run:**
```powershell
# Dry run (shows what would be synced)
.\scripts\set-github-secrets.ps1 -DryRun

# Sync all to GitHub (staging + production)
.\scripts\set-github-secrets.ps1

# Sync only staging
.\scripts\set-github-secrets.ps1 -Target Staging

# Also sync Cloudflare Worker secrets (local machine must have wrangler installed)
.\scripts\set-github-secrets.ps1 -SyncCloudflareWorkerSecrets
```

## CI/CD Automation (GitHub Actions)

**Workflows:**
- `.github/workflows/terraform-staging.yml`
- `.github/workflows/terraform-production.yml`

**What they do:**
1. Read env vars from GitHub Actions secrets/variables
2. Pass them to Terraform for infrastructure provisioning
3. After Terraform apply, sync Cloudflare Worker secrets via `wrangler secret put`

**Data flow:**
```
GitHub Secrets/Variables
  → Terraform Cloud (backend state)
  → Cloudflare/Auth0/Turso resources
  → Worker AUTH0_* secrets set via wrangler CLI
```

## Troubleshooting Out-of-Sync Secrets

**Symptom:** Worker errors about missing AUTH0_* secrets, or auth failures

**Root causes:**
1. GitHub secrets are stale (script wasn't run after updating `.env.staging`)
2. Workflow wasn't triggered with latest secrets
3. Cloudflare Worker secrets differ from GitHub variables

**How to fix:**
1. Update `.env.staging` or `.env.production` with new values
2. Run the sync script: `.\scripts\set-github-secrets.ps1 -SyncCloudflareWorkerSecrets`
3. Verify in GitHub: https://github.com/cultpodcasts/freedomtimes/settings/secrets/actions
4. Trigger the workflow again manually

## Auth0 Secrets Specifics

Different secret names are used for staging vs. production auth apps:

| Secret | Staging | Production | Local |
|--------|---------|-----------|-------|
| Client ID | `AUTH0_LOGIN_APP_CLIENT_ID_STAGING` | `AUTH0_LOGIN_APP_CLIENT_ID_PRODUCTION` | `AUTH0_LOGIN_APP_CLIENT_ID` |
| Client Secret | `AUTH0_LOGIN_APP_CLIENT_SECRET_STAGING` | `AUTH0_LOGIN_APP_CLIENT_SECRET_PRODUCTION` | `AUTH0_LOGIN_APP_CLIENT_SECRET` |
| Domain (shared) | `TF_VAR_AUTH0_DOMAIN` | `TF_VAR_AUTH0_DOMAIN` | `TF_VAR_AUTH0_DOMAIN` |

The script automatically maps these when syncing to GitHub.

## Best Practices

1. **Keep `.env.*` files private** — Add them to `.gitignore`, never commit secrets
2. **Run sync script after any local env change** — Before expecting CI/CD to work
3. **Use specific targets** — `set-github-secrets.ps1 -Target Staging` to avoid accidentally syncing production
4. **Dry-run first** — Review what will be synced before committing to it
5. **Document why a secret exists** — Add comments in `.env.*.example` for each secret explaining its purpose

## See Also

- [web/README.md](web/README.md) — Local development setup
- [LOCAL_DEV_REQUIREMENTS.md](LOCAL_DEV_REQUIREMENTS.md) — Prerequisites for local dev
- [DEVELOPMENT_GUARDRAILS.md](DEVELOPMENT_GUARDRAILS.md) — Security and quality guidelines
