import {
  createBillingSubscription,
  loadBillingConfig,
  loadBillingEntitlement,
  redeemBillingVoucher,
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
const voucherSection = $('#pricingVoucherSection');
const voucherInput = $('#pricingVoucherCode');
const voucherButton = $('#redeemPricingVoucher');
const voucherStatus = $('#pricingVoucherStatus');
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

function getConfiguredPrice(planKey, fallback) {
  const value = Number(window.__pricingConfig?.[planKey]?.currentPrice ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getConfiguredActualPrice(planKey, fallback) {
  const value = Number(window.__pricingConfig?.[planKey]?.actualPrice ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function renderStoredPricing() {
  const monthlyActual = getConfiguredActualPrice('monthly', PLAN_CONFIG.pro.monthly.price);
  const monthlyCurrent = getConfiguredPrice('monthly', PLAN_CONFIG.pro.monthly.price);
  const yearlyActual = getConfiguredActualPrice('yearly', PLAN_CONFIG.pro.yearly.price);
  const yearlyCurrent = getConfiguredPrice('yearly', PLAN_CONFIG.pro.yearly.price);

  const renderPlanPrice = (node, currentPrice, actualPrice, suffixLabel) => {
    const discount = actualPrice > currentPrice ? Math.round(((actualPrice - currentPrice) / actualPrice) * 100) : 0;
    const actualMarkup = actualPrice > currentPrice
      ? `<span class="price-original">${formatPrice(actualPrice)}</span>`
      : '';
    const discountMarkup = discount > 0
      ? `<span class="price-discount">Save ${discount}%</span>`
      : '';
    node.innerHTML = `${actualMarkup}${formatPrice(currentPrice)} <span>${suffixLabel}${discountMarkup}</span>`;
  };

  renderPlanPrice($('#monthlyPrice'), monthlyCurrent, monthlyActual, 'per month, recurring');
  renderPlanPrice($('#yearlyPrice'), yearlyCurrent, yearlyActual, 'per year, recurring');
  $('#freePrice').innerHTML = `${formatPrice(PLAN_CONFIG.free.price)} <span>always free</span>`;
}

function updateVoucherControls() {
  const signInRequired = !currentUser;
  const verificationUnavailable = billingConfig?.entitlementEnabled === false;
  voucherInput.disabled = signInRequired || verificationUnavailable;
  voucherButton.disabled = signInRequired || verificationUnavailable;
  voucherSection.classList.toggle('voucher-disabled', voucherInput.disabled);
  voucherSection.classList.toggle('voucher-pro-active', entitlement?.status === 'active');

  if (signInRequired) {
    voucherInput.placeholder = 'Sign in to redeem a voucher';
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = 'Sign in with Google before redeeming a voucher.';
  } else if (verificationUnavailable) {
    voucherInput.placeholder = 'Voucher redemption unavailable';
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = 'Voucher redemption is unavailable because server-side account verification is not configured.';
  } else if (entitlement?.status === 'active') {
    voucherInput.placeholder = 'Enter voucher code';
    voucherStatus.dataset.state = 'success';
    voucherStatus.textContent = `Pro is already active. A valid voucher will start after your current access ends${entitlement.validUntil ? ` on ${new Date(entitlement.validUntil).toLocaleDateString('en-IN')}` : ''}.`;
  } else {
    voucherInput.placeholder = 'Enter voucher code';
    voucherStatus.dataset.state = '';
    voucherStatus.textContent = billingConfig
      ? 'Enter a voucher code to check it for this account.'
      : 'Voucher availability could not be checked. Enter a code and the server will verify it.';
  }
}

async function loadPublicPricingConfig() {
  try {
    const response = await fetch('/api/pricing/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load pricing configuration.');
    const body = await response.json();
    window.__pricingConfig = body.pricing || { monthly: { currentPrice: PLAN_CONFIG.pro.monthly.price, actualPrice: PLAN_CONFIG.pro.monthly.price }, yearly: { currentPrice: PLAN_CONFIG.pro.yearly.price, actualPrice: PLAN_CONFIG.pro.yearly.price } };
    renderStoredPricing();
  } catch (error) {
    console.error('Pricing config could not be loaded.', error);
    window.__pricingConfig = {
      monthly: { currentPrice: PLAN_CONFIG.pro.monthly.price, actualPrice: PLAN_CONFIG.pro.monthly.price },
      yearly: { currentPrice: PLAN_CONFIG.pro.yearly.price, actualPrice: PLAN_CONFIG.pro.yearly.price }
    };
    renderStoredPricing();
  }
}

renderStoredPricing();
void loadPublicPricingConfig();

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

function updateVoucherControls() {
  const signInRequired = !currentUser;
  const proActive = entitlement?.status === 'active';
  const disabled = signInRequired || proActive;

  voucherInput.disabled = disabled;
  redeemButton.disabled = disabled;
  $('#voucherSection').classList.toggle('voucher-disabled', disabled);
  $('#voucherSection').classList.toggle('voucher-pro-active', proActive);

  if (signInRequired) {
    voucherInput.value = '';
    voucherInput.placeholder = 'Sign in to redeem a voucher';
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = 'Sign in with Google before redeeming a voucher.';
  } else if (proActive) {
    voucherInput.value = '';
    voucherInput.placeholder = 'Pro access is already active';
    voucherStatus.dataset.state = 'success';
    voucherStatus.textContent = 'Pro is already active. Voucher redemption is unavailable while your plan is active.';
  } else {
    voucherInput.placeholder = 'Enter voucher code';
    voucherStatus.dataset.state = '';
    voucherStatus.textContent = 'Enter a voucher code to check it for this account.';
  }
}

function updatePurchaseControls() {
  const checkoutReady = Boolean(billingConfig?.checkoutEnabled);
  const active = entitlement?.status === 'active';
  const activePlan = active ? entitlement.billingPlan : null;

  monthlyButton.disabled = true;
  yearlyButton.disabled = true;

  if (!checkoutReady) {
    monthlyButton.textContent = 'Coming soon';
    yearlyButton.textContent = 'Coming soon';
    checkoutStatus.textContent = 'Checkout is coming soon. Please check back later.  Till then user voucher code is available for free access. Please contact support for more details.';
  } else if (!currentUser) {
    monthlyButton.textContent = 'Sign in to purchase monthly';
    yearlyButton.textContent = 'Sign in to purchase yearly';
    monthlyButton.disabled = false;
    yearlyButton.disabled = false;
  } else if (active) {
    monthlyButton.textContent = 'Manage billing';
    yearlyButton.textContent = 'Manage billing';
  } else {
    monthlyButton.textContent = 'Start monthly subscription';
    yearlyButton.textContent = 'Start yearly subscription';
    monthlyButton.disabled = false;
    yearlyButton.disabled = false;
  }

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
  updateVoucherControls();
  if (!user) {
    checkoutStatus.textContent = 'Sign in with Google before starting a purchase.';
    updateVoucherControls();
    return;
  }
  try {
    if (!billingConfig) billingConfig = await loadBillingConfig();
    if (billingConfig.entitlementEnabled) entitlement = await loadBillingEntitlement(user);
    if (currentUser?.uid !== user.uid) return;
    updatePurchaseControls();
    updateVoucherControls();
  } catch (error) {
    console.error('Could not load billing status.', error);
    checkoutStatus.textContent = error.message;
    updatePurchaseControls();
    updateVoucherControls();
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
  if (!billingConfig?.checkoutEnabled) {
    checkoutStatus.textContent = 'Checkout is coming soon. Please check back later. Till then user voucher code is available for free access. Please contact support for more details.';
    return;
  }
  if (!currentUser) {
    checkoutStatus.textContent = 'Sign in with Google before starting a purchase.';
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

$('#pricingVoucherForm').addEventListener('submit', async event => {
  event.preventDefault();
  const code = voucherInput.value.trim();
  if (!currentUser) {
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = 'Sign in with Google before redeeming a voucher.';
    return;
  }
  if (!code) return;

  voucherButton.disabled = true;
  voucherStatus.dataset.state = '';
  voucherStatus.textContent = 'Checking voucher…';
  try {
    const result = await redeemBillingVoucher(currentUser, code);
    entitlement = result.entitlement;
    voucherInput.value = '';
    updatePurchaseControls();
    updateVoucherControls();
    voucherStatus.dataset.state = 'success';
    voucherStatus.textContent = result.queued
      ? `Voucher accepted. It will add ${result.entitlement.pendingVoucherCount} voucher${result.entitlement.pendingVoucherCount === 1 ? '' : 's'} after your current Pro access ends${result.entitlement.pendingVoucherStartAt ? ` on ${new Date(result.entitlement.pendingVoucherStartAt).toLocaleDateString('en-IN')}` : ''}.`
      : `Voucher redeemed. Pro is active through ${new Date(result.entitlement.validUntil).toLocaleDateString('en-IN')}.`;
  } catch (error) {
    console.error('Could not redeem voucher from the Plans page.', error);
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = error.message || 'Could not redeem this voucher.';
  } finally {
    voucherButton.disabled = !currentUser || billingConfig?.entitlementEnabled === false;
  }
});

loadBillingConfig().then(config => {
  billingConfig = config;
  if (!config.checkoutEnabled) {
    checkoutStatus.textContent = 'Pro checkout is temporarily unavailable. Please try again later.';
  }
  updatePurchaseControls();
  updateVoucherControls();
}).catch(error => {
  console.error('Could not load checkout configuration.', error);
  checkoutStatus.textContent = error.message;
  updateVoucherControls();
});

if (!cloudConfigured) {
  void refreshPricingState(null);
  checkoutStatus.textContent = 'Google sign-in is not configured on this site. Purchases are unavailable.';
  updateVoucherControls();
} else {
  observeAuth((user, error) => {
    if (error) {
      console.error('Could not observe Firebase sign-in state.', error);
      currentUser = null;
      entitlement = null;
      checkoutStatus.textContent = 'Sign-in could not be initialized. Paid purchases are unavailable.';
      updatePurchaseControls();
      updateVoucherControls();
      return;
    }
    refreshPricingState(user);
  });
}
