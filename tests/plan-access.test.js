import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canUseFeature,
  FEATURE_IDS,
  PRICING_FEATURES,
  TEMPLATE_IDS
} from '../frontend/src/plan-access.js';

test('all twenty-five templates are available on the free plan', () => {
  assert.equal(TEMPLATE_IDS.FREE.length, 25);
  assert.equal(TEMPLATE_IDS.PRO.length, 0);
  assert.equal(new Set(TEMPLATE_IDS.FREE).size, 25);
});

test('all editor features, templates, ATS checks, and exports are included', () => {
  for (const label of [
    'Resume editor',
    'All 25 resume templates',
    'Unlimited text-based PDF downloads',
    'Unlimited resume-only and job-description ATS checks',
    'Cover-letter tools',
    'JSON import and export',
    'Browser autosave',
    'Optional cloud storage'
  ]) {
    assert.equal(PRICING_FEATURES.find(feature => feature.label === label)?.free, 'Included');
  }
});

test('known formerly gated features are always accessible without an entitlement', () => {
  assert.equal(canUseFeature(FEATURE_IDS.ALL_TEMPLATES), true);
  assert.equal(canUseFeature(FEATURE_IDS.JOB_DESCRIPTION_ATS), true);
  assert.equal(canUseFeature('unknown-feature'), false);
});

test('job descriptions are analyzed only after an explicit Run checks action', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /function openAts\(\)\s*\{[^}]*\}/);
  assert.doesNotMatch(source.match(/function openAts\(\)\s*\{[^}]*\}/)?.[0] || '', /runAtsChecks/);
  assert.match(source, /\$\('runAtsBtn'\)\.addEventListener\('click',\(\)=>runAtsChecks\(\)\)/);
  assert.doesNotMatch(source, /\$\('jobDescription'\)\.addEventListener\('input'/);
  assert.doesNotMatch(source, /atsModalBg'\)\.classList\.contains\('show'\)\)runAtsChecks/);
  assert.match(source, /renderAtsResults\(computeAtsChecks\(jobText\)\)/);
  assert.doesNotMatch(source, /showUpgrade|shouldPromptForJobDescriptionAtsUpgrade/);
});

test('hidden sign-out controls stay hidden in both account-menu styles', () => {
  for (const stylesheet of ['style.css', 'about.css']) {
    const styles = readFileSync(new URL(`../frontend/src/${stylesheet}`, import.meta.url), 'utf8');
    assert.match(styles, /\.account-menu-item\[hidden\]\{display:none!important\}/);
  }
});

test('legacy subscription cancellation is account-gated and no new paid plan controls remain', () => {
  const html = readFileSync(new URL('../frontend/billing.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../frontend/src/billing.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/pricing.css', import.meta.url), 'utf8');
  assert.match(source, /cancelButton\.hidden\s*=\s*!user\s*\|\|/);
  assert.doesNotMatch(html, /switchBillingYearly|voucherSection|redeemVoucher/);
  assert.doesNotMatch(source, /scheduleBillingPlanChange|redeemBillingVoucher|voucherForm/);
  assert.match(styles, /\.billing-plan-actions \.btn\[hidden\]\{display:none!important\}/);
});

