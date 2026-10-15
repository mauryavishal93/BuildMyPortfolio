export const GENERIC_ATS_WEIGHTING = Object.freeze({
  formatting: 20,
  titleClarity: 10,
  sections: 15,
  experience: 15,
  skills: 15,
  education: 10,
  certifications: 5,
  impact: 5,
  contact: 5
});

export function weightedScore(criteria, ceiling = 100) {
  const usable = criteria.filter(item => Number.isFinite(item.score) && Number.isFinite(item.weight) && item.weight > 0);
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;

  const average = usable.reduce((sum, item) => {
    const score = Math.max(0, Math.min(100, item.score));
    return sum + score * item.weight;
  }, 0) / totalWeight;
  const maximum = Number.isFinite(ceiling) ? Math.max(0, Math.min(100, ceiling)) : 100;
  return Math.min(maximum, Math.max(0, Math.round(average)));
}

export function estimateExperienceYears(entries, referenceYear = new Date().getFullYear()) {
  const intervals = [];
  let hasCurrent = false;

  for (const entry of entries || []) {
    const date = String(entry?.date || '');
    const years = [...date.matchAll(/(?:19|20)\d{2}/g)].map(match => Number(match[0]));
    if (!years.length) continue;

    const current = /present|current|now/i.test(date);
    hasCurrent ||= current;
    const start = years.length > 1 ? Math.min(years[0], years[1]) : years[0];
    const end = current ? Math.max(start, referenceYear) : years.length > 1 ? Math.max(years[0], years[1]) : start + 1;
    intervals.push({ start, end });
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }

  const years = merged.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  return { years, hasCurrent };
}
