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

test('Pro template preview offers PDF export without a template-application trial modal', () => {
  const html = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="previewUpgrade"/);
  assert.doesNotMatch(html, /proTemplateTrialModalBg|applyProTemplate/);
  assert.match(html, /id="templatePreviewModalBg"/);
  assert.match(html, /id="templatePreviewAllowance"/);
  assert.match(html, /id="exportProTemplatePreview"[^>]*disabled/);
  assert.doesNotMatch(source, /template-preview-btn|data-template-preview/);
});

test('Free users preview Pro templates and can render a PDF without applying the template', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /pendingProTemplate=null;\s*openTemplatePreview\(templateId\)/);
  assert.match(source, /async function exportPDF\(templateId=null\)/);
  assert.match(source, /void exportPDF\(templateId\)/);
  assert.match(source, /consumeProTemplateDownload\(cloudUser\.uid\)/);
  assert.match(source, /You have used both free Pro-template PDF downloads\. Export is disabled/);
  assert.match(source, /of 2 free Pro PDF downloads remaining/);
  assert.match(source, /exportButton\.disabled=true/);
  assert.match(source, /if\(!cloudUser\)\{[\s\S]*?button\.disabled=true/);
  assert.match(source, /!cloudUser\|\|!Number\.isInteger\(proTemplateDownloadsRemaining\)\|\|proTemplateDownloadsRemaining<1/);
  assert.doesNotMatch(source, /applyPendingProTemplate|showProTemplateTrial/);
});

test('upgrade modal actions wrap instead of overlapping at narrow widths', () => {
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(styles, /\.upgrade-modal \.modal-actions[^}]*display:grid/);
  assert.match(styles, /@media\(max-width:560px\)[^{]*\{[^}]*grid-template-columns:1fr/s);
});

test('photo templates show an accessible avatar placeholder when no photo is uploaded', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(source, /const hasPhoto=!!tmpl\.photo/);
  assert.match(source, /photo-placeholder" role="img" aria-label="No profile photo uploaded"/);
  assert.match(styles, /\.photo-placeholder::before/);
  assert.match(styles, /\.photo-placeholder::after/);
});

test('billing exposes voucher entry and labels sample codes as non-redeemable examples', () => {
  const html = readFileSync(new URL('../frontend/billing.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../frontend/src/billing.js', import.meta.url), 'utf8');
  assert.match(html, /id="voucherForm"/);
  assert.match(html, /id="voucherSection"[^>]*aria-labelledby="voucherTitle">/);
  assert.match(html, /Example formats only — these are not valid codes/);
  assert.match(source, /redeemBillingVoucher\(currentUser, code\)/);
  assert.match(source, /const disabled = signInRequired \|\| proActive/);
  assert.doesNotMatch(readFileSync(new URL('../frontend/pricing.html', import.meta.url), 'utf8'), /id="voucherForm"/);
});

test('Firestore rules restrict the lifetime Pro-template trial to two owner-only increments', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/users\/\{userId\}\/trial\/proTemplateDownloads/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.resource\.data\.count == 1/);
  assert.match(rules, /request\.resource\.data\.count == resource\.data\.count \+ 1/);
  assert.match(rules, /request\.resource\.data\.count <= 2/);
  assert.match(rules, /allow delete: if false/);
});
