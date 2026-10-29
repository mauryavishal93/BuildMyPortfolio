import {
  cancelBillingSubscription,
  loadBillingActivity,
  loadBillingConfig,
  loadBillingEntitlement,
  redeemBillingVoucher,
  scheduleBillingPlanChange
} from './billing-client.js';
import { cloudConfigured, observeAuth } from './firebase-cloud.js';

const $ = selector => document.querySelector(selector);
const accountStatus = $('#billingAccountStatus');
const planTitle = $('#billingPlanTitle');
const planDetail = $('#billingPlanDetail');
const historyList = $('#billingHistory');
const billingStatus = $('#billingServiceStatus');
const voucherInput = $('#voucherCode');
const redeemButton = $('#redeemVoucher');
const cancelButton = $('#cancelBilling');
const cancelDialog = $('#cancelSubscriptionDialog');
const cancelDialogForm = $('#cancelSubscriptionForm');
const cancelReasonInput = $('#cancelReason');
const yearlyButton = $('#switchBillingYearly');
let currentUser = null;
let entitlement = null;
let billingConfig = null;
let billingConfigError = null;
let refreshId = 0;

const formatDate = value => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
    : 'Date unavailable';
};

function renderHistory(activity) {
  historyList.replaceChildren();
  if (!activity.length) {
    const empty = document.createElement('p');
    empty.className = 'billing-history-empty';
    empty.textContent = 'No billing activity yet.';
    historyList.append(empty);
    return;
  }

  for (const item of activity) {
    const row = document.createElement('article');
    row.className = 'billing-history-item';
    const icon = document.createElement('span');
    icon.className = 'billing-history-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.status === 'success' || item.status === 'active' ? '✓' : '•';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title || 'Billing activity';
    const description = document.createElement('p');
    description.textContent = item.detail || 'Billing activity updated.';
    details.append(title, description);
    const time = document.createElement('time');
    time.textContent = formatDate(item.occurredAt);
    row.append(icon, details, time);
    historyList.append(row);
  }
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

function updatePlanSummary(user) {
  const active = entitlement?.status === 'active';
  cancelButton.hidden = !active || !entitlement?.subscriptionId || Boolean(entitlement.cancelAtCycleEnd);
  yearlyButton.hidden = !active || entitlement.billingPlan !== 'monthly' || Boolean(entitlement.cancelAtCycleEnd);
  yearlyButton.disabled = !billingConfig?.checkoutEnabled;

  if (!user) {
    planTitle.textContent = 'No active plan';
    planDetail.textContent = 'Sign in to review purchases and manage billing.';
  } else if (!active) {
    planTitle.textContent = 'Free plan';
    planDetail.textContent = 'No active Pro plan is linked to this account.';
  } else {
    const plan = entitlement.billingPlan === 'voucher' ? 'Pro voucher' : `Pro ${entitlement.billingPlan || ''}`.trim();
    const validUntil = entitlement.validUntil ? new Date(entitlement.validUntil).toLocaleDateString('en-IN') : 'the current billing period';
    const renews = entitlement.cancelAtCycleEnd ? ' This plan will not renew.' : '';
    const scheduled = entitlement.scheduledPlan === 'yearly' ? ` Yearly billing is scheduled after ${validUntil}.` : '';
    planTitle.textContent = `${plan} active`;
    planDetail.textContent = `Access continues through ${validUntil}.${renews}${scheduled}`;
  }
}

async function refreshBillingPage(user, authError = null) {
  const requestId = ++refreshId;
  currentUser = user;
  entitlement = null;
  updatePlanSummary(user);
  updateVoucherControls();

  if (authError) billingStatus.textContent = authError.message || 'Sign-in could not be initialized.';
  else billingStatus.textContent = billingConfigError?.message || '';

  if (!user) {
    accountStatus.textContent = 'Sign in with Google to view and manage billing for your account.';
    historyList.textContent = 'Sign in to view billing activity.';
    updatePlanSummary(null);
    updateVoucherControls();
    return;
  }

  accountStatus.textContent = `Signed in as ${user.email || user.displayName || 'Google user'}. Billing details are private to this account.`;
  historyList.textContent = 'Loading billing activity…';
  try {
    if (!billingConfig && !billingConfigError) billingConfig = await loadBillingConfig();
  } catch (error) {
    billingConfigError = error;
    billingStatus.textContent = error.message || 'Billing configuration is unavailable.';
  }

  if (currentUser?.uid !== user.uid || requestId !== refreshId) return;
  const [entitlementResult, activityResult] = await Promise.allSettled([
    billingConfig?.entitlementEnabled ? loadBillingEntitlement(user) : Promise.resolve(null),
    loadBillingActivity(user)
  ]);
  if (currentUser?.uid !== user.uid || requestId !== refreshId) return;

  if (entitlementResult.status === 'fulfilled') entitlement = entitlementResult.value;
  else billingStatus.textContent = entitlementResult.reason?.message || 'Could not load plan status.';
  if (activityResult.status === 'fulfilled') renderHistory(activityResult.value || []);
  else {
    historyList.replaceChildren();
    const error = document.createElement('p');
    error.className = 'billing-history-empty';
    error.textContent = activityResult.reason?.message || 'Billing activity is temporarily unavailable.';
    historyList.append(error);
  }

  updatePlanSummary(user);
  updateVoucherControls();
}

async function finalizeCancellation() {
  if (!currentUser || !entitlement?.subscriptionId) return;
  cancelButton.disabled = true;
  try {
    const reason = cancelReasonInput.value.trim();
    await cancelBillingSubscription(currentUser, entitlement.subscriptionId, reason);
    billingStatus.textContent = 'Cancellation scheduled. Pro remains active through the current paid period.';
    cancelDialog?.close?.();
    await refreshBillingPage(currentUser);
  } catch (error) {
    billingStatus.textContent = error.message || 'Could not cancel this subscription.';
  } finally {
    cancelButton.disabled = false;
  }
}

cancelButton.addEventListener('click', () => {
  if (!currentUser || !entitlement?.subscriptionId) return;
  if (cancelDialog && typeof cancelDialog.showModal === 'function') {
    cancelReasonInput.value = '';
    cancelDialog.showModal();
    return;
  }
  if (!window.confirm('Cancel future renewals? Pro remains active until the current paid period ends.')) return;
  void finalizeCancellation();
});

cancelDialogForm?.addEventListener('submit', event => {
  event.preventDefault();
  void finalizeCancellation();
});

document.querySelectorAll('[data-close-cancel-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    cancelDialog?.close?.();
    cancelReasonInput.value = '';
  });
});

