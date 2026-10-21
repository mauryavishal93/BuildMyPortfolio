import {
  cancelBillingSubscription,
  createBillingSubscription,
  loadBillingConfig,
  loadBillingEntitlement,
  verifyBillingCheckout
} from './billing-client.js';
import { cloudConfigured, observeAuth } from './firebase-cloud.js';
import { PLAN_CONFIG, PRICING_FEATURES } from './plan-access.js';

const $ = selector => document.querySelector(selector);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const accountStatus = $('#billingAccountStatus');
const checkoutStatus = $('#checkoutStatus');
const monthlyButton = $('#purchaseMonthly');
const yearlyButton = $('#purchaseYearly');
let currentUser = null;
let billingConfig = null;
let entitlement = null;

const formatPrice = amount => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: PLAN_CONFIG.pro.currency,
  maximumFractionDigits: 0
}).format(amount);

$('#freePrice').innerHTML = `${formatPrice(PLAN_CONFIG.free.price)} <span>always free</span>`;
$('#monthlyPrice').innerHTML = `${formatPrice(PLAN_CONFIG.pro.monthly.price)} <span>per month, recurring</span>`;
$('#yearlyPrice').innerHTML = `${formatPrice(PLAN_CONFIG.pro.yearly.price)} <span>per year, recurring</span>`;

const tableBody = $('#pricingFeatures');
for (const feature of PRICING_FEATURES) {
  const row = document.createElement('tr');
  for (const value of [feature.label, feature.free, feature.pro]) {
    const cell = document.createElement(row.children.length ? 'td' : 'th');
    if (cell.tagName === 'TH') cell.scope = 'row';
    cell.textContent = value;
    row.append(cell);
  }
  tableBody.append(row);
}

function updatePurchaseControls() {
  const active = entitlement?.status === 'active';
  const canPurchase = Boolean(currentUser && billingConfig?.checkoutEnabled && !active);
  monthlyButton.disabled = !canPurchase;
  yearlyButton.disabled = !canPurchase;
  const buttonText = interval => !currentUser
    ? `Sign in to purchase ${interval}`
    : active
      ? 'Pro is active'
      : billingConfig?.checkoutEnabled
        ? `Start ${interval} subscription`
        : 'Checkout unavailable';
  monthlyButton.textContent = buttonText('monthly');
  yearlyButton.textContent = buttonText('yearly');

  let cancel = $('#billingCancel');
  if (!cancel) {
    cancel = document.createElement('button');
    cancel.id = 'billingCancel';
    cancel.className = 'btn outline';
    cancel.type = 'button';
    cancel.textContent = 'Cancel subscription';
    cancel.hidden = true;
    $('#billingAccountStatus').after(cancel);
    cancel.addEventListener('click', cancelCurrentSubscription);
  }
  cancel.hidden = !active || !entitlement?.subscriptionId || Boolean(entitlement?.cancelAtCycleEnd);
}

async function refreshBillingState(user) {
  currentUser = user;
  entitlement = null;
  updatePurchaseControls();

  if (!user) {
    accountStatus.textContent = 'Sign in with Google before you can purchase or manage a subscription.';
    return;
  }

  accountStatus.textContent = `Signed in as ${user.email || user.displayName || 'Google user'}. Purchases are attached to this account.`;
  try {
    if (!billingConfig) billingConfig = await loadBillingConfig();
    if (billingConfig.checkoutEnabled) entitlement = await loadBillingEntitlement(user);
    if (currentUser?.uid !== user.uid) return;

    if (entitlement?.status === 'active') {
      const date = entitlement.validUntil ? new Date(entitlement.validUntil).toLocaleDateString() : 'the current paid period';
      accountStatus.textContent = `Pro ${entitlement.billingPlan || ''} is active through ${date}.${entitlement.cancelAtCycleEnd ? ' It will not renew.' : ''}`;
    }
    updatePurchaseControls();
  } catch (error) {
    console.error('Could not load billing status.', error);
    checkoutStatus.textContent = error.message;
    updatePurchaseControls();
  }
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded. Check your connection and retry.'));
    document.head.append(script);
  });
}

