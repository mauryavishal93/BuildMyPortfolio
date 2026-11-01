import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');

test('cloud resumes modal keeps controls visible and confines scrolling to the resume list', () => {
  assert.match(styles, /\.cloud-modal\{[^}]*width:min\(620px,calc\(100vw - 32px\)\)[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow:hidden/);
  assert.match(styles, /\.cloud-resume-list\{[^}]*min-height:0[^}]*overflow-x:hidden[^}]*overflow-y:auto/);
  assert.match(styles, /\.cloud-modal>\.modal-actions\{[^}]*flex:none[^}]*flex-wrap:wrap/);
  assert.match(styles, /@media\(max-width:480px\)\{\.cloud-modal\{padding:14px\}/);
  assert.match(styles, /\.cloud-modal>\.modal-actions \.btn\{width:100%\}/);
});
