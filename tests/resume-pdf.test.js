import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { buildResumePdf, drawPdfText, MAX_PDF_BYTES, RESUME_PDF_RENDER_SCALE } from '../frontend/src/resume-pdf.js';

function mockPdfLibrary() {
  return class MockPdf {
    constructor() {
      this.imageBytes = 0;
    }

    addPage() {}

    addImage(imageData) {
      this.imageBytes += imageData.length;
    }

    output() {
      return new Blob([new Uint8Array(this.imageBytes + 1200)]);
    }
  };
}

function mockCanvas(encodedBytes) {
  return {
    width: 2400,
    height: 3400,
    encodedBytes,
    toDataURL(_format, quality) {
      const byteLength = Math.round(encodedBytes * quality / 0.84);
      return `data:image/jpeg;base64,${'x'.repeat(byteLength)}`;
    }
  };
}

function mockResizeCanvas(canvas, scale) {
  return {
    width: Math.round(canvas.width * scale),
    height: Math.round(canvas.height * scale),
    toDataURL(_format, quality) {
      const byteLength = Math.round(canvas.encodedBytes * scale ** 2 * quality / 0.84);
      return `data:image/jpeg;base64,${'x'.repeat(byteLength)}`;
    }
  };
}

test('chooses the highest balanced render resolution and quality that fit below 500 KB', async () => {
  const pages = Array.from({ length: 3 }, () => ({
    canvas: mockCanvas(190_000),
    sheet: {}
  }));
  let selectableTextPages = 0;
  const result = await buildResumePdf(mockPdfLibrary(), pages, {
    addSelectableText: () => { selectableTextPages++; },
    addPDFLinks: () => {},
    resizeCanvas: mockResizeCanvas
  });

  assert.ok(result.blob.size < MAX_PDF_BYTES);
  assert.equal(result.scale, 2.1);
  assert.equal(result.quality, 0.84);
  assert.ok(selectableTextPages >= pages.length);
});

test('reduces image dimensions only when JPEG quality alone cannot meet the file-size limit', async () => {
  const pages = Array.from({ length: 4 }, () => ({
    canvas: mockCanvas(250_000),
    sheet: {}
  }));
  const result = await buildResumePdf(mockPdfLibrary(), pages, {
    addSelectableText: () => {},
    addPDFLinks: () => {},
    resizeCanvas: mockResizeCanvas
  });

  assert.ok(result.blob.size < MAX_PDF_BYTES);
  assert.equal(result.scale, 1.8);
  assert.equal(result.quality, 0.72);
});

test('refuses to provide a PDF when even the lowest supported readable settings exceed the cap', async () => {
  const pages = Array.from({ length: 10 }, () => ({
    canvas: mockCanvas(500_000),
    sheet: {}
  }));
  await assert.rejects(
    buildResumePdf(mockPdfLibrary(), pages, {
      addSelectableText: () => {},
      addPDFLinks: () => {},
      resizeCanvas: mockResizeCanvas
    }),
    /cannot fit under 500 KB/
  );
});

test('draws resume text with visible vector PDF text operators', () => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: false });
  drawPdfText(doc, 'Sharp Vector Resume Text', 24, 36, {
    font: 'helvetica',
    style: 'bold',
    size: 12,
    color: [24, 42, 58]
  });

  const pdf = doc.output();
  assert.match(pdf, /\(Sharp Vector Resume Text\) Tj/);
  assert.doesNotMatch(pdf, /3 Tr/);
});
