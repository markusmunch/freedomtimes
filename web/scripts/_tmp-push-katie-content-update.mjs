import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emdashMcpToolsCall } from "./emdash-mcp-client.mjs";

const STAGING = "https://staging.freedomtimes.news";

function windowsUserEnv(name) {
	try {
		return execSync(
			`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${name}','User')"`,
			{ encoding: "utf8" },
		).trim();
	} catch {
		return "";
	}
}

function token() {
	const env =
		process.env.EMDASH_MCP_TOKEN?.trim() ||
		process.env.EMDASH_STAGING_PAT?.trim() ||
		process.env.EMDASH_STAGING_TOKEN?.trim();
	if (env) return env;
	const pat = windowsUserEnv("EMDASH_STAGING_PAT");
	if (pat) return pat;
	const auth = JSON.parse(
		readFileSync(join(homedir(), ".config", "emdash", "auth.json"), "utf8"),
	);
	const t = auth["https://staging.freedomtimes.news"]?.accessToken;
	if (!t) throw new Error("No staging token");
	return t;
}

const payload = JSON.parse(
	readFileSync(
		new URL("../.tmp/katie-content-update.json", import.meta.url),
		"utf8",
	),
);

const out = await emdashMcpToolsCall(STAGING, token(), "content_update", payload);
console.log(JSON.stringify(out, null, 2));
