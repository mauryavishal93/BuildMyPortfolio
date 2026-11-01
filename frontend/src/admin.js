import { getFirebaseIdToken, observeAuth, signInWithGoogle } from './firebase-cloud.js';

let currentUser;
let dashboard;
const filters = {
  search: '',
  status: 'all',
  plan: 'all',
  sort: 'newest'
};
const $ = selector => document.querySelector(selector);

async function api(path, options = {}) {
  let token;
  try {
    token = await getFirebaseIdToken(currentUser);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const error = new Error(`Could not verify your sign-in: ${detail}`);
    error.code = 'AUTH_TOKEN';
    throw error;
  }
  let response;
  try {
    response = await fetch(path, { ...options, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(options.headers || {}) } });
  } catch {
    const error = new Error('The admin API could not be reached.');
    error.code = 'API_UNREACHABLE';
    throw error;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || `Admin API request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function setDashboardStatus(message, state = 'ready') {
  const status = $('#dashboard-status');
  status.dataset.state = state;
  status.lastChild.textContent = message;
}

function formatMoney(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0
  }).format((Number(amount) || 0) / 100);
}

function formatMoneyByCurrency(amounts) {
  const entries = Object.entries(amounts || {}).filter(([, amount]) => Number(amount) > 0);
  return entries.length
    ? entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')
    : formatMoney(0, 'INR');
}

function updateAdminMeta() {
  const badge = $('#admin-user-badge');
  const lastUpdated = $('#admin-last-updated');
  if (badge) {
    badge.textContent = currentUser ? `Signed in as ${currentUser.email || currentUser.displayName || 'Admin'}` : 'Admin view';
  }
  if (lastUpdated) {
    const timestamp = new Date();
    lastUpdated.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
}

async function load() {
  const refresh = $('#refresh');
  if (!currentUser) {
    $('#access').hidden = false;
    $('#admin-content').hidden = true;
    $('#sign-in').hidden = false;
    setDashboardStatus('Sign in required', 'idle');
    return;
  }
  refresh.disabled = true;
  setDashboardStatus('Loading dashboard…', 'loading');
  try {
    dashboard = await api('/api/admin/dashboard');
    const totals = dashboard.totals || {};
    $('#stat-users').textContent = totals.users ?? 0;
    $('#stat-pro').textContent = totals.pro ?? 0;
    $('#stat-regular').textContent = totals.regular ?? 0;
    $('#stat-new-users').textContent = totals.newUsers30Days ?? 0;
    $('#stat-earnings').textContent = formatMoneyByCurrency(totals.earningsByCurrency || { INR: totals.earnings });
    $('#stat-monthly-earnings').textContent = formatMoneyByCurrency(totals.earningsThisMonthByCurrency || { INR: totals.earningsThisMonth });
    $('#stat-pro-mix').textContent = `${totals.monthlyPro ?? 0} monthly · ${totals.yearlyPro ?? 0} yearly`;
    $('#stat-conversion').textContent = `${totals.conversionRate ?? 0}% Pro conversion`;
    $('#stat-monthly-payment-count').textContent = `${totals.paymentsThisMonth ?? 0} captured payment${totals.paymentsThisMonth === 1 ? '' : 's'} this month`;
    $('#stat-payment-count').textContent = `${totals.paymentCount ?? 0} captured payment${totals.paymentCount === 1 ? '' : 's'} recorded`;
    updateSummaryChips();
    renderUsers();
    renderPayments();
    renderVouchers();
    await loadPricingSettings();
    updateAdminMeta();
    $('#access').hidden = true;
    $('#admin-content').hidden = false;
    $('#sign-in').hidden = true;
    setDashboardStatus('Data is up to date', 'ready');
  } catch (error) {
    console.error('Could not load the admin dashboard.', error);
    let message = error.message;
    let title = 'Admin dashboard unavailable';
    if (error.status === 403) {
      title = 'Administrator access required';
      message = `Signed in as ${currentUser?.email || 'this account'}, but it is not allowed. Add this Google email to ADMIN_EMAILS on the backend, then restart it.`;
    } else if (error.status === 401) {
      title = 'Sign-in needs attention';
      message = 'Your sign-in could not be verified. Sign in again and confirm the backend has valid Firebase Admin credentials.';
    } else if (error.status === 503) {
      message = `${error.message} For local development, set FIREBASE_SERVICE_ACCOUNT_JSON and ADMIN_EMAILS on the backend.`;
    } else if (error.code === 'API_UNREACHABLE') {
      message = 'Could not reach the admin API. Start the backend with npm run backend, then open the Vite site at http://localhost:5173/admin.html.';
    } else if (error.code === 'AUTH_TOKEN') {
      title = 'Sign-in needs attention';
      message = error.message;
    }
    $('#access').hidden = false;
    $('#access h2').textContent = title;
    $('#admin-content').hidden = !dashboard;
    $('#sign-in').hidden = !!currentUser;
    $('#access p').textContent = currentUser
      ? message
      : 'Sign in with an administrator account to unlock revenue, billing, and user controls.';
    setDashboardStatus('Unable to refresh', 'error');
  } finally {
    refresh.disabled = false;
  }
}

function userIsActive(user) {
  return Boolean(user.isPro);
}

function userMatchesStatus(user, status) {
  const active = userIsActive(user);
  if (status === 'active') return active;
  if (status === 'inactive') return !active;
  if (status === 'pro') return !!user.isPro;
  if (status === 'free') return !user.isPro;
  return true;
}

function userMatchesPlan(user, plan) {
  const activation = user.activationSource || '';
  if (plan === 'pro') return !!user.isPro;
  if (plan === 'free') return !user.isPro;
  if (plan === 'voucher') return activation === 'server-verified';
  if (plan === 'admin') return activation === 'admin';
  return true;
}

function summarizeUsers() {
  const users = dashboard?.users || [];
  return {
    all: users.length,
    active: users.filter(user => userIsActive(user)).length,
    inactive: users.filter(user => !userIsActive(user)).length,
    pro: users.filter(user => user.isPro).length,
    free: users.filter(user => !user.isPro).length
  };
}

function updateSummaryChips() {
  const summary = summarizeUsers();
  ['all', 'active', 'inactive', 'pro', 'free'].forEach(key => {
    const node = $(`#chip-${key}`);
    if (node) node.textContent = summary[key] ?? 0;
  });
}

