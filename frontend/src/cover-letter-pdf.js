export function buildCoverLetterPdf(jsPDF, letter) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  const sourceLines = String(letter || '').replace(/\r/g, '').split('\n');
  const separator = sourceLines.findIndex(line => !line.trim());
  const headerLines = (separator < 0 ? sourceLines.slice(0, 1) : sourceLines.slice(0, separator)).filter(Boolean);
  const bodyLines = separator < 0 ? sourceLines.slice(1) : sourceLines.slice(separator + 1);
  let y = margin;

  const addPageIfNeeded = height => {
    if (y + height > bottom) {
      doc.addPage('a4', 'portrait');
      y = margin;
    }
  };
  const writeWrapped = (text, { font = 'times', style = 'normal', size = 11, color = [35, 42, 54], lineHeight = 5.5, gap = 0 } = {}) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      addPageIfNeeded(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };

  if (headerLines.length) {
    writeWrapped(headerLines[0], { style: 'bold', size: 16, color: [31, 49, 72], lineHeight: 7, gap: 2 });
    if (headerLines.length > 1) {
      writeWrapped(headerLines.slice(1).join(' · '), { size: 9, color: [92, 102, 119], lineHeight: 4.5, gap: 8 });
    }
  }

  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) {
      y += 3;
      return;
    }
    const text = paragraph.join(' ').trim();
    const salutation = /^Dear\b/i.test(text);
    writeWrapped(text, { style: salutation ? 'bold' : 'normal', size: 11, color: [35, 42, 54], lineHeight: 5.7, gap: 3 });
    paragraph = [];
  };

  for (const line of bodyLines) {
    if (line.trim()) paragraph.push(line.trim());
    else flushParagraph();
  }
  if (paragraph.length) {
    const text = paragraph.join(' ').trim();
    const salutation = /^Dear\b/i.test(text);
    writeWrapped(text, { style: salutation ? 'bold' : 'normal', size: 11, color: [35, 42, 54], lineHeight: 5.7 });
  }

  return doc;
}
