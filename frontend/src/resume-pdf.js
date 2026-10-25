export const MAX_PDF_BYTES = 500_000;
export const RESUME_PDF_RENDER_SCALE = 2.4;

export function drawPdfText(doc, text, x, y, { font, style, size, color }) {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

const renderScales = [2.4, 2.1, 1.8, 1.5, 1.25];
const jpegQualities = [0.84, 0.78, 0.72, 0.66, 0.6, 0.54];
const candidates = renderScales
  .flatMap(scale => jpegQualities.map(quality => ({ scale, quality })))
  .sort((a, b) => b.scale * b.quality - a.scale * a.quality || b.scale - a.scale);

export async function buildResumePdf(jsPDF, pages, { addSelectableText, addPDFLinks, resizeCanvas }) {
  for (const { scale, quality } of candidates) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < pages.length; index++) {
      const { canvas, sheet } = pages[index];
      if (index > 0) doc.addPage('a4', 'portrait');
      const scaledCanvas = scale === RESUME_PDF_RENDER_SCALE
        ? canvas
        : resizeCanvas(canvas, scale / RESUME_PDF_RENDER_SCALE);
      doc.addImage(scaledCanvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, 210, 297, undefined, 'MEDIUM');
      if (scaledCanvas !== canvas) {
        scaledCanvas.width = 0;
        scaledCanvas.height = 0;
      }
      addSelectableText(doc, sheet);
      addPDFLinks(doc, sheet);
    }
    const blob = doc.output('blob');
    if (blob.size < MAX_PDF_BYTES) return { blob, scale, quality };
  }

  throw new Error('This resume cannot fit under 500 KB at readable PDF quality. Remove pages or large photos and try again.');
}