function calculateDiscount(actualPrice, currentPrice) {
  const actual = Number(actualPrice) || 0;
  const current = Number(currentPrice) || 0;
  if (!actual || actual <= current) return 0;
  return Math.round(((actual - current) / actual) * 100);
}

function renderPricingConfig(pricing) {
  const config = pricing?.pricing || pricing || {};
  const monthly = config.monthly || {};
  const yearly = config.yearly || {};
  const usdMonthly = config.USD?.monthly || {};
  const usdYearly = config.USD?.yearly || {};
  $('#monthly-actual-price').value = monthly.actualPrice ?? 99;
  $('#monthly-current-price').value = monthly.currentPrice ?? 99;
  $('#yearly-actual-price').value = yearly.actualPrice ?? 399;
  $('#yearly-current-price').value = yearly.currentPrice ?? 399;
  $('#usd-monthly-actual-price').value = usdMonthly.actualPrice ?? 3.67;
  $('#usd-monthly-current-price').value = usdMonthly.currentPrice ?? 3.67;
  $('#usd-yearly-actual-price').value = usdYearly.actualPrice ?? 49.37;
  $('#usd-yearly-current-price').value = usdYearly.currentPrice ?? 49.37;
  const monthlyDiscount = calculateDiscount(monthly.actualPrice, monthly.currentPrice);
  const yearlyDiscount = calculateDiscount(yearly.actualPrice, yearly.currentPrice);
  const usdMonthlyDiscount = calculateDiscount(usdMonthly.actualPrice, usdMonthly.currentPrice);
  const usdYearlyDiscount = calculateDiscount(usdYearly.actualPrice, usdYearly.currentPrice);
  $('#pricing-summary').textContent = `INR monthly: ${monthlyDiscount}% off · yearly: ${yearlyDiscount}% off · USD monthly: ${usdMonthlyDiscount}% off · yearly: ${usdYearlyDiscount}% off`;
}

async function loadPricingSettings() {
  try {
    const result = await api('/api/admin/pricing');
    renderPricingConfig(result.pricing || result);
    $('#pricing-config-status').textContent = 'Loaded';
    $('#save-pricing-config').disabled = false;
  } catch (error) {
    $('#pricing-config-status').textContent = `Unavailable: ${error.message}`;
    $('#save-pricing-config').disabled = true;
    console.error('Could not load pricing settings.', error);
  }
}