yearlyButton.addEventListener('click', async () => {
  if (!currentUser || entitlement?.billingPlan !== 'monthly' || !billingConfig?.checkoutEnabled) return;
  const date = entitlement.validUntil ? new Date(entitlement.validUntil).toLocaleDateString('en-IN') : 'the end of this billing period';
  if (!window.confirm(`Schedule Pro Yearly to begin after ${date}? Your monthly access continues until then; ₹399/year will be charged when the switch takes effect.`)) return;
  yearlyButton.disabled = true;
  try {
    const result = await scheduleBillingPlanChange(currentUser, 'yearly');
    billingStatus.textContent = `Yearly plan scheduled for ${new Date(result.scheduledAt).toLocaleDateString('en-IN')}.`;
    await refreshBillingPage(currentUser);
  } catch (error) {
    billingStatus.textContent = error.message || 'Could not schedule the yearly plan.';
    yearlyButton.disabled = false;
  }
});

$('#voucherForm').addEventListener('submit', async event => {
  event.preventDefault();
  const code = voucherInput.value.trim();
  if (!currentUser) {
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = 'Sign in with Google before redeeming a voucher.';
    return;
  }
  if (entitlement?.status === 'active') {
    voucherStatus.dataset.state = 'success';
    voucherStatus.textContent = 'Pro is already active. Voucher redemption is unavailable while your plan is active.';
    return;
  }
  if (!code) return;

  redeemButton.disabled = true;
  voucherStatus.dataset.state = '';
  voucherStatus.textContent = 'Checking voucher…';
  try {
    entitlement = await redeemBillingVoucher(currentUser, code);
    voucherInput.value = '';
    voucherStatus.dataset.state = 'success';
    voucherStatus.textContent = `Voucher redeemed. Pro is active through ${new Date(entitlement.validUntil).toLocaleDateString('en-IN')}.`;
    await refreshBillingPage(currentUser);
  } catch (error) {
    voucherStatus.dataset.state = 'error';
    voucherStatus.textContent = error.message || 'Could not redeem this voucher.';
    updateVoucherControls();
  }
});

if (cloudConfigured) observeAuth((user, error) => refreshBillingPage(user, error));
else void refreshBillingPage(null, new Error('Google sign-in is not configured on this site.'));