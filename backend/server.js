import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BILLING_PLANS,
  billingConfigured,
  configuredVouchers,
  entitlementFromSubscription,
  firebaseAdminConfigured,
  planKeyForRazorpayPlanId,
  planMatchesRazorpay,
  validRazorpaySignature,
  validWebhookSignature,
  voucherDocumentId
} from './billing.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(backendDir, '../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const distDir = path.resolve(backendDir, '../dist');
const app = express();
const port = Number(process.env.PORT) || 3000;
const subscriptionCollection = 'billingSubscriptions';
let firebaseAdmin;

app.disable('x-powered-by');

app.use((request, response, next) => {
  const hostname = String(request.hostname || '').toLowerCase();
  if (hostname === 'buildmyportfolio.onrender.com') {
    return response.redirect(301, `https://personacraftpro.onrender.com${request.originalUrl || '/'}`);
  }
  next();
});

function requireBillingConfig(_request, response, next) {
  if (!billingConfigured()) {
    response.status(503).json({ error: 'Paid plans are not configured on this server yet.' });
    return;
  }
  next();
}

function requireEntitlementConfig(_request, response, next) {
  if (!firebaseAdminConfigured()) {
    response.status(503).json({ error: 'Plan status is unavailable on this server.' });
    return;
  }
  next();
}

async function getFirebaseAdmin() {
  if (app.locals.firebaseAdmin) return app.locals.firebaseAdmin;
  if (firebaseAdmin) return firebaseAdmin;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('Firebase Admin credentials are not configured.');

  const [{ cert, getApps, initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore')
  ]);
  const appInstance = getApps()[0] || initializeApp({
    credential: cert(JSON.parse(serviceAccountJson))
  });
  firebaseAdmin = {
    auth: getAuth(appInstance),
    db: getFirestore(appInstance)
  };
  return firebaseAdmin;
}

async function requireFirebaseUser(request, response, next) {
  const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') || '');
  if (!match) {
    response.status(401).json({ error: 'Sign in before accessing paid plans.' });
    return;
  }

  try {
    const admin = await getFirebaseAdmin();
    request.user = await admin.auth.verifyIdToken(match[1], true);
    next();
  } catch (error) {
    console.error('Billing authentication failed.', error);
    response.status(401).json({ error: 'Your sign-in could not be verified. Sign in again and retry.' });
  }
}

function isAdminUser(user) {
  if (user?.admin === true || user?.claims?.admin === true) return true;
  const allowed = (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && allowed.includes(user.email.toLowerCase()));
}

async function requireAdmin(request, response, next) {
  try {
    if (!isAdminUser(request.user)) {
      response.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  } catch (error) {
    response.status(403).json({ error: 'Administrator access required.' });
  }
}

function razorpayConfiguration() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
  };
}

async function razorpayRequest(endpoint, { method = 'GET', body } = {}) {
  if (app.locals.razorpayRequest) {
    return app.locals.razorpayRequest(endpoint, { method, body });
  }
  const { keyId, keySecret } = razorpayConfiguration();
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Razorpay request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function providerPlanId(planKey) {
  return planKey === 'monthly'
    ? process.env.RAZORPAY_PLAN_MONTHLY_ID
    : process.env.RAZORPAY_PLAN_YEARLY_ID;
}

async function verifiedProviderPlan(planKey) {
  const expected = BILLING_PLANS[planKey];
  if (!expected) return null;
  const plan = await razorpayRequest(`/plans/${encodeURIComponent(providerPlanId(planKey))}`);
  if (!planMatchesRazorpay(plan, expected)) {
    throw new Error(`The Razorpay ${planKey} plan does not match the configured price and billing interval.`);
  }
  return plan;
}

function subscriptionDocument(db, subscriptionId) {
  return db.collection(subscriptionCollection).doc(subscriptionId);
}

function userEntitlementDocument(db, uid) {
  return db.doc(`users/${uid}/billing/entitlement`);
}

function userCheckoutDocument(db, uid) {
  return db.doc(`users/${uid}/billing/checkout`);
}

function publicEntitlement(data) {
  const validUntil = Number(data?.validUntil) || 0;
  const hasLiveSubscription = Boolean(data?.subscriptionId) || data?.status === 'active';
  const status = hasLiveSubscription || validUntil > Date.now() ? 'active' : 'inactive';
  return {
    planId: data?.planId || 'free',
    billingPlan: data?.billingPlan || null,
    status,
    source: 'server-verified',
    validUntil,
    subscriptionId: data?.subscriptionId || null,
    cancelAtCycleEnd: data?.cancelAtCycleEnd === true,
    scheduledPlan: Object.hasOwn(BILLING_PLANS, data?.scheduledPlan) ? data.scheduledPlan : null,
    scheduledAt: Number(data?.scheduledAt) || null,
    planChangeStatus: data?.planChangeStatus || null
  };
}


function billingActivityDocument(db, uid, id) {
  return db.doc(`users/${uid}/billingActivity/${id}`);
}

async function recordBillingActivity(db, uid, activity) {
  const occurredAt = Date.now();
  try {
    await billingActivityDocument(db, uid, randomUUID()).set({
      type: String(activity.type || 'billing'),
      status: String(activity.status || 'success'),
      title: String(activity.title || 'Billing activity'),
      detail: String(activity.detail || ''),
      planKey: activity.planKey || null,
      amount: activity.amount || null,
      providerSubscriptionId: activity.providerSubscriptionId || null,
      actorType: ['user', 'admin'].includes(activity.actorType) ? activity.actorType : null,
      actorUid: activity.actorUid || null,
      occurredAt
    });
  } catch (error) {
    console.error('Could not write billing activity.', { uid, type: activity.type, error });
  }
  return occurredAt;
}

function normalizePlanPrice(rawValue, fallback) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.round(numeric * 100) / 100;
}

function calculateDiscount(actualPrice, currentPrice) {
  if (!Number.isFinite(actualPrice) || actualPrice <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((actualPrice - currentPrice) / actualPrice) * 100)));
}

