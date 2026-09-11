import assert from 'node:assert/strict';
import test from 'node:test';
import { configFromEnv } from '../scripts/cf-config.mjs';

const buildVariables = {
  D1_DATABASE_NAME: 'caju-os-prod',
  D1_DATABASE_ID: '00000000-0000-4000-8000-000000000001',
  CUSTOM_DOMAIN: 'operacoes.cajutech.net',
  ZONE_NAME: 'cajutech.net',
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'integracao@example.com',
  JIRA_PROJECT_KEY: 'FSA',
};

test('without build variables the local .cloudflare.json stays the only source', () => {
  assert.equal(configFromEnv({}), null);
});

test('build variables produce the same shape as .cloudflare.json, Jira vars included', () => {
  assert.deepEqual(configFromEnv(buildVariables), {
    d1_database_name: 'caju-os-prod',
    d1_database_id: '00000000-0000-4000-8000-000000000001',
    custom_domain: 'operacoes.cajutech.net',
    zone_name: 'cajutech.net',
    vars: { JIRA_BASE_URL: 'https://example.atlassian.net', JIRA_EMAIL: 'integracao@example.com', JIRA_PROJECT_KEY: 'FSA' },
  });
});

test('a partial set of build variables stops the deploy instead of dropping the domain or Jira vars', () => {
  const { CUSTOM_DOMAIN: _domain, JIRA_EMAIL: _email, ...partial } = buildVariables;
  assert.throws(() => configFromEnv(partial), /CUSTOM_DOMAIN, JIRA_EMAIL/);
});