test('all site pages use a text-only two-tone wordmark and the matching favicon', () => {
  const pages = [
    'home.html', 'index.html', 'about.html', 'admin.html', 'billing.html',
    'editor.html', 'pricing.html', 'privacy.html', 'refunds.html', 'terms.html'
  ];
  for (const page of pages) {
    const html = readFileSync(new URL(`../frontend/${page}`, import.meta.url), 'utf8');
    assert.match(html, /rel="icon"[^>]+personacraftpro-mark\.svg/, page);
    assert.match(html, /<img class="(?:about-logo|logo)" src="\/images\/personacraftpro-mark\.svg"/, page);
    assert.match(html, /PersonaCraft<span[^>]*>Pro<\/span>/, page);
  }
  const editor = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  assert.doesNotMatch(editor, /id="proBrandBadge"/);
  const styles = [
    readFileSync(new URL('../frontend/src/about.css', import.meta.url), 'utf8'),
    readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8')
  ].join('\n');
  assert.match(styles, /\.about-brand-name\{display:inline-flex;align-items:center;gap:4px/);
  assert.match(styles, /\.brand-name\{display:inline-flex;align-items:center;gap:4px/);
  assert.match(styles, /\.about-brand-name span\{display:inline-flex;align-items:center;padding:2px 6px;border-radius:6px;background:linear-gradient/);
  assert.match(styles, /\.brand-name span\{display:inline-flex;align-items:center;padding:2px 6px;border-radius:6px;background:linear-gradient/);
  assert.doesNotMatch(styles, /\.about-brand span:not\(\.about-logo\)\{display:none\}/);
  assert.doesNotMatch(styles, /\.brand span\{display:none\}/);
  const logo = readFileSync(new URL('../frontend/public/images/personacraftpro-mark.svg', import.meta.url), 'utf8');
  assert.match(logo, /<svg/);
  assert.match(logo, /rx="78"/);
  assert.match(logo, /linearGradient/);
  assert.match(logo, /FFE56A/);
});

test('pricing page presents a single free plan without checkout or voucher flows', () => {
  const html = readFileSync(new URL('../frontend/pricing.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../frontend/src/pricing.js', import.meta.url), 'utf8');
  assert.match(html, /All features are free/);
  assert.match(html, /Unlimited text-based PDF downloads/);
  assert.match(html, /Unlimited resume-only and job-description ATS checks/);
  assert.doesNotMatch(html, /Pro Monthly|Pro Yearly|purchaseMonthly|purchaseYearly|Voucher|checkoutStatus/);
  assert.doesNotMatch(script, /createBillingSubscription|redeemBillingVoucher|Razorpay|PLAN_CONFIG/);
});

test('editor removes Pro modals and has no template or PDF usage quota', () => {
  const html = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /upgradeModalBg|templatePreviewModalBg|Pro template/);
  assert.match(html, /See all included features/);
  assert.match(source, /async function exportPDF\(\)/);
  assert.match(source, /const template=templateDefs\.find\(item=>item\.id===b\.dataset\.template\)/);
  assert.doesNotMatch(source, /consumeProTemplateDownload|proTemplateDownloadsRemaining|shouldPromptForJobDescriptionAtsUpgrade|showUpgrade/);
});

test('photo templates show an accessible avatar placeholder when no photo is uploaded', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(source, /const hasPhoto=!!tmpl\.photo/);
  assert.match(source, /photo-placeholder" role="img" aria-label="No profile photo uploaded"/);
  assert.match(styles, /\.photo-placeholder::before/);
  assert.match(styles, /\.photo-placeholder::after/);
});

test('flow pagination continues entry bullets without repeating the role header', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /if\(!a\.continuation\)el\.innerHTML=/);
  assert.match(source, /const first=cont&&a\.k==='li'\?\{k:'entry',e:a\.e,continuation:true\}:a;/);
  assert.match(source, /if\(cont&&a\.k==='li'\)appendAtom\(placed\.shell,a,placed\.st,s\);/);
  assert.match(source, /addEventListener\('focusout',e=>\{[\s\S]*?recordHistory\(before\);saveLocal\(\);renderSheets\(\);/);
});

test('experience bullets split at the caret and keep focus for consecutive Enter presses', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /const caret=Math\.min\(caretOffsetWithin\(el,true\),before\.length\),left=before\.slice\(0,caret\),right=before\.slice\(caret\+selectionLength\)/);
  assert.match(source, /details\.splice\(index,representedCount,left,right\)/);
  assert.match(source, /if\(!directEditSnapshots\.has\(el\)\)directEditSnapshots\.set\(el,deep\(state\)\)/);
  assert.match(source, /if\(editSnapshot\)directEditSnapshots\.set\(next,editSnapshot\)/);
  assert.match(source, /selection\?\.removeAllRanges\(\);selection\?\.addRange\(range\)/);
});

test('experience bullet Backspace and Delete merge adjacent points at line boundaries', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /const caret=caretOffsetWithin\(el,true\),backward=e\.key==='Backspace',atBoundary=backward\?caret===0:caret===value\.length/);
  assert.match(source, /const rows=Array\.from\(document\.querySelectorAll\('#sheets \[data-entry-field="detail"\]'\)\)\.filter\(item=>item\.dataset\.sectionId===sectionId&&item\.dataset\.entry===entryIndex\)/);
  assert.match(source, /details\.splice\(priorIndex,count,joined\)/);
  assert.match(source, /itemIndex-count\+joinedCount/);
  assert.match(source, /if\(backward\)\{[\s\S]*?prior\.focus\(\)/);
});