function normalizePricingConfig(rawConfig = {}) {
  const monthlyActual = normalizePlanPrice(rawConfig?.monthly?.actualPrice, BILLING_PLANS.monthly.amount / 100);
  const monthlyCurrent = normalizePlanPrice(rawConfig?.monthly?.currentPrice, monthlyActual);
  const yearlyActual = normalizePlanPrice(rawConfig?.yearly?.actualPrice, BILLING_PLANS.yearly.amount / 100);
  const yearlyCurrent = normalizePlanPrice(rawConfig?.yearly?.currentPrice, yearlyActual);
  return {
    currency: 'INR',
    monthly: {
      actualPrice: monthlyActual,
      currentPrice: monthlyCurrent,
      discountPercent: calculateDiscount(monthlyActual, monthlyCurrent)
    },
    yearly: {
      actualPrice: yearlyActual,
      currentPrice: yearlyCurrent,
      discountPercent: calculateDiscount(yearlyActual, yearlyCurrent)
    },
    updatedAt: Date.now()
  };
}

async function loadPricingConfigFromStore() {
  try {
    const { db } = await getFirebaseAdmin();
    const snapshot = await db.doc('appConfig/pricing').get();
    return normalizePricingConfig(snapshot.exists ? snapshot.data() : {});
  } catch {
    return normalizePricingConfig({});
  }
}

app.get('/api/health', (_request, response) => {
  response
    .status(200)
    .type('text/plain')
    .set('Cache-Control', 'no-store')
    .send('OK');
});

app.use('/api/billing/webhook', express.raw({ type: 'application/json', limit: '256kb' }));
app.use(express.json({ limit: '32kb' }));

app.use('/api/billing', (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/pricing/config', async (_request, response) => {
  try {
    response.json({ pricing: await loadPricingConfigFromStore() });
  } catch (error) {
    console.error('Could not load public pricing config.', error);
    response.status(500).json({ error: 'Pricing configuration is temporarily unavailable.' });
  }
});

app.get('/api/admin/pricing', requireFirebaseUser, requireAdmin, async (_request, response) => {
  try {
    response.json({ pricing: await loadPricingConfigFromStore() });
  } catch (error) {
    console.error('Could not load admin pricing config.', error);
    response.status(500).json({ error: 'Unable to load pricing configuration.' });
  }
});

app.put('/api/admin/pricing', requireFirebaseUser, requireAdmin, async (request, response) => {
  const rawPricing = request.body?.pricing || request.body || {};
  const monthlyActual = normalizePlanPrice(rawPricing?.monthly?.actualPrice, BILLING_PLANS.monthly.amount / 100);
  const monthlyCurrent = normalizePlanPrice(rawPricing?.monthly?.currentPrice, monthlyActual);
  const yearlyActual = normalizePlanPrice(rawPricing?.yearly?.actualPrice, BILLING_PLANS.yearly.amount / 100);
  const yearlyCurrent = normalizePlanPrice(rawPricing?.yearly?.currentPrice, yearlyActual);

  if (!Number.isFinite(monthlyActual) || !Number.isFinite(monthlyCurrent)
    || !Number.isFinite(yearlyActual) || !Number.isFinite(yearlyCurrent)
    || monthlyActual < 0 || monthlyCurrent < 0 || yearlyActual < 0 || yearlyCurrent < 0) {
    response.status(400).json({ error: 'Price values must be non-negative numbers.' });
    return;
  }

  try {
    const { db } = await getFirebaseAdmin();
    const pricing = normalizePricingConfig({
      monthly: {
        actualPrice: monthlyActual,
        currentPrice: monthlyCurrent
      },
      yearly: {
        actualPrice: yearlyActual,
        currentPrice: yearlyCurrent
      }
    });
    await db.doc('appConfig/pricing').set(pricing, { merge: true });
    response.json({ pricing });
  } catch (error) {
    console.error('Could not save pricing configuration.', error);
    response.status(500).json({ error: 'Unable to save pricing configuration.' });
  }
});

app.get('/api/billing/config', (_request, response) => {
  response.json({
    checkoutEnabled: billingConfigured(),
    entitlementEnabled: firebaseAdminConfigured(),
    voucherEnabled: firebaseAdminConfigured() && Boolean(configuredVouchers()),
    keyId: billingConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    plans: Object.fromEntries(Object.entries(BILLING_PLANS).map(([key, plan]) => [
      key,
      { id: plan.id, label: plan.label, amount: plan.amount, currency: plan.currency, period: plan.period }
    ]))
  });
});

