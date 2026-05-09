$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
$env:EMDASH_STAGING_PAT = [Environment]::GetEnvironmentVariable("EMDASH_STAGING_PAT", "User")
if (-not $env:EMDASH_STAGING_PAT) {
	throw "EMDASH_STAGING_PAT user env var not set"
}
node scripts/_tmp-push-katie-content-update.mjs
