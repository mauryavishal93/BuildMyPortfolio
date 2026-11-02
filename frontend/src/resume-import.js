import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { readEmbeddedResumeProject } from './resume-import-metadata.js';
import { parseResumeProjectJson } from './resume-import-json.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 25;

function report(progress, message, value = 0) {
  if (typeof progress === 'function') progress({ message, value });
}

function getFileExtension(file) {
  return String(file.name || '').split('.').pop().toLowerCase();
}

function pageText(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = Number(item.transform?.[5] || 0);
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 2);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: Number(item.transform?.[4] || 0), width: Number(item.width || 0), text: item.str.trim() });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let line = '';
    let right = null;
    for (const item of row.items) {
      if (line && item.x - right > 1) line += ' ';
      line += item.text;
      right = item.x + item.width;
    }
    return line;
  }).join('\n');
}

async function createOcrWorker(onProgress) {
  const { createWorker } = await import('tesseract.js');
  return createWorker('eng', 1, {
    logger: event => {
      if (event.status === 'recognizing text') {
        report(onProgress, 'Reading scanned text…', event.progress || 0);
      }
    }
  });
}

async function recognizeImage(image, onProgress) {
  const worker = await createOcrWorker(onProgress);
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(file, onProgress) {
  report(onProgress, 'Opening PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has more than ${MAX_PDF_PAGES} pages.`);
    const pdfMetadata = await pdf.getMetadata();
    const project = readEmbeddedResumeProject(pdfMetadata.metadata);
    const pages = [];
    const emptyPages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      report(onProgress, `Reading PDF page ${pageNumber} of ${pdf.numPages}…`, pageNumber / pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageText(content.items);
      pages.push(text);
      if (!text) emptyPages.push(pageNumber);
    }
    if (!emptyPages.length) return { text: pages.join('\n\n').trim(), project };

    report(onProgress, 'Checking scanned PDF pages with text recognition…');
    const worker = await createOcrWorker(onProgress);
    try {
      for (let pageIndex = 0; pageIndex < emptyPages.length; pageIndex += 1) {
        const pageNumber = emptyPages[pageIndex];
        report(onProgress, `Reading scanned page ${pageNumber} of ${pdf.numPages}…`, (pageIndex + 1) / emptyPages.length);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare the scanned page for text recognition.');
        try {
          await page.render({ canvasContext: context, viewport }).promise;
          const result = await worker.recognize(canvas);
          pages[pageNumber - 1] = result.data.text.trim();
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      return { text: pages.join('\n\n').trim(), project };
    } finally {
      await worker.terminate();
    }
  } finally {
    await pdf.destroy();
  }
}

export async function extractResumeFile(file, onProgress) {
  if (!file || file.size > MAX_FILE_BYTES) throw new Error('This file is larger than 15 MB.');
  const extension = getFileExtension(file);
  if (extension === 'txt') {
    report(onProgress, 'Reading text file…', 1);
    return { text: await file.text(), project: null };
  }
  if (extension === 'json') {
    report(onProgress, 'Reading resume project…', 1);
    const text = await file.text();
    return { text, project: parseResumeProjectJson(text) };
  }
  if (extension === 'docx') {
    report(onProgress, 'Reading Word document…');
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value, project: null };
  }
  if (extension === 'pdf') return extractPdf(file, onProgress);
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension)) {
    report(onProgress, 'Preparing image text recognition…');
    return { text: await recognizeImage(file, onProgress), project: null };
  }
  throw new Error('Unsupported resume file type.');
}

export async function extractResumeText(file, onProgress) {
  return (await extractResumeFile(file, onProgress)).text;
}
