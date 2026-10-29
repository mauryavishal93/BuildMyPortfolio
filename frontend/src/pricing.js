import {
  createBillingSubscription,
  loadBillingConfig,
  loadBillingEntitlement,
  verifyBillingCheckout
} from './billing-client.js';
import { cloudConfigured, observeAuth, signInWithGoogle } from './firebase-cloud.js';
import { PLAN_CONFIG, PRICING_FEATURES } from './plan-access.js';

const $ = selector => document.querySelector(selector);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const checkoutStatus = $('#checkoutStatus');
const monthlyButton = $('#purchaseMonthly');
const yearlyButton = $('#purchaseYearly');
const supportDialog = $('#supportDialog');
let currentUser = null;
let billingConfig = null;
let entitlement = null;

$('#supportLink')?.addEventListener('click', event => {
  event.preventDefault();
  if (typeof supportDialog?.showModal === 'function') supportDialog.showModal();
  else window.location.href = 'mailto:buildymyportfolio@gmail.com';
});
$('#closeSupportDialog')?.addEventListener('click', () => supportDialog?.close());
supportDialog?.addEventListener('click', event => {
  if (event.target === supportDialog) supportDialog.close();
});

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
  const activePlan = active ? entitlement.billingPlan : null;
  const canPurchase = Boolean(currentUser && billingConfig?.checkoutEnabled && !active);
  monthlyButton.disabled = !(canPurchase || active);
  yearlyButton.disabled = !(canPurchase || active);

  monthlyButton.textContent = !currentUser
    ? 'Sign in to purchase monthly'
    : !active
      ? billingConfig?.checkoutEnabled ? 'Start monthly subscription' : 'Checkout unavailable'
      : 'Manage billing';
  yearlyButton.textContent = !currentUser
    ? 'Sign in to purchase yearly'
    : !active
      ? billingConfig?.checkoutEnabled ? 'Start yearly subscription' : 'Checkout unavailable'
      : 'Manage billing';

  const monthlyBadge = $('#monthlyPlanBadge');
  const yearlyBadge = $('#yearlyPlanBadge');
  monthlyBadge.textContent = 'Active';
  monthlyBadge.hidden = activePlan !== 'monthly';
  yearlyBadge.textContent = 'Active';
  yearlyBadge.classList.remove('scheduled');
  yearlyBadge.hidden = activePlan !== 'yearly';

}

async function refreshPricingState(user) {
  currentUser = user;
  entitlement = null;
  updatePurchaseControls();
  if (!user) {
    checkoutStatus.textContent = 'Sign in with Google before starting a purchase.';
    return;
  }
  try {
    if (!billingConfig) billingConfig = await loadBillingConfig();
    if (billingConfig.entitlementEnabled) entitlement = await loadBillingEntitlement(user);
    if (currentUser?.uid !== user.uid) return;
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
      name: 'PersonaCraftPro',
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

monthlyButton.addEventListener('click', () => entitlement?.status === 'active'
  ? window.location.assign('/billing.html')
  : startCheckout('monthly'));
yearlyButton.addEventListener('click', () => entitlement?.status === 'active'
  ? window.location.assign('/billing.html')
  : startCheckout('yearly'));

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
  void refreshPricingState(null);
  checkoutStatus.textContent = 'Google sign-in is not configured on this site. Purchases are unavailable.';
} else {
  observeAuth((user, error) => {
    if (error) {
      console.error('Could not observe Firebase sign-in state.', error);
      currentUser = null;
      entitlement = null;
      checkoutStatus.textContent = 'Sign-in could not be initialized. Paid purchases are unavailable.';
      updatePurchaseControls();
      return;
    }
    refreshPricingState(user);
  });
}