function sortUsers(rows) {
  const copy = [...rows];
  const pct = value => Number(value) || 0;
  switch (filters.sort) {
    case 'oldest':
      copy.sort((a, b) => String(a.createdAt || 0).localeCompare(String(b.createdAt || 0)));
      break;
    case 'name':
      copy.sort((a, b) => `${a.name || a.email || 'User'}`.localeCompare(`${b.name || b.email || 'User'}`));
      break;
    case 'paid':
      copy.sort((a, b) => pct(b.paidAmount) - pct(a.paidAmount));
      break;
    case 'pro-first':
      copy.sort((a, b) => Number(b.isPro) - Number(a.isPro) || String(a.name || a.email || 'User').localeCompare(String(b.name || b.email || 'User')));
      break;
    case 'newest':
    default:
      copy.sort((a, b) => String(b.createdAt || 0).localeCompare(String(a.createdAt || 0)));
      break;
  }
  return copy;
}

function renderUsers() {
  const query = filters.search.toLowerCase();
  const allRows = (dashboard.users || []).filter(user => {
    const haystack = `${user.name || ''} ${user.email || ''} ${user.uid || ''}`.toLowerCase();
    return haystack.includes(query)
      && userMatchesStatus(user, filters.status)
      && userMatchesPlan(user, filters.plan);
  });
  const rows = sortUsers(allRows);
  const totalLabel = $('#user-count-label');
  if (totalLabel) totalLabel.textContent = `${rows.length} account${rows.length === 1 ? '' : 's'}`;

  if (!rows.length) {
    $('#user-list').innerHTML = '<tr><td colspan="5" class="empty-table-state">No accounts match the current filters.</td></tr>';
    return;
  }

  $('#user-list').innerHTML = rows.map(user => {
    const activation = user.activationSource === 'server-verified' ? 'Voucher' : user.activationSource === 'admin' ? 'Admin granted' : user.isPro ? 'Payment plan' : '—';
    const paid = formatMoneyByCurrency(user.paidAmountByCurrency || { INR: user.paidAmount });
    const status = userIsActive(user) ? 'Active' : 'Inactive';
    const activeClass = userIsActive(user) ? 'pro' : '';
    return `<tr><td><button class="account-link" data-user="${escapeHtml(user.uid)}"><span class="account-name">${escapeHtml(user.name || 'User')}</span><span class="account-email">${escapeHtml(user.email || user.uid)}</span></button></td><td><span class="status-pill ${user.isPro ? 'pro' : activeClass}">${user.isPro ? 'Pro' : status}</span><div class="activation-label">${escapeHtml(activation)}</div></td><td><strong>${paid}</strong><div class="activation-label">${Number(user.paymentCount) || 0} payment(s)</div></td><td>${user.validUntil ? new Date(user.validUntil).toLocaleString() : '—'}</td><td><div class="row-actions">${user.isPro ? '' : `<button class="mini-button" data-action="grant" data-plan="monthly" data-uid="${escapeHtml(user.uid)}">Monthly Pro</button><button class="mini-button" data-action="grant" data-plan="yearly" data-uid="${escapeHtml(user.uid)}">Yearly Pro</button>`}${user.isPro ? `<button class="mini-button danger" data-action="cancel" data-uid="${escapeHtml(user.uid)}">Cancel Pro</button>` : ''}</div></td></tr>`;
  }).join('');
}

function renderPayments() {
  const payments = dashboard.recentPayments || [];
  $('#recent-payment-count').textContent = `Latest ${payments.length}`;
  if (!payments.length) {
    $('#payment-list').innerHTML = '<tr><td colspan="5" class="empty-table-state">No captured payments have been recorded.</td></tr>';
    return;
  }

  $('#payment-list').innerHTML = payments.map(payment => {
    const account = payment.name || payment.email || payment.uid || 'Account unavailable';
    const date = payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'Date unavailable';
    return `<tr><td><span class="account-name">${escapeHtml(account)}</span><span class="account-email">${escapeHtml(payment.email || '')}</span></td><td>${escapeHtml(payment.plan || 'Pro')}</td><td><strong>${formatMoney(payment.amount, payment.currency || 'INR')}</strong></td><td><span class="status-pill pro">${escapeHtml(payment.status || 'Captured')}</span></td><td>${escapeHtml(date)}</td></tr>`;
  }).join('');
}

