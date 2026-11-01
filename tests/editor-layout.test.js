import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');

test('editor base layout keeps panels beside the resume and templates in a grid', () => {
  assert.match(styles, /\.layout\{display:grid;grid-template-columns:var\(--lw\) minmax\(360px,1fr\) var\(--rw\)/);
  assert.match(styles, /\.left-scroll,#inspector\{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden\}/);
  assert.match(styles, /\.templates\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:8px;min-width:0\}/);
  assert.match(styles, /\.template-card\{min-width:0\}/);
  assert.match(styles, /\.mini\{height:78px;background:#f8f9fc/);
});

test('sections panel restores its section rows and action button layout', () => {
  assert.match(styles, /\.section-list\{display:flex;flex-direction:column;gap:5px\}/);
  assert.match(styles, /\.section-row\{display:flex;align-items:center;gap:7px/);
  assert.match(styles, /\.section-row \.sect-name\{font-size:11px;font-weight:700;flex:1/);
  assert.match(styles, /\.vis\{border:0;background:transparent/);
  assert.match(styles, /\.add-grid\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(styles, /\.add\{padding:8px 4px;background:#fff;border:1px dashed/);
});

test('editor toolbar controls have compact icons and responsive grid positions', () => {
  assert.match(styles, /\.toolbar\{[^}]*justify-content:center/);
  assert.match(styles, /\.toolbar-btn svg\{width:16px;height:16px;flex:0 0 16px/);
  assert.match(styles, /@container \(max-width:800px\)\{\.toolbar\{display:flex;align-items:center;justify-content:center;gap:6px\}/);
  assert.match(styles, /@container \(max-width:440px\)/);
});

test('editor hint text is centered in the canvas', () => {
  assert.match(styles, /\.hint\{text-align:center;[^}]*margin:0 auto 12px/);
});
