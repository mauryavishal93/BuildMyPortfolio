import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BILLING_PLANS,
  billingConfigured,
  entitlementFromSubscription,
  planKeyForRazorpayPlanId,
  planMatchesRazorpay,
  validRazorpaySignature,
  validWebhookSignature
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

function requireBillingConfig(_request, response, next) {
  if (!billingConfigured()) {
    response.status(503).json({ error: 'Paid plans are not configured on this server yet.' });
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
  return {
    planId: data?.planId || 'free',
    billingPlan: data?.billingPlan || null,
    status: validUntil > Date.now() ? 'active' : 'inactive',
    source: 'server-verified',
    validUntil,
    subscriptionId: data?.subscriptionId || null,
    cancelAtCycleEnd: data?.cancelAtCycleEnd === true,
    scheduledPlan: Object.hasOwn(BILLING_PLANS, data?.scheduledPlan) ? data.scheduledPlan : null,
    scheduledAt: Number(data?.scheduledAt) || null,
    planChangeStatus: data?.planChangeStatus || null
  };
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/api/billing', (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/billing/config', (_request, response) => {
  response.json({
    checkoutEnabled: billingConfigured(),
    keyId: billingConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    plans: Object.fromEntries(Object.entries(BILLING_PLANS).map(([key, plan]) => [
      key,
      { id: plan.id, label: plan.label, amount: plan.amount, currency: plan.currency, period: plan.period }
    ]))
  });
});

app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (request, response) => {
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

app.use(express.json({ limit: '32kb' }));

app.get('/api/billing/entitlement', requireBillingConfig, requireFirebaseUser, async (request, response) => {
  try {
    const { db } = await getFirebaseAdmin();
    const snapshot = await userEntitlementDocument(db, request.user.uid).get();
    response.json({ entitlement: publicEntitlement(snapshot.data()) });
  } catch (error) {
    console.error('Could not load billing entitlement.', error);
    response.status(500).json({ error: 'Could not load your plan status.' });
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
  const subscriptionId = request.body?.subscriptionId;
  if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    response.status(400).json({ error: 'A valid subscription ID is required.' });
    return;
  }

  try {
    const { db } = await getFirebaseAdmin();
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
    console.log(`BuildMyPortfolio backend listening on port ${port}`);
  });
}