test('experience deletion never selects an entire neighboring line or document', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /const insideField=el\.contains\(selection\.anchorNode\)&&el\.contains\(selection\.focusNode\);[\s\S]*?if\(!insideField\)e\.preventDefault\(\);[\s\S]*?return;/);
  assert.match(source, /range\.collapse\(true\);selection\?\.removeAllRanges\(\);selection\?\.addRange\(range\)/);
  assert.doesNotMatch(source, /document\.execCommand\('selectAll'/);
});

test('experience content reflows to the next page while the user is typing', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /function reflowOverflowingDetail\(el,force=false\)/);
  assert.match(source, /if\(!force&&el\.getBoundingClientRect\(\)\.bottom<=limit\+\.5\)return/);
  assert.match(source, /try\{renderSheets\(\)\}finally\{reflowingDetail=false\}/);
  assert.match(source, /const moved=Array\.from\(document\.querySelectorAll\('#sheets \[data-entry-field="detail"\]'\)\)/);
  assert.match(source, /reflowOverflowingDetail\(el,replacements\.length>1\)/);
});

test('billing preserves cancellation/history but removes voucher and purchase controls', () => {
  const html = readFileSync(new URL('../frontend/billing.html', import.meta.url), 'utf8');
  const pricingHtml = readFileSync(new URL('../frontend/pricing.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../frontend/src/billing.js', import.meta.url), 'utf8');
  const pricingSource = readFileSync(new URL('../frontend/src/pricing.js', import.meta.url), 'utf8');
  assert.match(html, /id="cancelBilling"/);
  assert.match(html, /id="billingHistory"/);
  assert.doesNotMatch(html, /voucher|purchaseMonthly|purchaseYearly/i);
  assert.doesNotMatch(source, /redeemBillingVoucher|scheduleBillingPlanChange/);
  assert.match(pricingHtml, /All features are free/);
  assert.doesNotMatch(pricingHtml, /voucher|purchaseMonthly|purchaseYearly|Pro Monthly|Pro Yearly/i);
  assert.doesNotMatch(pricingSource, /redeemBillingVoucher|createBillingSubscription|Razorpay/);
});

test('Firestore and cloud client no longer maintain a Pro-template download quota', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const cloudClient = readFileSync(new URL('../frontend/src/firebase-cloud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /trial\/proTemplateDownloads/);
  assert.doesNotMatch(cloudClient, /getProTemplateDownloadStatus|consumeProTemplateDownload/);
});

test('Firestore rules scope the last-worked resume preference to its signed-in account', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/users\/\{userId\}\/preferences\/resumeEditor/);
  assert.match(rules, /allow get: if request\.auth != null && request\.auth\.uid == userId/);
  assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly\(\['lastWorkedResumeId'\]\)/);
  assert.match(rules, /request\.resource\.data\.lastWorkedResumeId is string/);
});
