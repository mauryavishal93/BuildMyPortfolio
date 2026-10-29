import { getFirebaseIdToken } from './firebase-cloud.js';

async function billingRequest(path, user, options = {}) {
  const token = await getFirebaseIdToken(user);
  const response = await fetch(`/api/billing/${path}`, {
    method: options.method || 'GET',
    cache: 'no-store',
    headers: {
      authorization: 'Bearer ' + token,
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The billing service could not complete this request.');
  return result;
}

export async function loadBillingConfig() {
  const response = await fetch('/api/billing/config', { cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const availability = response.ok
      ? 'returned an unexpected non-JSON response'
      : `is unavailable (HTTP ${response.status})`;
    throw new Error(`The billing service ${availability}. Check that the backend is running and /api is routed to it.`);
  }

  const config = await response.json();
  if (!response.ok) throw new Error(config.error || 'Could not load paid plan configuration.');
  return config;
}

export async function loadBillingActivity(user) {
  const result = await billingRequest('activity', user);
  return result.activity;
}

export async function loadBillingEntitlement(user) {
  const result = await billingRequest('entitlement', user);
  return result.entitlement;
}

export async function redeemBillingVoucher(user, code) {
  const result = await billingRequest('vouchers/redeem', user, {
    method: 'POST',
    body: { code }
  });
  return result.entitlement;
}

export async function createBillingSubscription(user, planKey) {
  return billingRequest('subscriptions', user, {
    method: 'POST',
    body: { planKey }
  });
}

export async function scheduleBillingPlanChange(user, planKey) {
  return billingRequest('change-plan', user, {
    method: 'POST',
    body: { planKey }
  });
}

export async function verifyBillingCheckout(user, checkoutResponse) {
  return billingRequest('verify', user, {
    method: 'POST',
    body: {
      razorpayPaymentId: checkoutResponse.razorpay_payment_id,
      razorpaySubscriptionId: checkoutResponse.razorpay_subscription_id,
      razorpaySignature: checkoutResponse.razorpay_signature
    }
  });
}

export async function cancelBillingSubscription(user, subscriptionId, reason = '') {
  return billingRequest('cancel', user, {
    method: 'POST',
    body: {
      subscriptionId,
      ...(reason ? { reason } : {})
    }
  });
}
