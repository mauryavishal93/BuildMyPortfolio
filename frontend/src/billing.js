import {
  cancelBillingSubscription,
  loadBillingActivity,
  loadBillingConfig,
  loadBillingEntitlement
} from './billing-client.js';
import { cloudConfigured, observeAuth } from './firebase-cloud.js';

const $ = selector => document.querySelector(selector);
const accountStatus = $('#billingAccountStatus');
const planTitle = $('#billingPlanTitle');
const planDetail = $('#billingPlanDetail');
const historyList = $('#billingHistory');
const billingStatus = $('#billingServiceStatus');
const cancelButton = $('#cancelBilling');
const cancelDialog = $('#cancelSubscriptionDialog');
const cancelDialogForm = $('#cancelSubscriptionForm');
const cancelReasonInput = $('#cancelReason');
let currentUser = null;
let entitlement = null;
let billingConfig = null;
let billingConfigError = null;
let refreshId = 0;
let cancellationPending = false;

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

function updatePlanSummary(user) {
  const active = entitlement?.status === 'active';
  cancelButton.hidden = !user || !active || !entitlement?.subscriptionId || Boolean(entitlement.cancelAtCycleEnd);

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

  if (authError) billingStatus.textContent = authError.message || 'Sign-in could not be initialized.';
  else billingStatus.textContent = billingConfigError?.message || '';

  if (!user) {
    accountStatus.textContent = 'Sign in with Google to view and manage billing for your account.';
    historyList.textContent = 'Sign in to view billing activity.';
    updatePlanSummary(null);
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
}

async function finalizeCancellation() {
  if (cancellationPending || !currentUser || !entitlement?.subscriptionId) return;
  cancellationPending = true;
  cancelButton.disabled = true;
  const confirmButton = cancelDialogForm?.querySelector('[type="submit"]');
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Scheduling cancellation…';
  }
  try {
    const reason = cancelReasonInput.value.trim();
    await cancelBillingSubscription(currentUser, entitlement.subscriptionId, reason);
    cancelDialog?.close?.();
    await refreshBillingPage(currentUser);
    billingStatus.textContent = 'Cancellation scheduled. Pro remains active through the current paid period.';
  } catch (error) {
    billingStatus.textContent = error.message || 'Could not cancel this subscription.';
  } finally {
    cancellationPending = false;
    cancelButton.disabled = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = 'Confirm cancellation';
    }
  }
}

cancelButton.addEventListener('click', () => {
  if (cancellationPending || !currentUser || !entitlement?.subscriptionId) return;
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

if (cloudConfigured) observeAuth((user, error) => refreshBillingPage(user, error));
else void refreshBillingPage(null, new Error('Google sign-in is not configured on this site.'));