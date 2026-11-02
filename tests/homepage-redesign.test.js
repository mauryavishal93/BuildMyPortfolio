import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homepageStyles = readFileSync(new URL('../frontend/src/homepage.css', import.meta.url), 'utf8');

test('homepage redesign sections and existing walkthrough stay consistent on both entry points', () => {
  for (const page of ['home.html', 'index.html']) {
    const html = readFileSync(new URL(`../frontend/${page}`, import.meta.url), 'utf8');

    assert.match(html, /href="\/src\/homepage\.css"/);
    assert.match(html, /src="\/images\/homepage-demo\.svg"/);
    assert.match(html, /<script type="module" src="\/src\/theme\.js"><\/script>/);
    assert.match(html, /<div class="hero-actions landing-hero-actions">\s*<a class="btn primary landing-create-btn" href="\/editor\.html">Create my free resume <span aria-hidden="true">→<\/span><\/a>\s*<a class="btn outline landing-explore-btn" href="#templates">Explore templates<\/a>\s*<\/div>\s*<a class="landing-import-link" href="\/editor\.html\?open=import">Already have a resume\? Import it<\/a>/);
    assert.match(html, /<a class="landing-scratch-cta" href="\/resume-wizard\.html">\s*<span class="landing-scratch-title">Build my resume from scratch <span aria-hidden="true">→<\/span><\/span>\s*<span class="landing-scratch-subtitle">Guided step-by-step resume creation<\/span>\s*<\/a>/);
    assert.match(html, /href="\/editor\.html\?open=import">Import resume<\/a>/);
    for (const section of ['templates', 'how-it-works', 'features', 'pricing', 'faq']) {
      assert.match(html, new RegExp(`id="${section}"`));
      assert.match(html, new RegExp(`href="#${section}">`));
    }
    for (const [id, name] of [['modern', 'Modern'], ['classic', 'Classic'], ['minimal', 'Minimal'], ['tech', 'Tech']]) {
      assert.match(html, new RegExp(`<a class="landing-template-card" href="/editor\\.html\\?template=${id}" aria-label="Use the ${name} resume template">[\\s\\S]*?<span class="landing-template-link">Use template →</span>[\\s\\S]*?<\\/a>`));
      const card = html.match(new RegExp(`<a class="landing-template-card" href="/editor\\.html\\?template=${id}"[\\s\\S]*?<\\/a>`))?.[0];
      assert.ok(card, `${name} template card should exist`);
      assert.match(card, new RegExp(`<div class="landing-resume-paper" data-layout="${id}">`));
      assert.match(card, /class="landing-resume-header"/);
      assert.match(card, /class="landing-resume-section"/);
      assert.match(card, /Jordan Taylor/);
    }
    const modernCard = html.match(/<a class="landing-template-card" href="\/editor\.html\?template=modern"[\s\S]*?<\/a>/)?.[0];
    assert.match(modernCard, /landing-resume-two-column/);
    assert.match(modernCard, /landing-resume-secondary/);
    assert.match(html, /<div class="hero-actions landing-pricing-actions">\s*<a class="btn primary" href="\/editor\.html">Start free<\/a>\s*<\/div>/);
    assert.match(html, /<div class="hero-actions landing-pricing-actions">\s*<a class="btn outline" href="\/pricing\.html">Compare all plans<\/a>\s*<\/div>/);
    assert.match(html, /<div class="landing-faq">[\s\S]*?<details>[\s\S]*?<summary>/);
  }
});

test('editor applies homepage template links to the loaded resume and preserves free-template access', () => {
  const source = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');
  assert.match(source, /requestedHomepageTemplateId=new URLSearchParams\(location\.search\)\.get\('template'\)/);
  assert.match(source, /item=>item\.id===requestedHomepageTemplateId&&TEMPLATE_IDS\.FREE\.includes\(item\.id\)/);
  assert.match(source, /state\.template=template\.id;\s*state\.layout=template\.layout;\s*state\.design\.accent=template\.accent/);
  assert.match(source, /cloudDraftDirty=applyHomepageTemplate\(\)/);
  assert.match(source, /params\.delete\('template'\)/);
  assert.match(source, /window\.history\.replaceState\(null,'',/);
});

test('homepage redesign follows the existing theme and adapts its content to mobile', () => {
  assert.match(homepageStyles, /:root\[data-theme="light"\] \.landing-page/);
  assert.match(homepageStyles, /\.landing-hero \.hero-actions \.landing-create-btn \{[\s\S]*min-height: 46px;[\s\S]*font-size: 15px/);
  assert.match(homepageStyles, /:root\[data-theme="light"\] \.landing-page \.landing-hero \.hero-actions \.landing-create-btn \{[\s\S]*background: #b89456/);
  assert.match(homepageStyles, /\.landing-hero-actions \.landing-explore-btn[\s\S]*background: transparent/);
  assert.match(homepageStyles, /\.landing-scratch-cta \{[\s\S]*min-height: 96px/);
  assert.match(homepageStyles, /:root\[data-theme="light"\] \.landing-page \.landing-scratch-cta \{[\s\S]*#f4f0e7/);
  assert.match(homepageStyles, /@media \(max-width: 640px\)[\s\S]*\.landing-create-btn,[\s\S]*width: min\(100%, 260px\);[\s\S]*min-height: 44px/);
  assert.match(homepageStyles, /@media \(max-width: 640px\)[\s\S]*\.landing-scratch-cta \{[\s\S]*min-height: 82px/);
  assert.match(homepageStyles, /\.landing-template-grid,[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(homepageStyles, /@media \(max-width: 980px\)[\s\S]*\.landing-template-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(homepageStyles, /@media \(max-width: 640px\)[\s\S]*\.landing-pricing-card[\s\S]*grid-template-columns: 1fr/);
  assert.match(homepageStyles, /\.landing-pricing-actions \{\s*gap: 10px;\s*margin-top: 16px;/);
  assert.match(homepageStyles, /\.landing-resume-paper\[data-layout="modern"\] \.landing-resume-header[\s\S]*background: #344b67/);
  assert.match(homepageStyles, /\.landing-resume-paper\[data-layout="minimal"\] \.landing-resume-name[\s\S]*font-family: Georgia, serif/);
  assert.match(homepageStyles, /\.landing-resume-paper\[data-layout="tech"\] \.landing-resume-name[\s\S]*font-family: monospace/);
  assert.match(homepageStyles, /\.landing-resume-two-column[\s\S]*grid-template-columns: minmax\(0, 1\.25fr\) minmax\(0, \.75fr\)/);
});
