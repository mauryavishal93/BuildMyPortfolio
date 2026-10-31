import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
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
    { code: 'LIMITED7', durationDays: 7, maxRedemptions: 2 }
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

before(async () => {
  Object.assign(process.env, environment);
  fakeDatabase = createFakeDatabase();
  app.locals.firebaseAdmin = {
    auth: {
      verifyIdToken: async token => {
        if (token === 'valid-test-token') return { uid: 'user-1' };
        if (token === 'other-test-token') return { uid: 'user-2' };
        if (token === 'third-test-token') return { uid: 'user-3' };
        if (token === 'fourth-test-token') return { uid: 'user-4' };
        if (token === 'admin-test-token') return { uid: 'admin-1', email: 'admin@example.com' };
        throw new Error('Invalid token');
      }
    },
    db: fakeDatabase.db
  };
  app.locals.razorpayRequest = async (endpoint, { method = 'GET' } = {}) => {
    if (/^\/subscriptions\/sub_[A-Za-z0-9]+\/cancel$/.test(endpoint)) {
      return { id: endpoint.split('/')[2], status: 'cancelled' };
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

test('removed app-selection and marriage URLs return visitors to the resume-builder home', async () => {
  for (const path of ['/app-select.html', '/marriage-home.html']) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/home.html');
  }
});

test('billing config and purchase endpoints keep paid plan sales disabled', async () => {
  const unauthenticated = await request('/api/billing/subscriptions', {
    method: 'POST',
    body: { planKey: 'monthly' }
  });
  assert.equal(unauthenticated.status, 410);

  const config = await request('/api/billing/config');
  const configBody = await config.json();
  assert.equal(configBody.checkoutEnabled, false);
  assert.equal(configBody.entitlementEnabled, true);
  assert.equal(configBody.voucherEnabled, false);
  assert.equal(configBody.keyId, null);
  assert.deepEqual(configBody.plans, {});
  const blocked = await request('/api/billing/subscriptions', {
    method: 'POST',
    token: 'valid-test-token',
    body: { planKey: 'monthly' }
  });
  assert.equal(blocked.status, 410);
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

test('voucher redemption is disabled for all accounts', async () => {
  for (const token of [undefined, 'valid-test-token']) {
    const response = await request('/api/billing/vouchers/redeem', {
      method: 'POST',
      token,
      body: { code: 'WELCOME30' }
    });
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /no longer available/i);
  }
});

test('paid endpoints are disabled while existing subscriptions can still be cancelled', async () => {
  for (const [path, body] of [
    ['/api/billing/subscriptions', { planKey: 'monthly' }],
    ['/api/billing/verify', { razorpaySubscriptionId: 'sub_existing' }],
    ['/api/billing/change-plan', { planKey: 'yearly' }]
  ]) {
    const response = await request(path, { method: 'POST', token: 'valid-test-token', body });
    assert.equal(response.status, 410, path);
  }

  const validUntil = Date.now() + 60_000;
  fakeDatabase.records.set('billingSubscriptions/sub_existing', {
    uid: 'user-1',
    planKey: 'monthly',
    currentEnd: validUntil,
    status: 'active'
  });
  fakeDatabase.records.set('users/user-1/billing/entitlement', {
    planId: 'pro',
    billingPlan: 'monthly',
    status: 'active',
    validUntil,
    subscriptionId: 'sub_existing',
    cancelAtCycleEnd: false
  });
  const cancelled = await request('/api/billing/cancel', {
    method: 'POST',
    token: 'valid-test-token',
    body: { subscriptionId: 'sub_existing', reason: 'User requested cancellation' }
  });
  assert.equal(cancelled.status, 200);
  assert.equal(fakeDatabase.records.get('users/user-1/billing/entitlement').cancelAtCycleEnd, true);
});