let voucherTab = 'active';
function renderVouchers() {
  const now = Date.now();
  const vouchers = dashboard.vouchers || [];
  const categorized = {
    active: vouchers.filter(v => !Number(v.redeemedCount) && Number(v.expiresAt || 0) > now),
    completed: vouchers.filter(v => Number(v.redeemedCount) > 0),
    unclaimed: vouchers.filter(v => !Number(v.redeemedCount) && Number(v.expiresAt || 0) <= now)
  };
  for (const key of Object.keys(categorized)) $(`#${key}-voucher-count`).textContent = categorized[key].length;
  document.querySelectorAll('[data-voucher-tab]').forEach(button => button.classList.toggle('active', button.dataset.voucherTab === voucherTab));
  $('#voucher-list').innerHTML = categorized[voucherTab].map(voucher => {
    const expired = Number(voucher.expiresAt || 0) <= now;
    const canDelete = !Number(voucher.redeemedCount) && now - Number(voucher.createdAt || now) >= 2 * 60 * 60 * 1000;
    const deleteButton = canDelete ? `<button class="mini-button danger voucher-delete" data-voucher-id="${escapeHtml(voucher.id)}">Delete</button>` : voucherTab === 'unclaimed' || expired ? '' : `<small class="delete-available">Delete available in 2 hours</small>`;
    const expiry = expired ? 'Expired' : `Expires ${new Date(voucher.expiresAt).toLocaleString()}`;
    return `<div class="voucher-row"><div><strong>${escapeHtml(voucher.code || '')}</strong><span>${escapeHtml(voucher.plan || '')} Pro · ${expiry}</span></div>${deleteButton}</div>`;
  }).join('') || '<p class="empty-voucher-list">No vouchers in this category.</p>';
}
document.querySelectorAll('[data-voucher-tab]').forEach(button => button.addEventListener('click', () => { voucherTab = button.dataset.voucherTab; renderVouchers(); }));

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

