export const TEMPLATE_IDS = Object.freeze({
  FREE: Object.freeze(['classic', 'modern', 'minimal', 'compact', 'tech', 'student']),
  PRO: Object.freeze([
    'creative', 'elegant', 'executive', 'photo', 'timeline', 'pastel',
    'bold', 'portrait', 'card', 'photobanner', 'studio'
  ])
});

export const FEATURE_IDS = Object.freeze({
  ALL_TEMPLATES: 'all-templates',
  JOB_DESCRIPTION_ATS: 'job-description-ats'
});

export const PLAN_CONFIG = Object.freeze({
  free: Object.freeze({
    id: 'free',
    price: 0,
    currency: 'INR'
  }),
  pro: Object.freeze({
    id: 'pro',
    currency: 'INR',
    monthly: Object.freeze({ price: 99, interval: 'month' }),
    yearly: Object.freeze({ price: 399, interval: 'year' })
  })
});

export const PRICING_FEATURES = Object.freeze([
  Object.freeze({ label: 'Resume editor', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'Resume templates', free: '6 templates', pro: 'All 17 templates' }),
  Object.freeze({ label: 'Standard PDF export', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'Resume-only ATS checks', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'Job-description ATS comparison', free: 'Not available', pro: 'Included' }),
  Object.freeze({ label: 'Basic cover-letter tools', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'JSON import and export', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'Browser autosave', free: 'Included', pro: 'Included' }),
  Object.freeze({ label: 'Existing optional cloud storage', free: 'Unchanged', pro: 'Unchanged' }),
  Object.freeze({ label: 'Tailored resume versions', free: 'Not available', pro: 'Not available yet' }),
  Object.freeze({ label: 'Enhanced cover-letter tools', free: 'Not available', pro: 'Not available yet' }),
  Object.freeze({ label: 'Premium export options', free: 'Not available', pro: 'Not available yet' })
]);

export function isProTemplate(templateId) {
  return TEMPLATE_IDS.PRO.includes(templateId);
}

export function canUseFeature(featureId, entitlement, now = Date.now()) {
  if (featureId !== FEATURE_IDS.ALL_TEMPLATES && featureId !== FEATURE_IDS.JOB_DESCRIPTION_ATS) {
    return false;
  }

  if (entitlement?.planId !== PLAN_CONFIG.pro.id
    || entitlement.status !== 'active'
    || entitlement.source !== 'server-verified'
    || !Number.isFinite(entitlement.validUntil)) {
    return false;
  }

  return entitlement.validUntil > now;
}