async function startCheckout(planKey) {
  if (!currentUser) {
    checkoutStatus.textContent = 'Sign in with Google before starting a purchase.';
    return;
  }
  if (!billingConfig?.checkoutEnabled) {
    checkoutStatus.textContent = 'Checkout is not enabled on this server yet.';
    return;
  }

  monthlyButton.disabled = true;
  yearlyButton.disabled = true;
  checkoutStatus.textContent = 'Preparing secure Razorpay checkout…';
  try {
    const checkoutUser = currentUser;
    await loadRazorpayCheckout();
    const created = await createBillingSubscription(checkoutUser, planKey);
    const checkout = new window.Razorpay({
      key: created.keyId,
      subscription_id: created.subscriptionId,
      name: 'BuildMyPortfolio',
      description: `${created.plan.label} subscription`,
      prefill: {
        name: checkoutUser.displayName || '',
        email: checkoutUser.email || ''
      },
      theme: { color: '#5146e5' },
      handler: async checkoutResponse => {
        checkoutStatus.textContent = 'Verifying your payment with Razorpay…';
        try {
          const result = await verifyBillingCheckout(checkoutUser, checkoutResponse);
          if (result.entitlement?.status === 'active') {
            checkoutStatus.textContent = 'Payment verified. Pro access is active on your signed-in account.';
          } else {
            checkoutStatus.textContent = result.message || 'Payment verified. Waiting for Razorpay to activate the subscription.';
            for (let attempt = 0; attempt < 5; attempt += 1) {
              await delay(2000);
              const updatedEntitlement = await loadBillingEntitlement(checkoutUser);
              if (updatedEntitlement?.status === 'active') {
                checkoutStatus.textContent = 'Payment verified. Pro access is active on your signed-in account.';
                break;
              }
            }
          }
          await refreshBillingState(checkoutUser);
        } catch (error) {
          console.error('Payment verification request failed.', error);
          checkoutStatus.textContent = `${error.message} If your payment completed, it will be reconciled through Razorpay.`;
        }
      },
      modal: {
        ondismiss: () => {
          checkoutStatus.textContent = 'Checkout closed. No purchase was confirmed by this page.';
          updatePurchaseControls();
        }
      }
    });
    checkout.on('payment.failed', event => {
      console.error('Razorpay reported a failed payment.', event.error);
      checkoutStatus.textContent = 'Razorpay could not complete this payment. No Pro access was activated.';
    });
    checkout.open();
    checkoutStatus.textContent = 'Complete the payment in the Razorpay checkout window.';
  } catch (error) {
    console.error('Could not start Razorpay checkout.', error);
    checkoutStatus.textContent = error.message;
    updatePurchaseControls();
  }
}

async function cancelCurrentSubscription() {
  if (!currentUser || !entitlement?.subscriptionId) return;
  if (!window.confirm('Cancel future renewals? Pro remains active until the current paid period ends.')) return;
  try {
    await cancelBillingSubscription(currentUser, entitlement.subscriptionId);
    checkoutStatus.textContent = 'Cancellation scheduled. Pro remains active through the current paid period.';
    await refreshBillingState(currentUser);
  } catch (error) {
    console.error('Could not cancel subscription.', error);
    checkoutStatus.textContent = error.message;
  }
}

monthlyButton.addEventListener('click', () => startCheckout('monthly'));
yearlyButton.addEventListener('click', () => startCheckout('yearly'));

loadBillingConfig().then(config => {
  billingConfig = config;
  if (!config.checkoutEnabled) {
    checkoutStatus.textContent = 'Pro checkout is temporarily unavailable. Please try again later.';
  }
  updatePurchaseControls();
}).catch(error => {
  console.error('Could not load checkout configuration.', error);
  checkoutStatus.textContent = error.message;
});

if (!cloudConfigured) {
  refreshBillingState(null);
  accountStatus.textContent = 'Google sign-in is not configured on this site. Purchases are unavailable.';
} else {
  observeAuth((user, error) => {
    if (error) {
      console.error('Could not observe Firebase sign-in state.', error);
      currentUser = null;
      entitlement = null;
      accountStatus.textContent = 'Sign-in could not be initialized. Paid purchases are unavailable.';
      updatePurchaseControls();
      return;
    }
    refreshBillingState(user);
  });
}
