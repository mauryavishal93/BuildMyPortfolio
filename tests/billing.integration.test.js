import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { app } from '../backend/server.js';

const environment = {
  BILLING_ENABLED: 'true',
  BILLING_TERMS_PUBLISHED: 'true',
  BILLING_REFUNDS_PUBLISHED: 'true',
  BILLING_TEST_MODE_VERIFIED: 'true',
  BILLING_LIVE_LAUNCH_APPROVED: 'true',
  ADMIN_EMAILS: 'admin@example.com',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'billing@test-project.iam.gserviceaccount.com',
    private_key: 'test-private-key'
  }),
  RAZORPAY_KEY_ID: 'test_key_id',
  RAZORPAY_KEY_SECRET: 'test_key_secret',
  RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
  RAZORPAY_PLAN_MONTHLY_ID: 'plan_monthly_test',
  RAZORPAY_PLAN_YEARLY_ID: 'plan_yearly_test',
  PRO_VOUCHERS_JSON: JSON.stringify([
    { code: 'WELCOME30', durationDays: 30, maxRedemptions: 20 },
    { code: 'LIMITED7', durationDays: 7, maxRedemptions: 1 }
  ])
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map(key => [key, process.env[key]])
);

function createFakeDatabase() {
  const records = new Map();
  const reference = key => ({
    key,
    id: key.split('/').at(-1),
    get: async () => snapshot(key),
    set: async (data, options = {}) => {
      records.set(key, options.merge ? { ...records.get(key), ...data } : data);
    }
  });
  const snapshot = key => ({
    exists: records.has(key),
    data: () => records.get(key)
  });
  const db = {
    collection: name => ({
      doc: id => reference(`${name}/${id || `generated-${records.size + 1}`}`)
    }),
    doc: key => reference(key),
    runTransaction: callback => callback({
      get: async ref => snapshot(ref.key),
      set: (ref, data, options = {}) => {
        records.set(ref.key, options.merge ? { ...records.get(ref.key), ...data } : data);
      },
      create: (ref, data) => {
        if (records.has(ref.key)) throw new Error(`Document already exists: ${ref.key}`);
        records.set(ref.key, data);
      },
      delete: ref => records.delete(ref.key)
    })
  };
  db.records = records;
  return { db, records };
}

let server;
let origin;
let fakeDatabase;
let providerSubscription;
let nextSubscriptionId = 0;

