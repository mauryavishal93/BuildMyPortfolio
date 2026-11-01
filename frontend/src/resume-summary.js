export function splitContentIntoBullets(content) {
  return String(content ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=\.)\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .join('\n');
}

export function splitSummaryIntoBullets(content) {
  return splitContentIntoBullets(content);
}
