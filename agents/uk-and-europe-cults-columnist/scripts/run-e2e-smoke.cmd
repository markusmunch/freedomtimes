@echo off
setlocal
cd /d "%~dp0.."
set "AGENT_ENV=staging"
set "DISCOVERY_MAX_AGE_HOURS=168"
set "DRY_RUN=true"
set "GOOGLE_NEWS_LOCALE_IDS=GB-en,DE-de,FR-fr"
set "GOOGLE_NEWS_TOTAL_CAP=80"
set "CLUSTER_EXPANSION_ENABLED=false"
npx tsx src/index.ts --max=%~1
endlocal