before(async () => {
  Object.assign(process.env, environment);
  fakeDatabase = createFakeDatabase();
  app.locals.firebaseAdmin = {
    auth: {
      verifyIdToken: async token => {
        if (token === 'valid-test-token') return { uid: 'user-1' };
        if (token === 'other-test-token') return { uid: 'user-2' };
        if (token === 'third-test-token') return { uid: 'user-3' };
        if (token === 'admin-test-token') return { uid: 'admin-1', email: 'admin@example.com' };
        throw new Error('Invalid token');
      }
    },
    db: fakeDatabase.db
  };
  app.locals.razorpayRequest = async (endpoint, { method = 'GET' } = {}) => {
    if (endpoint === '/plans/plan_monthly_test') {
      return { id: 'plan_monthly_test', item: { amount: 9900, currency: 'INR' }, period: 'monthly', interval: 1 };
    }
    if (endpoint === '/plans/plan_yearly_test') {
      return { id: 'plan_yearly_test', item: { amount: 39900, currency: 'INR' }, period: 'yearly', interval: 1 };
    }
    if (endpoint === '/subscriptions' && method === 'POST') {
      nextSubscriptionId += 1;
      return {
        id: `sub_test${nextSubscriptionId}`,
        plan_id: 'plan_monthly_test',
        status: 'created'
      };
    }
    if (endpoint === '/subscriptions/sub_test1') return providerSubscription;
    if (endpoint === '/payments/pay_test1') {
      return { id: 'pay_test1', subscription_id: 'sub_test1', status: 'captured' };
    }
    if (endpoint === '/subscriptions/sub_test1/cancel') {
      return { id: 'sub_test1', status: 'cancelled' };
    }
    throw new Error(`Unexpected mocked Razorpay request: ${method} ${endpoint}`);
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  delete app.locals.firebaseAdmin;
  delete app.locals.razorpayRequest;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('health check returns an empty success response', async () => {
  const response = await request('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
});

function signedWebhook(event) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = createHmac('sha256', environment.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return fetch(`${origin}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature
    },
    body: rawBody
  });
}

test('billing routes reject unauthenticated and unapproved checkout requests', async () => {
  const unauthenticated = await request('/api/billing/subscriptions', {
    method: 'POST',
    body: { planKey: 'monthly' }
  });
  assert.equal(unauthenticated.status, 401);

  process.env.BILLING_TEST_MODE_VERIFIED = 'false';
  const config = await request('/api/billing/config');
  const configBody = await config.json();
  assert.equal(configBody.checkoutEnabled, false);
  assert.equal(configBody.entitlementEnabled, true);
  assert.equal(configBody.voucherEnabled, true);
  assert.doesNotMatch(JSON.stringify(configBody), /WELCOME30|LIMITED7/);
  fakeDatabase.records.set('users/user-1/billing/entitlement', {
    planId: 'pro',
    billingPlan: 'yearly',
    validUntil: Date.now() + 60_000,
    subscriptionId: 'sub_existing'
  });
  const entitlement = await request('/api/billing/entitlement', { token: 'valid-test-token' });
  assert.equal(entitlement.status, 200);
  assert.equal((await entitlement.json()).entitlement.planId, 'pro');
  const blocked = await request('/api/billing/subscriptions', {
    method: 'POST',
    token: 'valid-test-token',
    body: { planKey: 'monthly' }
  });
  assert.equal(blocked.status, 503);
  fakeDatabase.records.delete('users/user-1/billing/entitlement');
  process.env.BILLING_TEST_MODE_VERIFIED = environment.BILLING_TEST_MODE_VERIFIED;
});

test('admin pricing stores distinct actual and current values', async () => {
  const save = await request('/api/admin/pricing', {
    method: 'PUT',
    token: 'admin-test-token',
    body: {
      pricing: {
        monthly: { actualPrice: 199, currentPrice: 149 },
        yearly: { actualPrice: 499, currentPrice: 399 }
      }
    }
  });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.pricing.monthly.actualPrice, 199);
  assert.equal(saved.pricing.monthly.currentPrice, 149);
  assert.equal(saved.pricing.yearly.actualPrice, 499);
  assert.equal(saved.pricing.yearly.currentPrice, 399);

  const load = await request('/api/admin/pricing', { token: 'admin-test-token' });
  const loaded = await load.json();
  assert.equal(loaded.pricing.monthly.actualPrice, 199);
  assert.equal(loaded.pricing.monthly.currentPrice, 149);
  assert.equal(loaded.pricing.yearly.actualPrice, 499);
  assert.equal(loaded.pricing.yearly.currentPrice, 399);
});

test('voucher redemption grants configured Pro access once, rejects active plans, and enforces global limits', async () => {
  const unauthenticated = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    body: { code: 'WELCOME30' }
  });
  assert.equal(unauthenticated.status, 401);

  const invalid = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'valid-test-token',
    body: { code: 'NOT-A-CODE' }
  });
  assert.equal(invalid.status, 404);

  const redeemed = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'valid-test-token',
    body: { code: ' welcome30 ' }
  });
  assert.equal(redeemed.status, 200);
  const entitlement = (await redeemed.json()).entitlement;
  assert.equal(entitlement.planId, 'pro');
  assert.equal(entitlement.billingPlan, 'voucher');
  assert.equal(entitlement.source, 'server-verified');
  assert.ok(entitlement.validUntil > Date.now());

  const duplicate = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'valid-test-token',
    body: { code: 'WELCOME30' }
  });
  assert.equal(duplicate.status, 409);

  const activeAccount = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'valid-test-token',
    body: { code: 'LIMITED7' }
  });
  assert.equal(activeAccount.status, 409);

  const firstLimited = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'other-test-token',
    body: { code: 'LIMITED7' }
  });
  assert.equal(firstLimited.status, 200);
  const capped = await request('/api/billing/vouchers/redeem', {
    method: 'POST',
    token: 'third-test-token',
    body: { code: 'LIMITED7' }
  });
  assert.equal(capped.status, 409);

  for (const uid of ['user-1', 'user-2']) {
    fakeDatabase.records.delete(`users/${uid}/billing/entitlement`);
  }
});

test('subscription checkout, payment verification, and signed webhook lifecycle update server entitlements', async () => {
  const checkoutResponse = await request('/api/billing/subscriptions', {
    method: 'POST',
    token: 'valid-test-token',
    body: { planKey: 'monthly' }
  });
  assert.equal(checkoutResponse.status, 201);
  assert.equal((await checkoutResponse.json()).subscriptionId, 'sub_test1');
  assert.equal(fakeDatabase.records.get('billingSubscriptions/sub_test1').uid, 'user-1');

  const endOfPeriod = Math.floor(Date.now() / 1000) + 3600;
  providerSubscription = {
    id: 'sub_test1',
    plan_id: 'plan_monthly_test',
    status: 'active',
    current_end: endOfPeriod,
    notes: { plan_key: 'monthly' }
  };
  const signature = createHmac('sha256', environment.RAZORPAY_KEY_SECRET)
    .update('sub_test1|pay_test1')
    .digest('hex');
  const verified = await request('/api/billing/verify', {
    method: 'POST',
    token: 'valid-test-token',
    body: {
      razorpaySubscriptionId: 'sub_test1',
      razorpayPaymentId: 'pay_test1',
      razorpaySignature: signature
    }
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).entitlement.planId, 'pro');
  assert.equal(fakeDatabase.records.get('users/user-1/billing/entitlement').status, 'active');

  const activatedEvent = {
    id: 'evt_activation_1',
    event: 'subscription.activated',
    payload: { subscription: { entity: providerSubscription } }
  };
  assert.equal((await signedWebhook(activatedEvent)).status, 200);
  assert.equal((await signedWebhook(activatedEvent)).status, 200);
  assert.equal(fakeDatabase.records.get('billingWebhookEvents/evt_activation_1').subscriptionId, 'sub_test1');

  fakeDatabase.records.set('users/user-1/billing/entitlement', {
    planId: 'pro',
    billingPlan: 'monthly',
    status: 'active',
    validUntil: Date.now() + 60_000,
    subscriptionId: null,
    cancelAtCycleEnd: false
  });
  const entitlementResponse = await request('/api/billing/entitlement', { token: 'valid-test-token' });
  assert.equal((await entitlementResponse.json()).entitlement.subscriptionId, 'sub_test1');

  const cancelled = await request('/api/billing/cancel', {
    method: 'POST',
    token: 'valid-test-token',
    body: { reason: 'Changing to a different plan' }
  });
  assert.equal(cancelled.status, 200);
  assert.equal(fakeDatabase.records.get('users/user-1/billing/entitlement').cancelAtCycleEnd, true);
  const userActivityResponse = await request('/api/billing/activity', { token: 'valid-test-token' });
  const userActivity = (await userActivityResponse.json()).activity;
  const userCancellation = userActivity.find(item => item.title === 'Subscription cancelled by user');
  assert.equal(userCancellation.actorType, 'user');
  assert.equal(userCancellation.actorUid, 'user-1');
  assert.ok(Number.isFinite(userCancellation.occurredAt));

  fakeDatabase.records.set('users/user-2/billing/entitlement', {
    planId: 'pro', billingPlan: 'monthly', status: 'active', validUntil: Date.now() + 60_000,
    subscriptionId: 'sub_admin_cancel'
  });
  const adminCancelled = await request('/api/admin/users/user-2/cancel-pro', {
    method: 'POST', token: 'admin-test-token', body: { reason: 'User requested cancellation' }
  });
  assert.equal(adminCancelled.status, 200);
  const adminActivityResponse = await request('/api/billing/activity', { token: 'other-test-token' });
  const adminActivity = (await adminActivityResponse.json()).activity;
  const adminCancellation = adminActivity.find(item => item.title === 'Pro access cancelled by admin');
  assert.equal(adminCancellation.actorType, 'admin');
  assert.equal(adminCancellation.actorUid, 'admin-1');
  assert.equal(adminCancellation.detail, 'User requested cancellation');
  assert.ok(Number.isFinite(adminCancellation.occurredAt));

  const expiredEvent = {
    id: 'evt_expired_1',
    event: 'subscription.expired',
    payload: {
      subscription: {
        entity: { ...providerSubscription, current_end: Math.floor(Date.now() / 1000) - 1, status: 'expired' }
      }
    }
  };
  assert.equal((await signedWebhook(expiredEvent)).status, 200);
  assert.equal(fakeDatabase.records.get('users/user-1/billing/entitlement').planId, 'free');

  const invalidSignature = await fetch(`${origin}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'invalid' },
    body: JSON.stringify(activatedEvent)
  });
  assert.equal(invalidSignature.status, 400);
});
