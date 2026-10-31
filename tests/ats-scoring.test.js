import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { estimateExperienceYears, GENERIC_ATS_WEIGHTING, weightedScore } from '../frontend/src/ats-scoring.js';
import { buildCoverLetterDraft } from '../frontend/src/cover-letter.js';
import { buildCoverLetterPdf } from '../frontend/src/cover-letter-pdf.js';
import { zoomFromPinch } from '../frontend/src/zoom.js';

class UncompressedJsPDF extends jsPDF {
  constructor(options) {
    super({ ...options, compress: false });
  }
}

test('generic readiness factor weights total 100 percent', () => {
  assert.equal(Object.values(GENERIC_ATS_WEIGHTING).reduce((sum, weight) => sum + weight, 0), 100);
});

test('weighted scores normalize using the supplied factor weights', () => {
  assert.equal(weightedScore([{ score: 80, weight: 2 }, { score: 40, weight: 1 }]), 67);
});

test('weighted scores ignore invalid factors and respect the configured ceiling', () => {
  assert.equal(weightedScore([{ score: 100, weight: 1 }, { score: 0, weight: 0 }, { score: NaN, weight: 2 }], 95), 95);
  assert.equal(weightedScore([{ score: 90, weight: 0 }]), 0);
});

test('experience duration merges overlapping jobs instead of double-counting', () => {
  const result = estimateExperienceYears([
    { date: '2019 - 2023' },
    { date: '2022 - 2025' }
  ], 2026);
  assert.deepEqual(result, { years: 6, hasCurrent: false });
});

test('present roles use the current reference year', () => {
  assert.deepEqual(estimateExperienceYears([{ date: '2022 - Present' }], 2026), { years: 4, hasCurrent: true });
});

test('single-year dates count as one year and disjoint periods are added', () => {
  assert.deepEqual(estimateExperienceYears([{ date: '2018 - 2020' }, { date: '2022' }], 2026), { years: 3, hasCurrent: false });
});

test('cover letter draft uses resume evidence and only JD-matched listed skills', () => {
  const draft = buildCoverLetterDraft({
    name: 'Ada Example',
    headline: 'QA Engineer',
    email: 'ada@example.com',
    jobTitle: 'QA Engineer',
    company: 'Acme',
    jobDescription: 'We need Playwright and Python.',
    summary: 'Quality engineer focused on reliable releases.',
    skills: ['Playwright', 'Python', 'Figma'],
    experience: [{ role: 'QA Engineer', company: 'Example Co', details: 'Built test automation. Improved release confidence.' }],
    date: 'Oct 16, 2026'
  });

  assert.match(draft, /Ada Example/);
  assert.match(draft, /QA Engineer at Acme/);
  assert.match(draft, /Playwright, Python/);
  assert.doesNotMatch(draft, /Figma/);
  assert.match(draft, /Built test automation/);
});

test('cover letter draft does not invent experience when resume details are absent', () => {
  const draft = buildCoverLetterDraft({ jobTitle: 'Designer', company: 'Acme', date: '' });
  assert.match(draft, /Designer at Acme/);
  assert.doesNotMatch(draft, /proven track record|successfully led/i);
});

test('cover letter PDF is A4 and paginates long content', () => {
  const pdf = buildCoverLetterPdf(UncompressedJsPDF, 'Ada Example\nada@example.com\n\nDear Hiring Team,\n\nA concise letter.');
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < 0.01);
  const pdfSource = pdf.output();
  assert.equal(Buffer.from(pdfSource).subarray(0, 5).toString(), '%PDF-');
  assert.match(pdfSource, /\(Ada Example\) Tj/);
  assert.doesNotMatch(pdfSource, /\/Subtype\s*\/Image/);

  const longPdf = buildCoverLetterPdf(UncompressedJsPDF, `Ada Example\nada@example.com\n\n${'A long line '.repeat(1000)}`);
  assert.ok(longPdf.getNumberOfPages() > 1);
});

test('pinch zoom scales with finger distance and stays within editor limits', () => {
  assert.equal(zoomFromPinch(1, 100, 125), 1.25);
  assert.equal(zoomFromPinch(1, 100, 25), 0.45);
  assert.equal(zoomFromPinch(1, 100, 250), 1.5);
  assert.equal(zoomFromPinch(1, 0, 250), 1);
});
