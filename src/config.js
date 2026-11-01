// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
// -----------------------------------------------------------------------------

import { parseHosts } from './pixoo/discovery.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const POLL_INTERVALS = [10, 30, 60];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  cloud_discovery: true,
  hosts: '',
  poll_interval: '30',
  language: 'en',
};

const pick = (value, allowed, fallback) => {
  const number = Number(value ?? fallback);
  return allowed.includes(number) ? number : Number(fallback);
};

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
};

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ cloudDiscovery: boolean, hosts: string[], pollMs: number, language: string }} The configuration.
 */
export function normalizeConfig(raw = {}) {
  return {
    cloudDiscovery: bool(raw.cloud_discovery, DEFAULTS.cloud_discovery),
    hosts: parseHosts(raw.hosts ?? DEFAULTS.hosts),
    pollMs: pick(raw.poll_interval, POLL_INTERVALS, DEFAULTS.poll_interval) * 1000,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
  };
}
