/**
 * Migration / emergency re-split: only works when `discovery-config.json` still has an inline
 * `googleNewsQueryDefinitions.groups` object. After the first split, edit
 * `data/discovery/groups-core.json` and `data/discovery/lang/*.json` directly and maintain
 * `groupFiles` in discovery-config.json by hand.
 *
 * Run from package root: npm run split:discovery-groups
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const CORE_KEYS = [
  'cultCore',
  'ukGeo',
  'ukGeoTight',
  'europeGeo',
  'nordicsGeo',
  'czGeo',
  'balkansGeo',
  'balticsGeo',
  'microstatesGeo',
  'journalismSignals',
  'justiceSignals',
  'victimSignals',
  'mediaSignals',
];

/** Primary language code → group keys owned by that file (cult + country OR lists). */
const LANG_GROUP_KEYS = {
  en: ['enHarmSignals', 'enWatchlistTerms', 'enEuropeCountryOr'],
  de: ['deAtChTerms', 'deEuropeCountryOr'],
  fr: ['frBeTerms', 'frEuropeCountryOr'],
  it: ['itTerms', 'itEuropeCountryOr'],
  es: ['esTerms', 'esEuropeCountryOr'],
  nl: ['nlTerms', 'nlEuropeCountryOr'],
  pl: ['plTerms', 'plEuropeCountryOr'],
  pt: ['ptTerms', 'ptEuropeCountryOr'],
  el: ['grTerms', 'elEuropeCountryOr'],
  ro: ['roTerms', 'roEuropeCountryOr'],
  fi: ['fiTerms', 'fiEuropeCountryOr'],
  cs: ['csTerms', 'csEuropeCountryOr'],
  sk: ['skTerms', 'skEuropeCountryOr'],
  hu: ['huTerms', 'huEuropeCountryOr'],
  bg: ['bgTerms', 'bgEuropeCountryOr'],
  hr: ['hrTerms', 'hrEuropeCountryOr'],
  sl: ['slTerms', 'slEuropeCountryOr'],
  sr: ['srTerms', 'srEuropeCountryOr'],
  bs: ['bsTerms', 'bsEuropeCountryOr'],
  mk: ['mkTerms', 'mkEuropeCountryOr'],
  sq: ['sqTerms', 'sqEuropeCountryOr'],
  uk: ['ukTerms', 'ukEuropeCountryOr'],
  sv: ['svTerms', 'svEuropeCountryOr'],
  no: ['noTerms', 'noEuropeCountryOr'],
  da: ['daTerms', 'daEuropeCountryOr'],
  is: ['isTerms', 'isEuropeCountryOr'],
  et: ['etTerms', 'etEuropeCountryOr'],
  lv: ['lvTerms', 'lvEuropeCountryOr'],
  lt: ['ltTerms', 'ltEuropeCountryOr'],
};

function main() {
  const cfgPath = join(root, 'discovery-config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const defs = cfg.googleNewsQueryDefinitions;
  if (!defs?.groups || typeof defs.groups !== 'object') {
    console.error(
      'discovery-config.json has no inline `groups` (already split). Edit data/discovery/*.json and `groupFiles` instead.',
    );
    process.exit(1);
  }
  const groups = defs.groups;

  const assigned = new Set([...CORE_KEYS]);
  for (const keys of Object.values(LANG_GROUP_KEYS)) {
    for (const k of keys) {
      assigned.add(k);
    }
  }

  for (const k of Object.keys(groups)) {
    if (!assigned.has(k)) {
      throw new Error(`Group "${k}" is not listed in CORE_KEYS or LANG_GROUP_KEYS — add it to the split script.`);
    }
  }

  for (const k of assigned) {
    if (!(k in groups)) {
      throw new Error(`Expected group "${k}" in discovery-config.json`);
    }
  }

  function pick(keys) {
    const o = {};
    for (const k of keys) {
      o[k] = groups[k];
    }
    return o;
  }

  mkdirSync(join(root, 'data/discovery/lang'), { recursive: true });

  const corePayload = {
    _docs: 'Shared template groups for googleNewsQueryDefinitions.templates (language-agnostic).',
    groups: pick(CORE_KEYS),
  };
  writeFileSync(join(root, 'data/discovery/groups-core.json'), `${JSON.stringify(corePayload, null, 2)}\n`);

  const langCodes = Object.keys(LANG_GROUP_KEYS).sort();
  for (const lang of langCodes) {
    const payload = {
      _docs: `Language-specific Google News query groups for "${lang}" (cult-related + Europe country OR list).`,
      language: lang,
      groups: pick(LANG_GROUP_KEYS[lang]),
    };
    writeFileSync(join(root, `data/discovery/lang/${lang}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }

  const groupFiles = ['data/discovery/groups-core.json', ...langCodes.map((l) => `data/discovery/lang/${l}.json`)];

  const next = {
    ...cfg,
    googleNewsQueryDefinitions: {
      _docs: 'Inline `groups` removed; loaded from `groupFiles` in discoveryConfig.ts.',
      groupFiles,
      templates: defs.templates,
      rawQueries: defs.rawQueries ?? [],
    },
  };

  writeFileSync(cfgPath, `${JSON.stringify(next, null, 2)}\n`);
  console.error(`Wrote ${groupFiles.length} group files and updated discovery-config.json`);
}

main();
