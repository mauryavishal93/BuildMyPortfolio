import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySectionTypography, normalizeSectionTypography } from '../frontend/src/section-typography.js';

test('section typography defaults to global sizes for existing resume sections', () => {
  assert.deepEqual(
    normalizeSectionTypography({}, { headingSize: 18, fontSize: 13 }),
    { headingSize: 18, bodySize: 13 }
  );
});

test('section typography preserves valid overrides and clamps invalid ranges', () => {
  assert.deepEqual(
    normalizeSectionTypography({ headingSize: '32', bodySize: 28 }, { headingSize: 15, fontSize: 12 }),
    { headingSize: 32, bodySize: 24 }
  );
  assert.deepEqual(
    normalizeSectionTypography({ headingSize: 2, bodySize: 'invalid' }, { headingSize: 15, fontSize: 12 }),
    { headingSize: 10, bodySize: 12 }
  );
});

test('section typography is applied to rendered sections and editable in the inspector', () => {
  const properties = new Map();
  applySectionTypography({ style: { setProperty: (name, value) => properties.set(name, value) } }, {
    headingSize: 20,
    bodySize: 14
  });
  assert.deepEqual([...properties], [
    ['--section-heading-size', '20px'],
    ['--section-body-size', '14px']
  ]);

  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(source, /id="sectionHeadingSize" type="number"/);
  assert.match(source, /id="sectionBodySize" type="number"/);
  assert.match(source, /applySectionTypography\(sec,s\)/);
  assert.match(source, /sectionTypographyCallout/);
  assert.match(source, /selectSection\(el\.dataset\.resumeSection,Boolean\(e\.target\.closest\('\[contenteditable="true"\]'\)\),el\)/);
  assert.match(source, /updateSectionTypographyCallout\(\)/);
  assert.match(source, /if\(k==='fontSize'\)state\.sections\.forEach\(section=>section\.bodySize=v\)/);
  assert.match(source, /if\(k==='headingSize'\)state\.sections\.forEach\(section=>section\.headingSize=v\)/);
  assert.match(styles, /#sheets \.resume-section>\.section-heading/);
  assert.match(styles, /#sheets \.resume-section \.section-body,#sheets \.resume-section \.section-body \*/);
  assert.match(styles, /#sectionTypographyCallout\[hidden\]\{display:none\}/);
});
