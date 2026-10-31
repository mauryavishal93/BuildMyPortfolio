import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { buildResumePdf, drawPdfText } from '../frontend/src/resume-pdf.js';

class UncompressedJsPDF extends jsPDF {
  constructor(options) {
    super({ ...options, compress: false });
  }
}

test('builds selectable text across resume pages without flattening pages into images', async () => {
  const result = buildResumePdf(UncompressedJsPDF, [
    { sheet: { text: 'Vector resume page one' } },
    { sheet: { text: 'Vector resume page two' } }
  ], {
    addPdfDecorations: () => {},
    addSelectableText: (doc, sheet) => drawPdfText(doc, sheet.text, 24, 36, {
      font: 'helvetica',
      style: 'normal',
      size: 12,
      color: [24, 42, 58]
    }),
    addPDFLinks: () => {}
  });
  const pdf = Buffer.from(await result.blob.arrayBuffer()).toString('latin1');

  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /\(Vector resume page one\) Tj/);
  assert.match(pdf, /\(Vector resume page two\) Tj/);
  assert.doesNotMatch(pdf, /\/Subtype\s*\/Image/);
});

test('exports large text resumes without a raster-based file size limit', async () => {
  const result = buildResumePdf(UncompressedJsPDF, [{ sheet: { text: 'R'.repeat(520_000) } }], {
    addPdfDecorations: () => {},
    addSelectableText: (doc, sheet) => drawPdfText(doc, sheet.text, 24, 36, {
      font: 'helvetica',
      style: 'normal',
      size: 12,
      color: [24, 42, 58]
    }),
    addPDFLinks: () => {}
  });

  assert.ok(result.blob.size > 500_000);
});

test('draws resume text with visible vector PDF text operators', () => {
  const doc = new UncompressedJsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawPdfText(doc, 'Sharp Vector Resume Text', 24, 36, {
    font: 'helvetica',
    style: 'bold',
    size: 12,
    color: [24, 42, 58]
  });

  const pdf = doc.output();
  assert.match(pdf, /\(Sharp Vector Resume Text\) Tj/);
  assert.doesNotMatch(pdf, /3 Tr/);
  assert.doesNotMatch(pdf, /\/Subtype\s*\/Image/);
});
