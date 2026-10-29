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

export const STATIC_VOUCHERS = Object.freeze({
  WELCOME10: Object.freeze({ code: 'WELCOME10', durationDays: 30, label: 'Welcome voucher', planId: 'pro' }),
  PRO30: Object.freeze({ code: 'PRO30', durationDays: 30, label: 'Pro voucher', planId: 'pro' }),
  LIFETIMEVIP: Object.freeze({ code: 'LIFETIMEVIP', durationDays: 3650, label: 'Lifetime voucher', planId: 'pro' })
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
  Object.freeze({ label: 'Voucher-based Pro access', free: 'Available with voucher', pro: 'Included' })
]);

const VOUCHER_STORAGE_KEY = 'personacraftpro-static-voucher';

function getStorageLike(store) {
  if (store && typeof store.getItem === 'function') return store;
  if (store && store instanceof Map) return store;
  return globalThis.localStorage;
}

function asMap(store) {
  if (store instanceof Map) return store;
  if (!store || typeof store.getItem !== 'function') return new Map();
  try {
    const existing = JSON.parse(store.getItem(VOUCHER_STORAGE_KEY) || 'null');
    return existing ? new Map([[VOUCHER_STORAGE_KEY, existing]]) : new Map();
  } catch {
    return new Map();
  }
}

export function readStaticVoucherState(store = globalThis.localStorage) {
  const storage = getStorageLike(store);
  if (storage instanceof Map) {
    const item = storage.get(VOUCHER_STORAGE_KEY);
    if (!item) return null;
    if (typeof item.validUntil === 'number' && item.validUntil <= Date.now()) {
      storage.delete(VOUCHER_STORAGE_KEY);
      return null;
    }
    return item;
  }

  try {
    const raw = storage.getItem(VOUCHER_STORAGE_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || typeof item.validUntil !== 'number') return null;
    if (item.validUntil <= Date.now()) {
      storage.removeItem(VOUCHER_STORAGE_KEY);
      return null;
    }
    return item;
  } catch {
    return null;
  }
}

export function clearStaticVoucher(store = globalThis.localStorage) {
  const storage = getStorageLike(store);
  if (storage instanceof Map) {
    storage.delete(VOUCHER_STORAGE_KEY);
    return true;
  }
  if (storage && typeof storage.removeItem === 'function') {
    storage.removeItem(VOUCHER_STORAGE_KEY);
  }
  return true;
}

export function applyStaticVoucher(code, store = globalThis.localStorage) {
  const normalized = String(code || '').trim().toUpperCase();
  const voucher = STATIC_VOUCHERS[normalized];
  if (!voucher) {
    return {
      success: false,
      message: `Invalid voucher code "${code || ''}". Try WELCOME10, PRO30, or LIFETIMEVIP.`
    };
  }

  const now = Date.now();
  const validUntil = now + (voucher.durationDays * 86_400_000);
  const entitlement = {
    code: voucher.code,
    planId: voucher.planId,
    status: 'active',
    source: 'voucher',
    validUntil,
    appliedAt: now,
    expiresAt: validUntil,
    durationDays: voucher.durationDays,
    label: voucher.label
  };

  const storage = getStorageLike(store);
  if (storage instanceof Map) {
    storage.set(VOUCHER_STORAGE_KEY, entitlement);
  } else if (storage && typeof storage.setItem === 'function') {
    storage.setItem(VOUCHER_STORAGE_KEY, JSON.stringify(entitlement));
  }

  return {
    success: true,
    message: `${voucher.label} applied. Pro access is active until ${new Date(validUntil).toLocaleDateString()}.`,
    entitlement
  };
}

export function getStaticEntitlement(store = globalThis.localStorage) {
  const voucher = readStaticVoucherState(store);
  if (!voucher) return null;
  return {
    ...voucher,
    planId: voucher.planId || 'pro',
    status: 'active',
    source: 'voucher'
  };
}

export function isProTemplate(templateId) {
  return TEMPLATE_IDS.PRO.includes(templateId);
}

export function canUseFeature(featureId, entitlement, now = Date.now()) {
  if (featureId !== FEATURE_IDS.ALL_TEMPLATES && featureId !== FEATURE_IDS.JOB_DESCRIPTION_ATS) {
    return false;
  }

  const active = entitlement || getStaticEntitlement();
  if (!active || active.planId !== PLAN_CONFIG.pro.id || active.status !== 'active') {
    return false;
  }

  if (!Number.isFinite(active.validUntil)) {
    return false;
  }

  return active.validUntil > now;
}