app.post('/api/billing/webhook', async (request, response) => {
    if (!billingConfigured()
      || !validWebhookSignature(request.body, request.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET)) {
      response.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }

    let event;
    try {
      event = JSON.parse(request.body.toString('utf8'));
    } catch {
      response.status(400).json({ error: 'Invalid webhook body.' });
      return;
    }

    const eventId = event.id;
    const subscription = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;
    const subscriptionId = subscription?.id || payment?.subscription_id;
    const lifecycleEvents = new Set([
      'subscription.activated',
      'subscription.charged',
      'subscription.halted',
      'subscription.cancelled',
      'subscription.completed',
      'subscription.expired'
    ]);
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)
      || typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
      || !lifecycleEvents.has(event.event)) {
      response.status(200).json({ received: true });
      return;
    }

    try {
      const { db } = await getFirebaseAdmin();
      const mappedSubscription = await subscriptionDocument(db, subscriptionId).get();
      if (!mappedSubscription.exists) {
        console.warn('Ignoring Razorpay subscription event without a local subscription record.', { eventId, subscriptionId });
        response.status(200).json({ received: true });
        return;
      }
      const mapping = mappedSubscription.data();
      const eventRef = db.collection('billingWebhookEvents').doc(eventId);
      const entitlementRef = userEntitlementDocument(db, mapping.uid);
      const checkoutRef = userCheckoutDocument(db, mapping.uid);
      await db.runTransaction(async transaction => {
        const duplicate = await transaction.get(eventRef);
        if (duplicate.exists) return;

        const currentEntitlement = await transaction.get(entitlementRef);
        const currentCheckout = await transaction.get(checkoutRef);
        const validUntil = Number(subscription?.current_end) * 1000
          || Number(currentEntitlement.data()?.validUntil)
          || 0;
        const isPaidThrough = validUntil > Date.now();
        const activated = ['subscription.activated', 'subscription.charged'].includes(event.event);
        const providerPlanKey = planKeyForRazorpayPlanId(subscription?.plan_id);
        const planChangeApplied = event.event === 'subscription.charged'
          && providerPlanKey
          && providerPlanKey !== mapping.planKey;
        const planChangeCancelled = ['subscription.cancelled', 'subscription.completed', 'subscription.expired'].includes(event.event)
          && !isPaidThrough;
        const billingPlan = planChangeApplied ? providerPlanKey : mapping.planKey;
        const scheduledPlan = planChangeApplied || planChangeCancelled ? null : mapping.pendingPlanKey || null;
        const scheduledAt = scheduledPlan ? Number(mapping.scheduledAt) || null : null;
        const entitlement = activated
          ? entitlementFromSubscription(subscription, billingPlan)
          : isPaidThrough
            ? {
                planId: 'pro',
                billingPlan,
                status: 'active',
                source: 'server-verified',
                validUntil
              }
            : {
                planId: 'free',
                billingPlan: mapping.planKey,
                status: 'inactive',
                source: 'server-verified',
                validUntil: 0
              };
        if (entitlement) {
          entitlement.billingPlan = billingPlan;
          entitlement.scheduledPlan = scheduledPlan;
          entitlement.scheduledAt = scheduledAt;
          entitlement.subscriptionId = subscriptionId;
          entitlement.cancelAtCycleEnd = event.event === 'subscription.cancelled'
            || currentEntitlement.data()?.cancelAtCycleEnd === true
            || mapping.cancelAtCycleEnd === true;
        }

        transaction.create(eventRef, { event: event.event, subscriptionId, receivedAt: Date.now() });
        transaction.set(subscriptionDocument(db, subscriptionId), {
          status: subscription?.status || event.event.replace('subscription.', ''),
          currentEnd: validUntil,
          ...(planChangeApplied ? { planKey: billingPlan, planId: subscription.plan_id } : {}),
          ...(planChangeApplied || planChangeCancelled ? {
            pendingPlanKey: null,
            pendingPlanId: null,
            pendingPlanStatus: null,
            planChangeRequestId: null,
            scheduledAt: null
          } : {}),
          updatedAt: Date.now()
        }, { merge: true });
        transaction.set(entitlementRef, entitlement || {
          planId: 'free',
          billingPlan: mapping.planKey,
          status: 'inactive',
          source: 'server-verified',
          validUntil: 0
        });
        if (currentCheckout.data()?.subscriptionId === subscriptionId) {
          if (['subscription.completed', 'subscription.expired'].includes(event.event) && !isPaidThrough) {
            transaction.delete(checkoutRef);
          } else {
            transaction.set(checkoutRef, {
              status: event.event.replace('subscription.', ''),
              currentEnd: validUntil,
              planKey: billingPlan,
              scheduledPlan,
              scheduledAt,
              planChangeStatus: scheduledPlan ? mapping.pendingPlanStatus || 'scheduled' : null,
              updatedAt: Date.now()
            }, { merge: true });
          }
        }
      });
      response.json({ received: true });
    } catch (error) {
      console.error('Could not process Razorpay subscription webhook.', error);
      response.status(500).json({ error: 'Webhook processing failed.' });
    }
  }
);

app.get('/api/billing/activity', requireEntitlementConfig, requireFirebaseUser, async (request, response) => {
  try {
    const { db } = await getFirebaseAdmin();
    let activity = [];
    const records = db.records;
    if (records instanceof Map) {
      activity = [...records.entries()]
        .filter(([key]) => key.startsWith(`users/${request.user.uid}/billingActivity/`))
        .map(([key, value]) => ({ id: key.split('/').at(-1), ...value }))
        .sort((a, b) => Number(b.occurredAt) - Number(a.occurredAt))
        .slice(0, 50);
    } else {
      const collection = db.collection(`users/${request.user.uid}/billingActivity`);
      const snapshot = await collection.orderBy?.('occurredAt', 'desc').limit?.(50).get?.();
      activity = snapshot?.docs?.map(document => ({ id: document.id, ...document.data() })) || [];
    }
    response.json({ activity });
  } catch (error) {
    console.error('Could not load billing activity.', error);
    response.status(500).json({ error: 'Could not load your billing history.' });
  }
});

app.get('/api/billing/entitlement', requireEntitlementConfig, requireFirebaseUser, async (request, response) => {
  try {
    const { db } = await getFirebaseAdmin();
    const snapshot = await userEntitlementDocument(db, request.user.uid).get();
    const entitlement = publicEntitlement(snapshot.data());
    if (!entitlement.subscriptionId) {
      const checkoutSnapshot = await userCheckoutDocument(db, request.user.uid).get();
      const checkoutSubscriptionId = typeof checkoutSnapshot.data()?.subscriptionId === 'string'
        ? checkoutSnapshot.data().subscriptionId.trim()
        : '';
      if (checkoutSubscriptionId) entitlement.subscriptionId = checkoutSubscriptionId;
    }
    response.json({ entitlement });
  } catch (error) {
    console.error('Could not load billing entitlement.', error);
    response.status(500).json({ error: 'Could not load your plan status.' });
  }
});

