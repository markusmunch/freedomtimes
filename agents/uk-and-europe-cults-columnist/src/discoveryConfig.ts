import { readFileSync } from 'node:fs';

type DiscoveryConfig = {
  googleNewsCountryTerms?: unknown;
  googleNewsGenericQueries?: unknown;
  newsdataCountryCodes?: unknown;
  newsdataLanguages?: unknown;
  newsdataQueries?: unknown;
  regionTerms?: unknown;
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

  return {
    googleNewsCountryTerms: expectStringArray(parsed.googleNewsCountryTerms, 'googleNewsCountryTerms'),
    googleNewsGenericQueries: expectStringArray(parsed.googleNewsGenericQueries, 'googleNewsGenericQueries'),
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
