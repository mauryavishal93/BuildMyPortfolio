import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  BILLING_PLANS,
  billingConfigured,
  entitlementFromSubscription,
  planKeyForRazorpayPlanId,
  planMatchesRazorpay,
  validRazorpaySignature,
  validWebhookSignature
} from '../backend/billing.js';

test('server billing plans use the requested monthly and yearly INR amounts', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(BILLING_PLANS).map(([key, plan]) => [key, [plan.amount, plan.currency, plan.period, plan.interval]])),
    {
      monthly: [9900, 'INR', 'monthly', 1],
      yearly: [39900, 'INR', 'yearly', 1]
    }
  );
});

test('Razorpay checkout signature accepts only the expected subscription and payment pair', () => {
  const secret = 'test-secret';
  const message = 'sub_123|pay_456';
  const signature = createHmac('sha256', secret).update(message).digest('hex');
  assert.equal(validRazorpaySignature(message, signature, secret), true);
  assert.equal(validRazorpaySignature('sub_other|pay_456', signature, secret), false);
  assert.equal(validRazorpaySignature(message, 'not-a-signature', secret), false);
  assert.equal(validRazorpaySignature(message, signature, ''), false);
});

test('webhook signature validates the exact raw request body', () => {
  const secret = 'webhook-secret';
  const rawBody = Buffer.from('{"event":"subscription.charged"}');
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(validWebhookSignature(rawBody, signature, secret), true);
  assert.equal(validWebhookSignature(Buffer.from('{"event":"subscription.cancelled"}'), signature, secret), false);
  assert.equal(validWebhookSignature('{"event":"subscription.charged"}', signature, secret), false);
});

test('Razorpay plan metadata must exactly match server-set price and billing interval', () => {
  const plan = {
    id: 'plan_monthly',
    item: { amount: 9900, currency: 'INR' },
    period: 'monthly',
    interval: 1
  };
  assert.equal(planMatchesRazorpay(plan, BILLING_PLANS.monthly), true);
  assert.equal(planMatchesRazorpay({ ...plan, item: { ...plan.item, amount: 1 } }, BILLING_PLANS.monthly), false);
  assert.equal(planMatchesRazorpay({ ...plan, period: 'yearly' }, BILLING_PLANS.monthly), false);
});

test('Razorpay plan IDs resolve only to configured billing plans', () => {
  const env = {
    RAZORPAY_PLAN_MONTHLY_ID: 'plan_monthly',
    RAZORPAY_PLAN_YEARLY_ID: 'plan_yearly'
  };
  assert.equal(planKeyForRazorpayPlanId('plan_monthly', env), 'monthly');
  assert.equal(planKeyForRazorpayPlanId('plan_yearly', env), 'yearly');
  assert.equal(planKeyForRazorpayPlanId('plan_unknown', env), null);
});

test('entitlements are server verified and expire at Razorpay current_end', () => {
  const subscription = {
    current_end: 2_000,
    notes: { plan_key: 'yearly' }
  };
  const active = entitlementFromSubscription(subscription, 'monthly', 1_000_000);
  assert.equal(active.planId, 'pro');
  assert.equal(active.billingPlan, 'yearly');
  assert.equal(active.source, 'server-verified');
  assert.equal(active.validUntil, 2_000_000);
  assert.equal(active.status, 'active');
  assert.equal(entitlementFromSubscription(subscription, 'monthly', 2_000_000).status, 'expired');
  assert.equal(entitlementFromSubscription({ current_end: 0 }, 'monthly'), null);
});

test('billing stays disabled until provider, Firebase, terms and refund configuration are complete', () => {
  const env = {
    BILLING_ENABLED: 'true',
    BILLING_TERMS_PUBLISHED: 'true',
    BILLING_REFUNDS_PUBLISHED: 'true',
    BILLING_TEST_MODE_VERIFIED: 'true',
    BILLING_LIVE_LAUNCH_APPROVED: 'true',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      client_email: 'billing@test-project.iam.gserviceaccount.com',
      private_key: 'test-private-key'
    }),
    RAZORPAY_KEY_ID: 'key_id',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'webhook',
    RAZORPAY_PLAN_MONTHLY_ID: 'monthly',
    RAZORPAY_PLAN_YEARLY_ID: 'yearly'
  };
  assert.equal(billingConfigured(env), true);
  assert.equal(billingConfigured({ ...env, BILLING_REFUNDS_PUBLISHED: 'false' }), false);
  assert.equal(billingConfigured({ ...env, BILLING_TEST_MODE_VERIFIED: 'false' }), false);
  assert.equal(billingConfigured({ ...env, BILLING_LIVE_LAUNCH_APPROVED: 'false' }), false);
  assert.equal(billingConfigured({ ...env, RAZORPAY_KEY_SECRET: '' }), false);
});