app.post('/api/billing/vouchers/redeem', requireEntitlementConfig, requireFirebaseUser, async (request, response) => {
  const code = typeof request.body?.code === 'string' ? request.body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(code)) {
    response.status(400).json({ error: 'Enter a valid voucher code.' });
    return;
  }
  const vouchers = configuredVouchers();
  try {
    const { db } = await getFirebaseAdmin();
    let voucher = (vouchers || []).find(item => item.code === code);
    if (!voucher) {
      const generatedSnapshot = await db.doc(`adminVouchers/${voucherDocumentId(code)}`).get();
      if (generatedSnapshot.exists && generatedSnapshot.data()?.code === code) {
        const generated = generatedSnapshot.data();
        voucher = {
          code,
          durationDays: Number(generated.durationDays),
          maxRedemptions: Number(generated.maxRedemptions),
          assignedUid: generated.assignedUid || '',
          expiresAt: generated.createdAt ? Number(generated.createdAt) + 24 * 60 * 60 * 1000 : (generated.expiresAt || null)
        };
      }
    }
    if (!voucher || !Number.isInteger(voucher.durationDays) || voucher.durationDays < 1 || voucher.durationDays > 3650
      || !Number.isInteger(voucher.maxRedemptions) || voucher.maxRedemptions < 1
      || (voucher.expiresAt && Number(voucher.expiresAt) <= Date.now())) {
      response.status(404).json({ error: 'That voucher code is invalid or unavailable.' });
      return;
    }
    if (voucher.assignedUid && voucher.assignedUid !== request.user.uid) {
      response.status(403).json({ error: 'This voucher is not valid for your account.' });
      return;
    }
    const voucherId = voucherDocumentId(code);
    const voucherRef = db.doc(`billingVouchers/${voucherId}`);
    const adminVoucherRef = db.doc(`adminVouchers/${voucherId}`);
    const userVoucherRef = db.doc(`users/${request.user.uid}/vouchers/${voucherId}`);
    const entitlementRef = userEntitlementDocument(db, request.user.uid);
    const now = Date.now();
    let validUntil;
    await db.runTransaction(async transaction => {
      const [voucherSnapshot, adminVoucherSnapshot, userVoucherSnapshot, entitlementSnapshot] = await Promise.all([
        transaction.get(voucherRef),
        transaction.get(adminVoucherRef),
        transaction.get(userVoucherRef),
        transaction.get(entitlementRef)
      ]);
      if (userVoucherSnapshot.exists) {
        const error = new Error('This account has already redeemed that voucher.');
        error.status = 409;
        throw error;
      }
      const currentEntitlement = entitlementSnapshot.data();
      if (Number(currentEntitlement?.validUntil) > now) {
        const error = new Error('Your current Pro access is still active. Redeem a voucher after it expires.');
        error.status = 409;
        throw error;
      }
      const redeemedCount = Number(voucherSnapshot.data()?.redeemedCount) || 0;
      if (redeemedCount >= voucher.maxRedemptions) {
        const error = new Error('That voucher has reached its redemption limit.');
        error.status = 409;
        throw error;
      }
      validUntil = now + voucher.durationDays * 24 * 60 * 60 * 1000;
      transaction.set(voucherRef, {
        redeemedCount: redeemedCount + 1,
        updatedAt: now
      }, { merge: true });
      if (adminVoucherSnapshot.exists) {
        transaction.set(adminVoucherRef, {
          redeemedCount: redeemedCount + 1,
          redeemedAt: now,
          redeemedByUid: request.user.uid,
          updatedAt: now
        }, { merge: true });
      }
      transaction.create(userVoucherRef, { redeemedAt: now });
      transaction.set(entitlementRef, {
        planId: 'pro',
        billingPlan: 'voucher',
        status: 'active',
        source: 'server-verified',
        validUntil,
        subscriptionId: null,
        cancelAtCycleEnd: false,
        voucherId,
        updatedAt: now
      });
    });
    response.json({
      entitlement: publicEntitlement({
        planId: 'pro',
        billingPlan: 'voucher',
        status: 'active',
        source: 'server-verified',
        validUntil,
        subscriptionId: null,
        cancelAtCycleEnd: false
      })
    });
    await recordBillingActivity(db, request.user.uid, {
      type: 'voucher', status: 'success', title: 'Pro voucher redeemed',
      detail: `Voucher redeemed for ${voucher.durationDays} days.`, planKey: 'voucher'
    });
  } catch (error) {
    if (error.status === 409) {
      response.status(409).json({ error: error.message });
      return;
    }
    console.error('Could not redeem Pro voucher.', error);
    response.status(500).json({ error: 'Could not redeem this voucher. Please try again.' });
  }
});

app.get('/api/admin/dashboard', requireFirebaseUser, requireAdmin, async (request, response) => {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const users = [];
    const seen = new Set();
    if (typeof auth.listUsers === 'function') {
      let pageToken;
      do {
        const page = await auth.listUsers(1000, pageToken);
        for (const record of page.users || []) {
          users.push({ uid: record.uid, email: record.email || '', name: record.displayName || '', photoURL: record.photoURL || '', createdAt: record.metadata?.creationTime || null });
          seen.add(record.uid);
        }
        pageToken = page.pageToken;
      } while (pageToken);
    }
    if (typeof db.collection === 'function' && typeof db.collection('users').get === 'function') {
      const usersSnapshot = await db.collection('users').get();
      for (const document of usersSnapshot.docs || []) {
        const uid = document.id;
        if (!seen.has(uid)) {
          users.push({ uid, email: document.data()?.email || '', name: document.data()?.name || '', createdAt: document.data()?.createdAt || null });
          seen.add(uid);
        }
      }
    }
    let paymentDocuments = [];
    if (typeof db.collection === 'function' && typeof db.collection('billingPayments').get === 'function') {
      const paymentsSnapshot = await db.collection('billingPayments').get();
      paymentDocuments = (paymentsSnapshot.docs || []).map(document => ({ id: document.id, ...(document.data() || {}) }));
    }
    const enriched = await Promise.all(users.map(async user => {
      const snapshot = await db.doc(`users/${user.uid}/billing/entitlement`).get();
      const entitlement = snapshot.exists ? snapshot.data() : null;
      const active = Number(entitlement?.validUntil) > Date.now() && entitlement?.status === 'active';
      const payments = paymentDocuments.filter(payment => payment.uid === user.uid && ['captured', 'authorized', 'success'].includes(String(payment.status)));
      const paidAmount = payments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
      return { ...user, isPro: active || entitlement?.planId === 'pro', plan: active ? entitlement.billingPlan || 'pro' : 'free', activationSource: entitlement?.source || null, validUntil: entitlement?.validUntil || null, paidAmount, paymentCount: payments.length };
    }));
    const proCount = enriched.filter(user => user.isPro).length;
    const voucherSnapshot = typeof db.collection === 'function' && typeof db.collection('adminVouchers').get === 'function'
      ? await db.collection('adminVouchers').get() : { docs: [] };
    const vouchers = (voucherSnapshot.docs || []).map(document => {
      const voucher = { id: document.id, ...(document.data() || {}) };
      if (voucher.createdAt) voucher.expiresAt = Number(voucher.createdAt) + 24 * 60 * 60 * 1000;
      else if (!voucher.expiresAt) voucher.expiresAt = null;
      return voucher;
    });
    const earnings = paymentDocuments.reduce((total, payment) => ['captured', 'authorized', 'success'].includes(String(payment.status)) ? total + (Number(payment.amount) || 0) : total, 0);
    response.json({ users: enriched.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), totals: { users: enriched.length, pro: proCount, regular: enriched.length - proCount, earnings }, vouchers, adminEmail: request.user.email || '' });
  } catch (error) {
    console.error('Admin dashboard failed.', error);
    response.status(500).json({ error: 'Unable to load admin data.' });
  }
});