observeAuth((user, authError) => {
  currentUser = user;
  updateAdminMeta();
  if (authError) {
    $('#access').hidden = false;
    $('#admin-content').hidden = true;
    $('#sign-in').hidden = true;
    $('#access h2').textContent = 'Authentication unavailable';
    $('#access p').textContent = authError.message || 'Firebase authentication could not be initialized. Check the browser console and Firebase configuration.';
    setDashboardStatus('Authentication error', 'error');
    return;
  }
  if (user) {
    $('#sign-in').hidden = true;
    setDashboardStatus('Connecting to admin API…', 'loading');
    void load();
    return;
  }

  $('#access').hidden = false;
  $('#access h2').textContent = 'Administrator login';
  $('#admin-content').hidden = true;
  $('#sign-in').hidden = false;
  $('#access p').textContent = 'Sign in with an administrator account to unlock revenue, billing, and user controls.';
  setDashboardStatus('Sign in required', 'idle');
});
$('#sign-in').addEventListener('click', () => signInWithGoogle().catch(error => alert(error.message)));
$('#refresh').addEventListener('click', load);
$('#user-search').addEventListener('input', event => {
  filters.search = event.target.value.trim();
  renderUsers();
});
$('#status-filter').addEventListener('change', event => {
  filters.status = event.target.value;
  renderUsers();
});
$('#plan-filter').addEventListener('change', event => {
  filters.plan = event.target.value;
  renderUsers();
});
$('#sort-by').addEventListener('change', event => {
  filters.sort = event.target.value;
  renderUsers();
});
$('#clear-filters').addEventListener('click', () => {
  filters.search = '';
  filters.status = 'all';
  filters.plan = 'all';
  filters.sort = 'newest';
  $('#user-search').value = '';
  $('#status-filter').value = 'all';
  $('#plan-filter').value = 'all';
  $('#sort-by').value = 'newest';
  renderUsers();
});
document.querySelectorAll('[data-summary-filter]').forEach(button => {
  button.addEventListener('click', () => {
    const filter = button.dataset.summaryFilter;
    ['all', 'active', 'inactive', 'pro', 'free'].forEach(key => {
      const chip = document.querySelector(`[data-summary-filter="${key}"]`);
      if (chip) chip.classList.toggle('active', filter === key);
    });
    filters.status = filter === 'all' ? 'all' : filter;
    filters.plan = 'all';
    $('#status-filter').value = filters.status;
    $('#plan-filter').value = 'all';
    renderUsers();
  });
});
$('#save-pricing-config').addEventListener('click', async () => {
  const monthlyActual = Number($('#monthly-actual-price').value || 0);
  const monthlyCurrent = Number($('#monthly-current-price').value || 0);
  const yearlyActual = Number($('#yearly-actual-price').value || 0);
  const yearlyCurrent = Number($('#yearly-current-price').value || 0);
  const usdMonthlyActual = Number($('#usd-monthly-actual-price').value || 0);
  const usdMonthlyCurrent = Number($('#usd-monthly-current-price').value || 0);
  const usdYearlyActual = Number($('#usd-yearly-actual-price').value || 0);
  const usdYearlyCurrent = Number($('#usd-yearly-current-price').value || 0);
  const inrPrices = [monthlyActual, monthlyCurrent, yearlyActual, yearlyCurrent];
  const usdPrices = [usdMonthlyActual, usdMonthlyCurrent, usdYearlyActual, usdYearlyCurrent];

  if ([...inrPrices, ...usdPrices].some(value => !Number.isFinite(value) || value <= 0)
    || inrPrices.some(value => !Number.isInteger(value))
    || usdPrices.some(value => Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)) {
    $('#pricing-config-status').textContent = 'Invalid pricing';
    alert('Prices must be positive. INR prices must use whole rupees, and USD prices may have at most two decimal places.');
    return;
  }

  const saveButton = $('#save-pricing-config');
  try {
    saveButton.disabled = true;
    $('#pricing-config-status').textContent = 'Saving…';
    const result = await api('/api/admin/pricing', {
      method: 'PUT',
      body: JSON.stringify({
        pricing: {
          monthly: { actualPrice: monthlyActual, currentPrice: monthlyCurrent },
          yearly: { actualPrice: yearlyActual, currentPrice: yearlyCurrent },
          USD: {
            currency: 'USD',
            monthly: { actualPrice: usdMonthlyActual, currentPrice: usdMonthlyCurrent },
            yearly: { actualPrice: usdYearlyActual, currentPrice: usdYearlyCurrent }
          }
        }
      })
    });
    renderPricingConfig(result.pricing || result);
    $('#pricing-config-status').textContent = 'Saved';
  } catch (error) {
    $('#pricing-config-status').textContent = 'Failed';
    alert(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

$('#generate-voucher').addEventListener('click', async () => {
  try {
    const result = await api('/api/admin/vouchers', { method: 'POST', body: JSON.stringify({ plan: $('#voucher-plan').value, uid: $('#voucher-uid').value }) });
    const box = $('#generated-code'); box.hidden = false;
    box.innerHTML = `<span><small>Voucher generated</small><br>${escapeHtml(result.code)} — ${result.plan === 'yearly' ? '1 year' : '1 month'} Pro</span><button type="button" class="copy-code mini-button" data-code="${escapeHtml(result.code)}">Copy</button>`;
    await load();
  } catch (error) { alert(error.message); }
});
$('#voucher-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-voucher-id]'); if (!button) return;
  if (!window.confirm('Delete this unused voucher permanently?')) return;
  try { await api(`/api/admin/vouchers/${encodeURIComponent(button.dataset.voucherId)}`, { method: 'DELETE' }); await load(); }
  catch (error) { alert(error.message); }
});
$('#generated-code').addEventListener('click', async event => {
  const button = event.target.closest('[data-code]');
  if (!button) return;
  try { await navigator.clipboard.writeText(button.dataset.code); button.textContent = 'Copied'; } catch { button.textContent = 'Copy failed'; }
});
$('#user-list').addEventListener('click', async event => {
  const userButton = event.target.closest('[data-user]');
  if (userButton) { await openUserDetail(userButton.dataset.user); return; }
  const button = event.target.closest('[data-action]'); if (!button) return;
  try {
    if (button.dataset.action === 'grant') {
      openProGrant(button.dataset.uid, button.dataset.plan);
      return;
    }
    openProCancel(button.dataset.uid);
    return;
  } catch (error) { alert(error.message); }
});

let cancelUid;
function openProCancel(uid) {
  cancelUid = uid;
  $('#cancel-reason').value = '';
  $('#pro-cancel-dialog').showModal();
}
$('#close-cancel').addEventListener('click', () => $('#pro-cancel-dialog').close());
$('#pro-cancel-form').addEventListener('submit', async event => {
  event.preventDefault();
  const reason = $('#cancel-reason').value.trim();
  if (!reason) { alert('Enter a reason for cancelling Pro access.'); return; }
  try {
    await api(`/api/admin/users/${encodeURIComponent(cancelUid)}/cancel-pro`, { method: 'POST', body: JSON.stringify({ reason }) });
    $('#pro-cancel-dialog').close();
    await load();
  } catch (error) { alert(error.message); }
});

let grantUid;
let grantPlan;
function openProGrant(uid, plan) {
  grantUid = uid;
  grantPlan = plan;
  $('#grant-title').textContent = plan === 'yearly' ? 'Yearly Pro activation' : 'Monthly Pro activation';
  $('#grant-amount').value = '';
  $('#grant-transaction').value = '';
  $('#pro-grant-dialog').showModal();
}
$('#close-grant').addEventListener('click', () => $('#pro-grant-dialog').close());
$('#pro-grant-form').addEventListener('submit', async event => {
  event.preventDefault();
  const amount = Number($('#grant-amount').value || 0);
  const transactionId = $('#grant-transaction').value.trim();
  if (amount > 0 && !transactionId) { alert('Enter a transaction ID for a paid Pro activation.'); return; }
  try {
    await api(`/api/admin/users/${encodeURIComponent(grantUid)}/pro`, { method: 'POST', body: JSON.stringify({ plan: grantPlan, amount, transactionId }) });
    $('#pro-grant-dialog').close();
    await load();
  } catch (error) { alert(error.message); }
});

async function openUserDetail(uid) {
  try {
    $('#detail-body').innerHTML = '<p class="detail-loading">Loading account history…</p>';
    $('#user-detail').showModal();
    const details = await api(`/api/admin/users/${encodeURIComponent(uid)}`);
    $('#detail-name').textContent = details.name || details.email || uid;
    const entitlement = details.entitlement || {};
    const activation = entitlement.billingPlan === 'voucher' ? `Voucher${details.voucher?.code ? ` · ${details.voucher.code}` : ''}` : entitlement.source === 'admin' ? `Admin · ${entitlement.billingPlan || 'Pro'}` : entitlement.planId === 'pro' ? `${entitlement.billingPlan || 'Pro'} plan` : 'Free';
    const payments = (details.payments || []).map(payment => `<li><strong>${escapeHtml(payment.id)}</strong><span>${escapeHtml(payment.status || 'unknown')} · ${formatMoney(payment.amount, payment.currency || 'INR')}</span><small>${payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'Date unavailable'}</small></li>`).join('');
    const activity = (details.activity || []).map(item => `<li><strong>${escapeHtml(item.title || item.type || 'Billing activity')}</strong><span>${escapeHtml(item.detail || item.message || '')}</span><small>${item.occurredAt || item.createdAt ? new Date(item.occurredAt || item.createdAt).toLocaleString() : 'Date unavailable'}</small></li>`).join('');
    $('#detail-body').innerHTML = `<div class="detail-summary"><article><span>Account ID</span><strong>${escapeHtml(uid)}</strong></article><article><span>Email</span><strong>${escapeHtml(details.email || 'Not available')}</strong></article><article><span>Account created</span><strong>${details.createdAt ? new Date(details.createdAt).toLocaleString() : 'Not available'}</strong></article><article><span>Current activation</span><strong>${escapeHtml(activation)}</strong></article><article><span>Pro expires</span><strong>${entitlement.validUntil ? new Date(entitlement.validUntil).toLocaleString() : '—'}</strong></article><article><span>Total paid</span><strong>${formatMoneyByCurrency(details.paidAmountByCurrency || { INR: details.paidAmount })}</strong></article></div><div class="detail-columns"><section><h3>Payment history</h3><ul class="detail-list">${payments || '<li class="empty">No payments recorded.</li>'}</ul></section><section><h3>Pro & billing activity</h3><ul class="detail-list">${activity || '<li class="empty">No activity recorded.</li>'}</ul></section></div>`;
  } catch (error) { $('#detail-body').innerHTML = `<p class="detail-error">${escapeHtml(error.message)}</p>`; }
}
$('#close-detail').addEventListener('click', () => $('#user-detail').close());
$('#user-detail').addEventListener('click', event => { if (event.target === $('#user-detail')) $('#user-detail').close(); });
