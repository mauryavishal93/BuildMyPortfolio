import { RESUME_PDF_METADATA_NAMESPACE } from './resume-import-metadata.js';

export function drawPdfText(doc, text, x, y, { font, style, size, color }) {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

export function buildResumePdf(jsPDF, pages, { addSelectableText, addPDFLinks, addPdfDecorations, resumeState }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  if (resumeState) {
    doc.addMetadata(JSON.stringify({
      format: 'PersonaCraftProResume',
      version: 1,
      resume: resumeState
    }), RESUME_PDF_METADATA_NAMESPACE);
  }

  pages.forEach(({ sheet }, index) => {
    if (index > 0) doc.addPage('a4', 'portrait');
    addPdfDecorations(doc, sheet);
    addSelectableText(doc, sheet);
    addPDFLinks(doc, sheet);
  });

  return { blob: doc.output('blob') };
}