app.get('/api/admin/users/:uid', requireFirebaseUser, requireAdmin, async (request, response) => {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const uid = request.params.uid;
    let authRecord = null;
    try { authRecord = await auth.getUser(uid); } catch {}
    const [entitlementSnapshot, paymentsSnapshot, activitySnapshot] = await Promise.all([
      db.doc(`users/${uid}/billing/entitlement`).get(),
      typeof db.collection === 'function' ? db.collection('billingPayments').get().catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] }),
      typeof db.collection === 'function' ? db.collection(`users/${uid}/billingActivity`).get().catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] })
    ]);
    const entitlement = entitlementSnapshot.exists ? entitlementSnapshot.data() : null;
    const payments = (paymentsSnapshot.docs || []).map(document => ({ id: document.id, ...(document.data() || {}) })).filter(payment => payment.uid === uid);
    const activity = (activitySnapshot.docs || []).map(document => ({ id: document.id, ...(document.data() || {}) })).sort((a, b) => Number(b.occurredAt || b.createdAt || 0) - Number(a.occurredAt || a.createdAt || 0));
    let voucher = null;
    if (entitlement?.voucherId) {
      const voucherSnapshot = await db.doc(`adminVouchers/${entitlement.voucherId}`).get();
      if (voucherSnapshot.exists) voucher = voucherSnapshot.data();
      if (!voucher && typeof db.collection === 'function') {
        const vouchers = await db.collection('adminVouchers').get();
        voucher = (vouchers.docs || []).map(document => document.data()).find(item => item.code && voucherDocumentId(item.code) === entitlement.voucherId) || null;
      }
    }
    const paidAmount = payments.filter(payment => ['captured', 'authorized', 'success'].includes(String(payment.status))).reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
    response.json({
      uid, email: authRecord?.email || '', name: authRecord?.displayName || '', photoURL: authRecord?.photoURL || '', createdAt: authRecord?.metadata?.creationTime || null,
      entitlement, voucher, payments, activity, paidAmount
    });
  } catch (error) {
    console.error('Admin user detail failed.', error);
    response.status(500).json({ error: 'Unable to load user details.' });
  }
});

app.post('/api/admin/users/:uid/pro', requireFirebaseUser, requireAdmin, async (request, response) => {
  const { uid } = request.params;
  const plan = request.body?.plan === 'yearly' ? 'yearly' : 'monthly';
  const durationDays = plan === 'yearly' ? 365 : 30;
  const amountInRupees = Number(request.body?.amount);
  const amount = Number.isFinite(amountInRupees) && amountInRupees > 0 ? Math.round(amountInRupees * 100) : 0;
  const transactionId = typeof request.body?.transactionId === 'string' ? request.body.transactionId.trim() : '';
  if (amount > 0 && !transactionId) {
    response.status(400).json({ error: 'Enter a transaction ID for a paid Pro activation.' });
    return;
  }
  try {
    const { db } = await getFirebaseAdmin();
    const validUntil = Date.now() + durationDays * 86400000;
    await db.doc(`users/${uid}/billing/entitlement`).set({
      planId: 'pro', billingPlan: plan, status: 'active', source: 'admin', validUntil,
      subscriptionId: null, cancelAtCycleEnd: false, updatedAt: Date.now()
    }, { merge: true });
    const paid = amount > 0;
    const paymentId = paid ? transactionId : `FREE-${randomUUID().slice(0, 8).toUpperCase()}`;
    await db.doc(`billingPayments/${paymentId}`).set({
      uid, providerPaymentId: paymentId, planKey: plan, status: paid ? 'success' : 'free', amount,
      currency: 'INR', source: 'admin', createdAt: Date.now(), grantedBy: request.user.uid
    }, { merge: true });
    await db.doc(`users/${uid}/billingActivity/${randomUUID()}`).set({
      type: 'admin_pro_granted', plan, amount, status: paid ? 'success' : 'free', createdAt: Date.now(), occurredAt: Date.now(),
      transactionId: paymentId, title: paid ? 'Paid Pro access granted by admin' : 'Free Pro access granted by admin',
      detail: paid ? `${paymentId} · ₹${(amount / 100).toLocaleString('en-IN')}` : 'Free activation · no payment collected',
      message: `Pro access granted by administrator for ${plan === 'yearly' ? '1 year' : '1 month'}.`
    });
    response.json({ uid, validUntil, plan, amount, transactionId: paymentId });
  } catch (error) {
    response.status(500).json({ error: 'Unable to grant Pro access.' });
  }
});

app.post('/api/admin/users/:uid/cancel-pro', requireFirebaseUser, requireAdmin, async (request, response) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!reason) {
    response.status(400).json({ error: 'Enter a reason for cancelling Pro access.' });
    return;
  }
  try {
    const { db } = await getFirebaseAdmin();
    const uid = request.params.uid;
    const entitlementRef = db.doc(`users/${uid}/billing/entitlement`);
    const entitlementSnapshot = await entitlementRef.get();
    const entitlement = entitlementSnapshot.data() || {};
    await entitlementRef.set({
      planId: 'free', billingPlan: 'free', status: 'inactive', source: 'admin', validUntil: null,
      subscriptionId: null, cancelAtCycleEnd: false, updatedAt: Date.now()
    }, { merge: true });
    const cancelledAt = Date.now();
    await db.doc(`users/${uid}/billingActivity/${randomUUID()}`).set({
      type: 'pro_cancelled', status: 'cancelled', title: 'Pro access cancelled by admin',
      detail: reason, reason, planKey: entitlement.billingPlan || 'pro',
      previousPlan: entitlement.billingPlan || 'pro', previousSource: entitlement.source || null,
      previousValidUntil: entitlement.validUntil || null, actorType: 'admin', actorUid: request.user.uid,
      cancelledBy: request.user.uid, cancelledByEmail: request.user.email || null,
      createdAt: cancelledAt, occurredAt: cancelledAt
    });
    response.json({ uid, isPro: false, reason, cancelledAt });
  } catch (error) {
    response.status(500).json({ error: 'Unable to cancel Pro access.' });
  }
});

