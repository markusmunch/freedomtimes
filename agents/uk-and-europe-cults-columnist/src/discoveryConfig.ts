import { readFileSync } from 'node:fs';

type DiscoveryConfig = {
  googleNewsCountryTerms?: unknown;
  googleNewsGenericQueries?: unknown;
  googleNewsQueryDefinitions?: unknown;
  newsdataCountryCodes?: unknown;
  newsdataLanguages?: unknown;
  newsdataQueries?: unknown;
  regionTerms?: unknown;
};

type GoogleNewsQueryDefinitions = {
  groups?: unknown;
  templates?: unknown;
  rawQueries?: unknown;
};

function expectStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`discovery-config.json field '${field}' must be a string array`);
  }
  return value;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`discovery-config.json field '${field}' must be a string`);
  }
  return value;
}

function expectStringRecordOfArrays(value: unknown, field: string): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`discovery-config.json field '${field}' must be an object of string arrays`);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const output: Record<string, string[]> = {};

  for (const [key, nested] of entries) {
    output[key] = expectStringArray(nested, `${field}.${key}`);
  }

  return output;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatGroupExpression(values: string[]): string {
  return `(${values.join(' OR ')})`;
}

function buildGoogleNewsQueriesFromDefinitions(
  definitionsValue: unknown,
  fallbackQueries: string[] | undefined,
): string[] {
  if (definitionsValue === undefined) {
    return fallbackQueries ?? [];
  }

  if (!definitionsValue || typeof definitionsValue !== 'object' || Array.isArray(definitionsValue)) {
    throw new Error("discovery-config.json field 'googleNewsQueryDefinitions' must be an object");
  }

  const definitions = definitionsValue as GoogleNewsQueryDefinitions;
  const groups = expectStringRecordOfArrays(definitions.groups, 'googleNewsQueryDefinitions.groups');
  const templates = expectStringArray(definitions.templates, 'googleNewsQueryDefinitions.templates');
  const rawQueries =
    definitions.rawQueries === undefined
      ? []
      : expectStringArray(definitions.rawQueries, 'googleNewsQueryDefinitions.rawQueries');

  const expandedTemplates = templates.map((template) => {
    const query = template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, groupName: string) => {
      const groupValues = groups[groupName];
      if (!groupValues) {
        throw new Error(
          `discovery-config.json template references unknown group '${groupName}' in googleNewsQueryDefinitions.templates`,
        );
      }
      return formatGroupExpression(groupValues);
    });

    return normalizeWhitespace(query);
  });

  const unique = new Set<string>();
  const ordered: string[] = [];

  for (const query of [...expandedTemplates, ...rawQueries]) {
    const normalized = normalizeWhitespace(query);
    if (!normalized || unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function loadWatchlistSites(): string[] {
  const configUrl = new URL('../watchlist-sites.json', import.meta.url);
  const raw = readFileSync(configUrl, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return expectStringArray(parsed, 'watchlist-sites');
}

function loadDiscoveryConfig(): {
  googleNewsCountryTerms: string[];
  googleNewsGenericQueries: string[];
  newsdataCountryCodes: string;
  newsdataLanguages: string;
  newsdataQueries: string[];
  regionTerms: string[];
} {
  const configUrl = new URL('../discovery-config.json', import.meta.url);
  const raw = readFileSync(configUrl, 'utf-8');
  const parsed = JSON.parse(raw) as DiscoveryConfig;
  const fallbackGoogleQueries = parsed.googleNewsGenericQueries
    ? expectStringArray(parsed.googleNewsGenericQueries, 'googleNewsGenericQueries')
    : undefined;

  return {
    googleNewsCountryTerms: expectStringArray(parsed.googleNewsCountryTerms, 'googleNewsCountryTerms'),
    googleNewsGenericQueries: buildGoogleNewsQueriesFromDefinitions(
      parsed.googleNewsQueryDefinitions,
      fallbackGoogleQueries,
    ),
    newsdataCountryCodes: expectString(parsed.newsdataCountryCodes, 'newsdataCountryCodes'),
    newsdataLanguages: expectString(parsed.newsdataLanguages, 'newsdataLanguages'),
    newsdataQueries: expectStringArray(parsed.newsdataQueries, 'newsdataQueries'),
    regionTerms: expectStringArray(parsed.regionTerms, 'regionTerms'),
  };
}

const DISCOVERY_CONFIG = loadDiscoveryConfig();
const WATCHLIST_SITES = loadWatchlistSites();

export const PRIORITY_WATCHLIST_HOSTS = WATCHLIST_SITES;
export const GOOGLE_NEWS_WATCHLIST_SITES = WATCHLIST_SITES;
export const GOOGLE_NEWS_COUNTRY_TERMS = DISCOVERY_CONFIG.googleNewsCountryTerms;
export const GOOGLE_NEWS_GENERIC_QUERIES = DISCOVERY_CONFIG.googleNewsGenericQueries;
export const NEWSDATA_COUNTRY_CODES = DISCOVERY_CONFIG.newsdataCountryCodes;
export const NEWSDATA_LANGUAGES = DISCOVERY_CONFIG.newsdataLanguages;
export const NEWSDATA_QUERIES = DISCOVERY_CONFIG.newsdataQueries;
export const REGION_TERMS = DISCOVERY_CONFIG.regionTerms;
