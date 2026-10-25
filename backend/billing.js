import { createHmac, timingSafeEqual } from 'node:crypto';

export const BILLING_PLANS = Object.freeze({
  monthly: Object.freeze({
    id: 'monthly',
    label: 'Pro Monthly',
    amount: 9900,
    currency: 'INR',
    period: 'monthly',
    interval: 1,
    totalCount: 1200
  }),
  yearly: Object.freeze({
    id: 'yearly',
    label: 'Pro Yearly',
    amount: 39900,
    currency: 'INR',
    period: 'yearly',
    interval: 1,
    totalCount: 100
  })
});

export function validRazorpaySignature(message, signature, secret) {
  if (typeof message !== 'string' || typeof signature !== 'string' || !secret) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  let provided;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function validWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let provided;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function planMatchesRazorpay(plan, expected) {
  return plan?.id
    && plan.item?.amount === expected.amount
    && plan.item?.currency === expected.currency
    && plan.period === expected.period
    && plan.interval === expected.interval;
}

export function firebaseAdminConfigured(env = process.env) {
  if (typeof env.FIREBASE_SERVICE_ACCOUNT_JSON !== 'string') return false;
  try {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return serviceAccount.type === 'service_account'
      && typeof serviceAccount.project_id === 'string'
      && typeof serviceAccount.client_email === 'string'
      && typeof serviceAccount.private_key === 'string';
  } catch {
    return false;
  }
}

export function planKeyForRazorpayPlanId(planId, env = process.env) {
  return Object.keys(BILLING_PLANS).find(key => env[`RAZORPAY_PLAN_${key.toUpperCase()}_ID`] === planId) || null;
}

export function entitlementFromSubscription(subscription, fallbackPlan = 'monthly', now = Date.now()) {
  const validUntil = Number(subscription?.current_end) * 1000;
  const planId = subscription?.notes?.plan_key || fallbackPlan;
  if (!Number.isFinite(validUntil) || validUntil <= 0
    || !Object.hasOwn(BILLING_PLANS, planId)) {
    return null;
  }

  return {
    planId: 'pro',
    billingPlan: planId,
    status: validUntil > now ? 'active' : 'expired',
    source: 'server-verified',
    validUntil
  };
}

export function billingConfigured(env = process.env) {
  if (env.BILLING_ENABLED !== 'true'
    || env.BILLING_TERMS_PUBLISHED !== 'true'
    || env.BILLING_REFUNDS_PUBLISHED !== 'true'
    || env.BILLING_TEST_MODE_VERIFIED !== 'true'
    || env.BILLING_LIVE_LAUNCH_APPROVED !== 'true'
    || ![
      env.RAZORPAY_KEY_ID,
      env.RAZORPAY_KEY_SECRET,
      env.RAZORPAY_WEBHOOK_SECRET,
      env.RAZORPAY_PLAN_MONTHLY_ID,
      env.RAZORPAY_PLAN_YEARLY_ID
    ].every(value => typeof value === 'string' && value.length > 0)
    || !firebaseAdminConfigured(env)) {
    return false;
  }
  return true;
}