app.post('/api/admin/vouchers', requireFirebaseUser, requireAdmin, async (request, response) => {
  const plan = request.body?.plan === 'yearly' ? 'yearly' : 'monthly';
  const assignedUid = typeof request.body?.uid === 'string' ? request.body.uid.trim() : '';
  const durationDays = plan === 'yearly' ? 365 : 30;
  const code = `${plan === 'yearly' ? 'YEAR' : 'MONTH'}-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  try {
    const { db } = await getFirebaseAdmin();
    const id = voucherDocumentId(code);
    const createdAt = Date.now();
    await db.doc(`adminVouchers/${id}`).set({ code, plan, durationDays, maxRedemptions: 1, assignedUid, redeemedCount: 0, createdAt, expiresAt: createdAt + 24 * 60 * 60 * 1000, createdBy: request.user.uid });
    response.status(201).json({ id, code, plan, durationDays, assignedUid });
  } catch (error) {
    response.status(500).json({ error: 'Unable to generate voucher.' });
  }
});

app.delete('/api/admin/vouchers/:id', requireFirebaseUser, requireAdmin, async (request, response) => {
  try {
    const { db } = await getFirebaseAdmin();
    const ref = db.doc(`adminVouchers/${request.params.id}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      response.status(404).json({ error: 'Voucher not found.' });
      return;
    }
    const voucher = snapshot.data();
    if (Number(voucher.redeemedCount) > 0) {
      response.status(409).json({ error: 'Completed vouchers cannot be deleted.' });
      return;
    }
    if (Date.now() - Number(voucher.createdAt || 0) < 2 * 60 * 60 * 1000) {
      response.status(409).json({ error: 'A voucher can be deleted only after 2 hours.' });
      return;
    }
    await db.runTransaction(async transaction => {
      transaction.delete(ref);
    });
    response.json({ deleted: true });
  } catch (error) {
    console.error('Admin voucher deletion failed.', error);
    response.status(500).json({ error: 'Unable to delete voucher.' });
  }
});

