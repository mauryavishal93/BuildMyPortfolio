function boundedSize(value, minimum, maximum, fallback) {
  const numeric = value === undefined || value === null || value === ''
    ? fallback
    : Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}

export function normalizeSectionTypography(section, design) {
  return {
    headingSize: boundedSize(section.headingSize, 10, 36, boundedSize(design.headingSize, 10, 36, 15)),
    bodySize: boundedSize(section.bodySize, 8, 24, boundedSize(design.fontSize, 8, 24, 12))
  };
}

export function applySectionTypography(element, section) {
  element.style.setProperty('--section-heading-size', `${section.headingSize}px`);
  element.style.setProperty('--section-body-size', `${section.bodySize}px`);
}
