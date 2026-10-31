import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const templatesRoot = new URL('../Templates/', import.meta.url);
const expectedTemplateIds = [
  'classic', 'modern', 'minimal', 'creative', 'compact', 'elegant',
  'tech', 'executive', 'photo', 'timeline', 'pastel', 'bold',
  'student', 'portrait', 'card', 'photobanner', 'studio', 'luxe',
  'verve', 'arc', 'interio-designer', 'profile-split', 'peach-mint',
  'teal-modern'
];

test('every resume template has an isolated definition and stylesheet', () => {
  const directories = readdirSync(templatesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(directories, [...expectedTemplateIds].sort());

  for (const id of expectedTemplateIds) {
    const directory = new URL(`${id}/`, templatesRoot);
    const definition = readFileSync(new URL('template.js', directory), 'utf8');
    const styles = readFileSync(new URL('style.css', directory), 'utf8');
    assert.match(definition, /import '\.\/style\.css';/, id);
    assert.match(definition, new RegExp(`id: '${id}'`), id);
    if (styles.trim()) assert.ok(styles.includes(`.layout-${id}`), id);
    else assert.equal(id, 'classic');
  }
});

test('editor uses the Templates registry instead of declaring template metadata inline', () => {
  const registry = readFileSync(new URL('index.js', templatesRoot), 'utf8');
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  for (const id of expectedTemplateIds) {
    assert.match(registry, new RegExp(`from './${id}/template\\.js'`), id);
  }
  assert.match(editor, /import \{ templateDefs \} from '\.\.\/\.\.\/Templates\/index\.js'/);
  assert.doesNotMatch(editor, /const templateDefs\s*=/);
});

test('Interior Designer template binds editable profile details and skills to its sidebar', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(editor, /data-profile-field="name"/);
  assert.match(editor, /class="interio-sidebar-sections"/);
  assert.match(editor, /tmpl\.id==='interio-designer'&&s\.type==='skills'/);
  assert.match(editor, /tmpl\.id==='interio-designer'&&s\.type==='skills'[\s\S]{0,80}pi===0\?'\.interio-sidebar-sections':'\.interio-main \.sections-area'/);
  assert.match(editor, /class="sections-area"/);
});

