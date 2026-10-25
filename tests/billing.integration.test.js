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
  RAZORPAY_PLAN_YEARLY_ID: 'plan_yearly_test'
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
        if (token !== 'valid-test-token') throw new Error('Invalid token');
        return { uid: 'user-1' };
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
  assert.equal((await config.json()).checkoutEnabled, false);
  const blocked = await request('/api/billing/subscriptions', {
    method: 'POST',
    token: 'valid-test-token',
    body: { planKey: 'monthly' }
  });
  assert.equal(blocked.status, 503);
  process.env.BILLING_TEST_MODE_VERIFIED = environment.BILLING_TEST_MODE_VERIFIED;
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

  const cancelled = await request('/api/billing/cancel', {
    method: 'POST',
    token: 'valid-test-token',
    body: { subscriptionId: 'sub_test1' }
  });
  assert.equal(cancelled.status, 200);
  assert.equal(fakeDatabase.records.get('users/user-1/billing/entitlement').cancelAtCycleEnd, true);

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
