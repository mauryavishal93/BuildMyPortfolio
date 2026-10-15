import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateExperienceYears, GENERIC_ATS_WEIGHTING, weightedScore } from '../frontend/src/ats-scoring.js';

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