test('Interior Designer continuation pages keep the sidebar column without repeating its content', () => {
  const styles = readFileSync(new URL('../Templates/interio-designer/style.css', import.meta.url), 'utf8');
  assert.match(styles, /\.layout-interio-designer\[data-page\]:not\(\[data-page="1"\]\) \.interio-sidebar>\*\{visibility:hidden\}/);
  assert.doesNotMatch(styles, /\.layout-interio-designer\[data-page\]:not\(\[data-page="1"\]\).*\.interio-sidebar\{display:none\}/);
  assert.match(styles, /\.layout-interio-designer\[data-page\]:not\(\[data-page="1"\]\) \.interio-main\{grid-column:2;padding-top:38px\}/);
  assert.match(styles, /\.interio-main \.entry-top\{grid-column:1;grid-row:1\/span 2\}/);
  assert.match(styles, /\.interio-main \.entry-sub\{grid-column:2;grid-row:1/);
  assert.match(styles, /\.interio-main \.entry \.pointer-list\{grid-column:2;grid-row:2/);
});

test('Interior Designer contact fields retain readable colors while editing', () => {
  const styles = readFileSync(new URL('../Templates/interio-designer/style.css', import.meta.url), 'utf8');
  assert.match(styles, /\.interio-contact-block \[contenteditable="true"\]:focus\{background:#426f59;color:#fff;caret-color:#fff;box-shadow:0 0 0 2px #a9d8c6/);
});

test('free-position editor supports section movement, resizing, and exact dimensions', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(editor, /data-free-position="x"/);
  assert.match(editor, /data-free-position="y"/);
  assert.match(editor, /data-free-position="w"/);
  assert.match(editor, /data-free-position="h"/);
  assert.match(editor, /class="free-section-move"/);
  assert.match(editor, /class="free-section-resize"/);
  assert.match(editor, /if\(key==='h'\)next\.h=clamp/);
  assert.match(editor, /const resizeHandle=e\.target\.closest\('\.free-section-resize'\)/);
  assert.match(styles, /\.sheet\[data-mode=free\] \.sections-area\{position:absolute;inset:0[^}]*pointer-events:none/);
  assert.match(styles, /\.sheet\[data-mode=free\] \.free-section-resize\{[^}]*cursor:nwse-resize/);
});

test('free-position pages are created from placement and content overflow', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  assert.match(editor, /freePageCount=Math\.max\(state\.freePageCount\|\|1,sheets\.length\)/);
  assert.match(editor, /function captureStructuredPages\(\)/);
  assert.match(editor, /page:pageIndex\+1/);
  assert.match(editor, /const pageCount=Math\.max\(1,\.\.\.state\.sections\.filter\(s=>s\.visible\)\.map\(s=>state\.positions\[s\.id\]\?\.page\|\|1\)\)/);
  assert.match(editor, /if\(fragment\.pageIndex>=pages\.length\)addPage\(\)/);
  assert.match(editor, /state\.freePageCount=pages\.length/);
  assert.match(editor, /data-free-position="page"/);
  assert.doesNotMatch(html, /id="(?:add|remove)FreePageBtn"/);
  assert.doesNotMatch(editor, /addFreePageBtn|removeFreePageBtn/);
});

test('free-position sections continue onto the next page instead of clipping', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(editor, /const body=shell\.querySelector\('\.section-body'\)/);
  assert.match(editor, /const createFragment=\(section,pageIndex,position,continued\)/);
  assert.match(editor, /const bottom=pageBounds\.bottom-\(state\.design\.pageNumbers\?32:16\)\*pageScale/);
  assert.match(editor, /Math\.max\(rendered\.getBoundingClientRect\(\)\.bottom,fragment\.shell\.getBoundingClientRect\(\)\.bottom\)/);
  assert.match(editor, /fragment\.pageIndex\+\+/);
  assert.match(editor, /createFragment\(s,fragment\.pageIndex,\{\.\.\.pos,y:DEFAULT_MARGIN,h:0\},true\)/);
  assert.match(editor, /firstFragmentHeight=Math\.max\(firstFragmentHeight,firstFragment\.shell\.offsetHeight\)/);
});

test('sections support persistent per-section text colors', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../frontend/src/style.css', import.meta.url), 'utf8');
  assert.match(editor, /textColor:\/\^#\[0-9a-f\]\{6\}\$\/i\.test\(str\(s\.textColor\)\)/);
  assert.match(editor, /data-section-text-color type="color"/);
  assert.match(editor, /setProperty\('--section-text-color',s\.textColor\)/);
  assert.match(editor, /resetSectionTextColor/);
  assert.match(styles, /\.resume-section\[style\*="--section-text-color"\] \.section-heading/);
  assert.match(styles, /color:var\(--section-text-color\)!important/);
});

test('resume header alignment stays in the design panel', () => {
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../frontend/editor.html', import.meta.url), 'utf8');
  const toolbar = html.slice(html.indexOf('<div class="toolbar"'), html.indexOf('<div class="hint"'));
  assert.doesNotMatch(toolbar, /headerAlign/);
  assert.match(editor, /Name & header alignment/);
  assert.match(editor, /data-halign="\$\{v\}"/);
  assert.match(editor, /querySelectorAll\('\[data-halign\]'\)/);
});

test('Profile Split is registered as a two-column template with its own theme', () => {
  const registry = readFileSync(new URL('../Templates/index.js', import.meta.url), 'utf8');
  const definition = readFileSync(new URL('../Templates/profile-split/template.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../Templates/profile-split/style.css', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(registry, /from '\.\/profile-split\/template\.js'/);
  assert.match(definition, /name: 'Coastal Split'/);
  assert.match(definition, /layout: 'two'/);
  assert.match(styles, /\.layout-profile-split \.section-columns/);
  assert.match(styles, /\.layout-profile-split \.resume-header/);
  assert.match(styles, /\.layout-profile-split\[data-mode=free\] \.sections-area\{background:transparent\}/);
  assert.match(editor, /const header=tmpl\.id==='profile-split'\?firstPage\.querySelector\('\.resume-header'\):tmpl\.id==='teal-modern'\?firstPage\.querySelector\('\.tr-header'\):null/);
  assert.match(editor, /const headerBottom=header\?Math\.ceil\(/);
  assert.match(editor, /if\(pageIndex===0&&pos\.y<headerBottom\)pos\.y=headerBottom/);
});

test('Peach & Mint template has an isolated two-column theme and editor layout', () => {
  const registry = readFileSync(new URL('../Templates/index.js', import.meta.url), 'utf8');
  const definition = readFileSync(new URL('../Templates/peach-mint/template.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../Templates/peach-mint/style.css', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(registry, /from '\.\/peach-mint\/template\.js'/);
  assert.match(definition, /name: 'Peach & Mint'/);
  assert.match(definition, /layout: 'two'/);
  assert.match(styles, /\.layout-peach-mint \.pm-sidebar/);
  assert.match(styles, /\.layout-peach-mint \.pm-main/);
  assert.match(editor, /if\(tmpl\.id==='peach-mint'\)/);
  assert.match(editor, /class="pm-profile"/);
  assert.match(editor, /class="pm-sidebar-sections"/);
  assert.match(editor, /class="pm-main"><div class="sections-area"/);
  assert.match(editor, /tmpl\.id==='peach-mint'[\s\S]{0,80}s\.type==='skills'\|\|s\.type==='certifications'/);
  assert.match(editor, /if\(peachSidebar&&pos\.x<defaultX\)\{[\s\S]{0,100}pos\.y=cursorByPage\[pageIndex\]/);
});

test('Modern Teal template uses editable profile fields and places skills in its sidebar', () => {
  const registry = readFileSync(new URL('../Templates/index.js', import.meta.url), 'utf8');
  const definition = readFileSync(new URL('../Templates/teal-modern/template.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../Templates/teal-modern/style.css', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(registry, /from '\.\/teal-modern\/template\.js'/);
  assert.match(definition, /name: 'Modern Teal'/);
  assert.match(definition, /layout: 'two'/);
  assert.match(styles, /\.layout-teal-modern \.tr-header/);
  assert.match(styles, /\.layout-teal-modern \.tr-layout/);
  assert.match(styles, /\.layout-teal-modern \.tr-sidebar\{display:flex;[^}]*flex-direction:column/);
  assert.match(styles, /\.layout-teal-modern \.tr-sidebar-sections\{flex:1;min-height:0;overflow:hidden\}/);
  assert.match(styles, /\.tr-photo-frame \.photo\{[^}]*max-width:none[^}]*object-fit:cover[^}]*object-position:center[^}]*border-radius:50%/);
  assert.match(editor, /class="tr-name" contenteditable="true"[^>]+data-profile-field="name"/);
  assert.match(editor, /class="tr-sidebar-sections"/);
  assert.match(editor, /s\.type==='skills'\?'\.tr-sidebar-sections':'\.tr-main \.sections-area'/);
  assert.match(editor, /const header=tmpl\.id==='profile-split'\?[^;]+\.tr-header/);
});
