import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canUseFeature,
  FEATURE_IDS,
  isProTemplate,
  PLAN_CONFIG,
  PRICING_FEATURES,
  TEMPLATE_IDS
} from '../frontend/src/plan-access.js';

test('templates are allocated without overlap and match the published plan counts', () => {
  assert.equal(TEMPLATE_IDS.FREE.length, 6);
  assert.equal(TEMPLATE_IDS.PRO.length, 11);
  assert.equal(new Set([...TEMPLATE_IDS.FREE, ...TEMPLATE_IDS.PRO]).size, 17);
  assert.equal(TEMPLATE_IDS.FREE.some(isProTemplate), false);
  assert.equal(TEMPLATE_IDS.PRO.every(isProTemplate), true);
});

test('essential Free features are included and future Pro features remain unavailable', () => {
  for (const label of [
    'Resume editor',
    'Standard PDF export',
    'Resume-only ATS checks',
    'Basic cover-letter tools',
    'JSON import and export',
    'Browser autosave'
  ]) {
    assert.equal(PRICING_FEATURES.find(feature => feature.label === label)?.free, 'Included');
  }
  assert.equal(PRICING_FEATURES.find(feature => feature.label === 'Tailored resume versions')?.pro, 'Not available yet');
});

test('pro features reject missing, client-claimed, inactive, expired, or incomplete entitlements', () => {
  const valid = {
    planId: 'pro',
    status: 'active',
    source: 'server-verified',
    validUntil: 2_000
  };

  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, null, 1_000), false);
  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, { ...valid, source: 'client' }, 1_000), false);
  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, { ...valid, status: 'inactive' }, 1_000), false);
  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, { ...valid, validUntil: 1_000 }, 1_000), false);
  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, { ...valid, validUntil: null }, 1_000), false);
  assert.equal(canUseFeature('unknown-feature', valid, 1_000), false);
});

test('only recognized Pro features accept an active unexpired verified entitlement', () => {
  const entitlement = {
    planId: 'pro',
    status: 'active',
    source: 'server-verified',
    validUntil: 2_000
  };

  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES, entitlement, 1_000), true);
  assert.equal(canUseFeature(FEATURE_IDS.JOB_DESCRIPTION_ATS, entitlement, 1_000), true);
});

test('monthly and yearly prices match the displayed INR subscriptions', () => {
  assert.equal(PLAN_CONFIG.pro.currency, 'INR');
  assert.deepEqual(PLAN_CONFIG.pro.monthly, { price: 99, interval: 'month' });
  assert.deepEqual(PLAN_CONFIG.pro.yearly, { price: 399, interval: 'year' });
});

test('upgrade modal exposes a template preview action for gated Pro templates', () => {
  const html = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  assert.match(html, /id="previewUpgrade"/);
  assert.match(html, /id="templatePreviewModalBg"/);
});
