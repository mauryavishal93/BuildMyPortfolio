export const TEMPLATE_IDS = Object.freeze({
  FREE: Object.freeze([
    'classic', 'modern', 'minimal', 'creative', 'compact', 'elegant',
    'tech', 'executive', 'photo', 'timeline', 'pastel', 'bold',
    'student', 'portrait', 'card', 'photobanner', 'studio', 'luxe',
    'verve', 'arc', 'interio-designer', 'profile-split', 'peach-mint',
    'teal-modern', 'brian-baxter'
  ]),
  PRO: Object.freeze([])
});

export const FEATURE_IDS = Object.freeze({
  ALL_TEMPLATES: 'all-templates',
  JOB_DESCRIPTION_ATS: 'job-description-ats'
});

export const PRICING_FEATURES = Object.freeze([
  'Resume editor',
  'All 25 resume templates',
  'Unlimited text-based PDF downloads',
  'Unlimited resume-only and job-description ATS checks',
  'Cover-letter tools',
  'JSON import and export',
  'Browser autosave',
  'Optional cloud storage'
].map(label => Object.freeze({ label, free: 'Included' })));

export function canUseFeature(featureId) {
  return featureId === FEATURE_IDS.ALL_TEMPLATES || featureId === FEATURE_IDS.JOB_DESCRIPTION_ATS;
}