app.post('/api/billing/subscriptions', requireBillingConfig, requireFirebaseUser, async (request, response) => {
  const planKey = request.body?.planKey;
  const plan = Object.hasOwn(BILLING_PLANS, planKey) ? BILLING_PLANS[planKey] : null;
  if (!plan) {
    response.status(400).json({ error: 'Choose a valid monthly or yearly plan.' });
    return;
  }

  try {
    const { db } = await getFirebaseAdmin();
    const providerPlan = await verifiedProviderPlan(planKey);
    const checkoutRef = userCheckoutDocument(db, request.user.uid);
    const requestId = randomUUID();
    const checkout = await db.runTransaction(async transaction => {
      const [entitlementSnapshot, checkoutSnapshot] = await Promise.all([
        transaction.get(userEntitlementDocument(db, request.user.uid)),
        transaction.get(checkoutRef)
      ]);
      if (publicEntitlement(entitlementSnapshot.data()).status === 'active') {
        const error = new Error('This account already has active Pro access.');
        error.status = 409;
        throw error;
      }
      if (checkoutSnapshot.exists) {
        const current = checkoutSnapshot.data();
        const subscriptionEnded = current.status === 'expired'
          || current.status === 'completed'
          || (current.status === 'cancelled' && !Number(current.currentEnd))
          || (Number(current.currentEnd) > 0 && Number(current.currentEnd) <= Date.now());
        if (subscriptionEnded) {
          transaction.set(checkoutRef, {
            requestId,
            planKey,
            status: 'creating',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            subscriptionId: null,
            currentEnd: 0
          });
          return { requestId, reused: false };
        }
        if (current.planKey === planKey && current.subscriptionId) {
          return { subscriptionId: current.subscriptionId, reused: true };
        }
        if (current.status === 'creating' && Date.now() - Number(current.createdAt) > 5 * 60 * 1000) {
          transaction.set(checkoutRef, {
            requestId,
            planKey,
            status: 'creating',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            subscriptionId: null
          });
          return { requestId, reused: false };
        }
        const error = new Error('This account already has a pending subscription checkout. Finish or wait for it to expire before choosing another plan.');
        error.status = 409;
        throw error;
      }
      transaction.create(checkoutRef, {
        requestId,
        planKey,
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      return { requestId, reused: false };
    });
    if (checkout.reused) {
      response.json({
        subscriptionId: checkout.subscriptionId,
        keyId: process.env.RAZORPAY_KEY_ID,
        plan: { id: plan.id, label: plan.label, amount: plan.amount, currency: plan.currency },
        reused: true
      });
      return;
    }

    const created = await razorpayRequest('/subscriptions', {
      method: 'POST',
      body: {
        plan_id: providerPlan.id,
        total_count: plan.totalCount,
        quantity: 1,
        customer_notify: 1
      }
    });
    await db.runTransaction(async transaction => {
      transaction.create(subscriptionDocument(db, created.id), {
        uid: request.user.uid,
        planKey,
        planId: providerPlan.id,
        status: created.status || 'created',
        currentEnd: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      transaction.set(checkoutRef, {
        subscriptionId: created.id,
        status: created.status || 'created',
        updatedAt: Date.now()
      }, { merge: true });
    });
    await recordBillingActivity(db, request.user.uid, {
      type: 'subscription', status: 'pending', title: `${plan.label} checkout started`,
      detail: 'Razorpay subscription checkout was created.', planKey,
      providerSubscriptionId: created.id,
      amount: plan.amount
    });
    response.status(201).json({
      subscriptionId: created.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan: { id: plan.id, label: plan.label, amount: plan.amount, currency: plan.currency }
    });
  } catch (error) {
    console.error('Could not create Razorpay subscription.', error);
    response.status(error.status === 409 ? 409 : error.status === 400 ? 400 : 502).json({
      error: error.status === 409
        ? error.message
        : error.status === 400
          ? 'The configured payment plan could not be accepted.'
          : 'Could not start checkout. Please retry or contact support.'
    });
  }
});

app.post('/api/billing/verify', requireBillingConfig, requireFirebaseUser, async (request, response) => {
  const { razorpayPaymentId, razorpaySubscriptionId, razorpaySignature } = request.body || {};
  if (typeof razorpayPaymentId !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId)
    || typeof razorpaySubscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(razorpaySubscriptionId)
    || typeof razorpaySignature !== 'string' || !/^[a-f0-9]{64}$/i.test(razorpaySignature)) {
    response.status(400).json({ error: 'Payment verification details are incomplete.' });
    return;
  }

  try {
    const { db } = await getFirebaseAdmin();
    const mappingRef = subscriptionDocument(db, razorpaySubscriptionId);
    const mappingSnapshot = await mappingRef.get();
    if (!mappingSnapshot.exists || mappingSnapshot.data().uid !== request.user.uid) {
      response.status(403).json({ error: 'This payment does not belong to the signed-in account.' });
      return;
    }

    const message = `${razorpaySubscriptionId}|${razorpayPaymentId}`;
    if (!validRazorpaySignature(message, razorpaySignature, process.env.RAZORPAY_KEY_SECRET)) {
      response.status(400).json({ error: 'Payment signature verification failed.' });
      return;
    }

    const [subscription, payment] = await Promise.all([
      razorpayRequest(`/subscriptions/${encodeURIComponent(razorpaySubscriptionId)}`),
      razorpayRequest(`/payments/${encodeURIComponent(razorpayPaymentId)}`)
    ]);
    const mapping = mappingSnapshot.data();
    if (subscription.plan_id !== mapping.planId
      || payment.subscription_id !== razorpaySubscriptionId
      || !['captured', 'authorized'].includes(payment.status)) {
      response.status(400).json({ error: 'The payment is not verified as belonging to this plan.' });
      return;
    }

    const entitlement = entitlementFromSubscription(subscription, mapping.planKey);
    if (subscription.status === 'active' && payment.status === 'captured' && entitlement?.status === 'active') {
      await db.runTransaction(async transaction => {
        transaction.set(mappingRef, {
          status: subscription.status,
          currentEnd: entitlement.validUntil,
          updatedAt: Date.now()
        }, { merge: true });
        transaction.set(userCheckoutDocument(db, request.user.uid), {
          subscriptionId: razorpaySubscriptionId,
          status: subscription.status,
          currentEnd: entitlement.validUntil,
          updatedAt: Date.now()
        }, { merge: true });
        transaction.set(userEntitlementDocument(db, request.user.uid), {
          ...entitlement,
          subscriptionId: razorpaySubscriptionId,
          cancelAtCycleEnd: false
        });
      });
      await db.doc(`billingPayments/${razorpayPaymentId}`).set({
        uid: request.user.uid, providerPaymentId: razorpayPaymentId, subscriptionId: razorpaySubscriptionId,
        planKey: mapping.planKey, status: 'captured', amount: BILLING_PLANS[mapping.planKey]?.amount || 0,
        currency: BILLING_PLANS[mapping.planKey]?.currency || 'INR', createdAt: Date.now()
      }, { merge: true });
      await recordBillingActivity(db, request.user.uid, {
        type: 'payment', status: 'success', title: 'Subscription payment verified',
        detail: `${mapping.planKey === 'yearly' ? 'Yearly' : 'Monthly'} Pro access is active.`,
        planKey: mapping.planKey, providerSubscriptionId: razorpaySubscriptionId,
        amount: BILLING_PLANS[mapping.planKey]?.amount || null
      });
      response.json({ verified: true, entitlement });
      return;
    }
    response.json({
      verified: true,
      pending: true,
      message: 'Payment was verified. Pro access will become available after Razorpay confirms subscription activation.'
    });
  } catch (error) {
    console.error('Could not verify Razorpay checkout.', error);
    response.status(502).json({ error: 'Could not verify payment status. Your payment will be reconciled by the Razorpay webhook.' });
  }
});

app.post('/api/billing/change-plan', requireBillingConfig, requireFirebaseUser, async (request, response) => {
  if (request.body?.planKey !== 'yearly') {
    response.status(400).json({ error: 'Choose the yearly plan to schedule a plan switch.' });
    return;
  }

  try {
    const { db } = await getFirebaseAdmin();
    const entitlementRef = userEntitlementDocument(db, request.user.uid);
    const entitlementSnapshot = await entitlementRef.get();
    const entitlement = publicEntitlement(entitlementSnapshot.data());
    if (entitlement.status !== 'active' || entitlement.billingPlan !== 'monthly' || !entitlement.subscriptionId) {
      response.status(409).json({ error: 'Only an active monthly subscriber can schedule a switch to yearly.' });
      return;
    }
    if (entitlement.cancelAtCycleEnd) {
      response.status(409).json({ error: 'This monthly subscription is already scheduled to end. It cannot be switched to yearly.' });
      return;
    }
    if (entitlement.scheduledPlan) {
      response.status(409).json({ error: 'A plan change is already scheduled for this subscription.' });
      return;
    }

    const subscriptionId = entitlement.subscriptionId;
    const mappingRef = subscriptionDocument(db, subscriptionId);
    const mappingSnapshot = await mappingRef.get();
    const mapping = mappingSnapshot.data() || {};
    if (!mappingSnapshot.exists || mapping.uid !== request.user.uid || mapping.planKey !== 'monthly') {
      response.status(403).json({ error: 'This subscription could not be matched to the signed-in account.' });
      return;
    }

    const [subscription, yearlyPlan] = await Promise.all([
      razorpayRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`),
      verifiedProviderPlan('yearly')
    ]);
    const currentEnd = Number(subscription.current_end) * 1000;
    if (subscription.status !== 'active' || subscription.plan_id !== mapping.planId
      || !Number.isFinite(currentEnd) || currentEnd <= Date.now()) {
      response.status(409).json({ error: 'Razorpay does not show an active monthly billing period for this subscription.' });
      return;
    }
    if (['upi', 'emandate'].includes(String(subscription.payment_method || '').toLowerCase())) {
      response.status(409).json({ error: 'Razorpay does not support plan changes for this payment method. You can choose yearly after the monthly plan ends.' });
      return;
    }
    if (subscription.has_scheduled_changes) {
      response.status(409).json({ error: 'This subscription already has a change scheduled in Razorpay.' });
      return;
    }

    const requestId = randomUUID();
    await db.runTransaction(async transaction => {
      const [currentMapping, currentEntitlement] = await Promise.all([
        transaction.get(mappingRef),
        transaction.get(entitlementRef)
      ]);
      const currentMap = currentMapping.data() || {};
      const currentPlan = publicEntitlement(currentEntitlement.data());
      if (!currentMapping.exists || currentMap.uid !== request.user.uid
        || currentMap.planKey !== 'monthly' || currentPlan.subscriptionId !== subscriptionId
        || currentPlan.status !== 'active' || currentPlan.scheduledPlan || currentPlan.cancelAtCycleEnd) {
        const error = new Error('The subscription changed while the plan switch was being scheduled. Refresh and check its status.');
        error.status = 409;
        throw error;
      }
      transaction.set(mappingRef, {
        pendingPlanKey: 'yearly',
        pendingPlanId: yearlyPlan.id,
        pendingPlanStatus: 'scheduling',
        planChangeRequestId: requestId,
        scheduledAt: currentEnd,
        updatedAt: Date.now()
      }, { merge: true });
      transaction.set(entitlementRef, {
        scheduledPlan: 'yearly',
        scheduledAt: currentEnd,
        planChangeStatus: 'scheduling'
      }, { merge: true });
      transaction.set(userCheckoutDocument(db, request.user.uid), {
        subscriptionId,
        planKey: 'monthly',
        scheduledPlan: 'yearly',
        scheduledAt: currentEnd,
        planChangeStatus: 'scheduling',
        updatedAt: Date.now()
      }, { merge: true });
    });

    let razorpayScheduled = false;
    try {
      const updated = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: 'PATCH',
        body: {
          plan_id: yearlyPlan.id,
          remaining_count: BILLING_PLANS.yearly.totalCount,
          schedule_change_at: 'cycle_end',
          customer_notify: 1
        }
      });
      if (updated.has_scheduled_changes !== true) {
        throw new Error('Razorpay did not confirm the scheduled plan change.');
      }
      razorpayScheduled = true;
      await db.runTransaction(async transaction => {
        const [currentMapping, currentEntitlement] = await Promise.all([
          transaction.get(mappingRef),
          transaction.get(entitlementRef)
        ]);
        if (currentMapping.data()?.planChangeRequestId !== requestId) return;
        transaction.set(mappingRef, { pendingPlanStatus: 'scheduled', updatedAt: Date.now() }, { merge: true });
        transaction.set(entitlementRef, { planChangeStatus: 'scheduled' }, { merge: true });
        transaction.set(userCheckoutDocument(db, request.user.uid), { planChangeStatus: 'scheduled', updatedAt: Date.now() }, { merge: true });
      });
    } catch (error) {
      if (!razorpayScheduled) {
        await db.runTransaction(async transaction => {
          const [currentMapping, currentEntitlement] = await Promise.all([
            transaction.get(mappingRef),
            transaction.get(entitlementRef)
          ]);
          if (currentMapping.data()?.planChangeRequestId !== requestId) return;
          transaction.set(mappingRef, {
            pendingPlanKey: null,
            pendingPlanId: null,
            pendingPlanStatus: null,
            planChangeRequestId: null,
            scheduledAt: null,
            updatedAt: Date.now()
          }, { merge: true });
          transaction.set(entitlementRef, { scheduledPlan: null, scheduledAt: null, planChangeStatus: null }, { merge: true });
          transaction.set(userCheckoutDocument(db, request.user.uid), {
            scheduledPlan: null,
            scheduledAt: null,
            planChangeStatus: null,
            updatedAt: Date.now()
          }, { merge: true });
        });
      }
      throw error;
    }
    await recordBillingActivity(db, request.user.uid, {
      type: 'subscription', status: 'success', title: 'Yearly plan switch scheduled',
      detail: 'Your subscription will move to yearly billing at the end of the current monthly period.',
      planKey: 'yearly', providerSubscriptionId: subscriptionId
    });
    response.json({ scheduled: true, scheduledPlan: 'yearly', scheduledAt: currentEnd });
  } catch (error) {
    console.error('Could not schedule the yearly plan change.', error);
    response.status(error.status === 409 ? 409 : error.status === 400 ? 400 : 502).json({
      error: error.status === 409
        ? error.message
        : error.status === 400
          ? 'Razorpay could not schedule this plan change. The monthly subscription has not been replaced.'
          : 'Could not schedule the yearly plan. Refresh and check the subscription status before retrying.'
    });
  }
});

app.post('/api/billing/cancel', requireBillingConfig, requireFirebaseUser, async (request, response) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  let subscriptionId = typeof request.body?.subscriptionId === 'string' ? request.body.subscriptionId.trim() : '';

  try {
    const { db } = await getFirebaseAdmin();
    if (!subscriptionId) {
      const checkoutSnapshot = await userCheckoutDocument(db, request.user.uid).get();
      subscriptionId = typeof checkoutSnapshot.data()?.subscriptionId === 'string'
        ? checkoutSnapshot.data().subscriptionId.trim()
        : '';
    }
    if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
      response.status(400).json({ error: 'A valid subscription ID is required.' });
      return;
    }
    const ref = subscriptionDocument(db, subscriptionId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().uid !== request.user.uid) {
      response.status(404).json({ error: 'No subscription was found for this account.' });
      return;
    }
    if (snapshot.data().pendingPlanStatus === 'scheduling') {
      response.status(409).json({ error: 'A plan switch is being scheduled. Wait a moment and try again.' });
      return;
    }
    const result = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: 'POST',
      body: { cancel_at_cycle_end: true }
    });
    await db.runTransaction(async transaction => {
      const entitlementRef = userEntitlementDocument(db, request.user.uid);
      const currentEntitlement = await transaction.get(entitlementRef);
      const currentValidUntil = Number(currentEntitlement.data()?.validUntil)
        || Number(snapshot.data().currentEnd)
        || 0;
      transaction.set(ref, {
        status: result.status || 'cancelled',
        cancelAtCycleEnd: true,
        pendingPlanKey: null,
        pendingPlanId: null,
        scheduledAt: null,
        updatedAt: Date.now()
      }, { merge: true });
      transaction.set(entitlementRef, {
        planId: 'pro',
        billingPlan: snapshot.data().planKey,
        status: 'active',
        source: 'server-verified',
        validUntil: currentValidUntil,
        subscriptionId,
        cancelAtCycleEnd: true,
        scheduledPlan: null,
        scheduledAt: null,
        planChangeStatus: null
      }, { merge: true });
      transaction.set(userCheckoutDocument(db, request.user.uid), {
        subscriptionId,
        status: result.status || 'active',
        currentEnd: currentValidUntil,
        cancelAtCycleEnd: true,
        scheduledPlan: null,
        scheduledAt: null,
        planChangeStatus: null,
        updatedAt: Date.now()
      }, { merge: true });
    });
    const cancellationDetail = reason
      ? `Future renewals have been stopped. ${reason}`
      : 'Future renewals have been stopped. Access remains available through the paid period.';
    await recordBillingActivity(db, request.user.uid, {
      type: 'subscription', status: 'cancelled', title: 'Subscription cancelled by user',
      detail: cancellationDetail,
      reason,
      planKey: snapshot.data().planKey, providerSubscriptionId: subscriptionId,
      actorType: 'user', actorUid: request.user.uid
    });
    response.json({ cancelled: true, status: result.status || 'cancelled' });
  } catch (error) {
    console.error('Could not cancel Razorpay subscription.', error);
    response.status(502).json({ error: 'Could not schedule cancellation. Please retry or contact support.' });
  }
});

app.get('/', (_request, response) => {
  response.sendFile(path.join(distDir, 'editor.html'));
});

app.use(express.static(distDir));
app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

export { app };

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`PersonaCraftPro backend listening on port ${port}`);
  });
}
