import { getFirebaseIdToken, observeAuth, signInWithGoogle } from './firebase-cloud.js';

let currentUser;
let dashboard;
const $ = selector => document.querySelector(selector);

async function api(path, options = {}) {
  const token = await getFirebaseIdToken(currentUser);
  const response = await fetch(path, { ...options, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

async function load() {
  try {
    dashboard = await api('/api/admin/dashboard');
    $('#stat-users').textContent = dashboard.totals.users;
    $('#stat-pro').textContent = dashboard.totals.pro;
    $('#stat-regular').textContent = dashboard.totals.regular;
    $('#stat-earnings').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((dashboard.totals.earnings || 0) / 100);
    renderUsers(); renderVouchers();
    $('#access').hidden = true;
    $('#admin-content').hidden = false;
  } catch (error) {
    $('#access').hidden = false;
    $('#admin-content').hidden = true;
    $('#access p').textContent = error.message;
  }
}

function renderUsers() {
  const query = ($('#user-search').value || '').toLowerCase();
  const rows = (dashboard.users || []).filter(user => `${user.name} ${user.email} ${user.uid}`.toLowerCase().includes(query));
  $('#user-list').innerHTML = rows.map(user => {
    const activation = user.activationSource === 'server-verified' ? 'Voucher' : user.activationSource === 'admin' && String(user.email).toLowerCase() === String(dashboard.adminEmail || '').toLowerCase() ? 'Admin granted' : user.isPro ? 'Payment plan' : '—';
    const paid = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((Number(user.paidAmount) || 0) / 100);
    return `<tr><td><button class="account-link" data-user="${escapeHtml(user.uid)}"><span class="account-name">${escapeHtml(user.name || 'User')}</span><span class="account-email">${escapeHtml(user.email || user.uid)}</span></button></td><td><span class="status-pill ${user.isPro ? 'pro' : ''}">${user.isPro ? 'Pro' : 'Regular'}</span><div class="activation-label">${escapeHtml(activation)}</div></td><td><strong>${paid}</strong><div class="activation-label">${Number(user.paymentCount) || 0} payment(s)</div></td><td>${user.validUntil ? new Date(user.validUntil).toLocaleString() : '—'}</td><td><div class="row-actions">${user.isPro ? '' : `<button class="mini-button" data-action="grant" data-plan="monthly" data-uid="${escapeHtml(user.uid)}">Monthly Pro</button><button class="mini-button" data-action="grant" data-plan="yearly" data-uid="${escapeHtml(user.uid)}">Yearly Pro</button>`}${user.isPro ? `<button class="mini-button danger" data-action="cancel" data-uid="${escapeHtml(user.uid)}">Cancel Pro</button>` : ''}</div></td></tr>`;
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

observeAuth(user => { currentUser = user; if (user) load(); else { $('#access').hidden = false; $('#admin-content').hidden = true; } });
$('#sign-in').addEventListener('click', () => signInWithGoogle().catch(error => alert(error.message)));
$('#refresh').addEventListener('click', load);
$('#user-search').addEventListener('input', renderUsers);
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
    const isAdminAccount = String(details.email || '').toLowerCase() === String(dashboard?.adminEmail || '').toLowerCase();
    const activation = entitlement.billingPlan === 'voucher' ? `Voucher${details.voucher?.code ? ` · ${details.voucher.code}` : ''}` : entitlement.source === 'admin' && isAdminAccount ? `Admin · ${entitlement.billingPlan || 'Pro'}` : entitlement.planId === 'pro' ? `${entitlement.billingPlan || 'Pro'} plan` : 'Free';
    const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((Number(amount) || 0) / 100);
    const payments = (details.payments || []).map(payment => `<li><strong>${escapeHtml(payment.id)}</strong><span>${escapeHtml(payment.status || 'unknown')} · ${money(payment.amount)}</span><small>${payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'Date unavailable'}</small></li>`).join('');
    const activity = (details.activity || []).map(item => `<li><strong>${escapeHtml(item.title || item.type || 'Billing activity')}</strong><span>${escapeHtml(item.detail || item.message || '')}</span><small>${item.occurredAt || item.createdAt ? new Date(item.occurredAt || item.createdAt).toLocaleString() : 'Date unavailable'}</small></li>`).join('');
    $('#detail-body').innerHTML = `<div class="detail-summary"><article><span>Account ID</span><strong>${escapeHtml(uid)}</strong></article><article><span>Email</span><strong>${escapeHtml(details.email || 'Not available')}</strong></article><article><span>Account created</span><strong>${details.createdAt ? new Date(details.createdAt).toLocaleString() : 'Not available'}</strong></article><article><span>Current activation</span><strong>${escapeHtml(activation)}</strong></article><article><span>Pro expires</span><strong>${entitlement.validUntil ? new Date(entitlement.validUntil).toLocaleString() : '—'}</strong></article><article><span>Total paid</span><strong>${money(details.paidAmount)}</strong></article></div><div class="detail-columns"><section><h3>Payment history</h3><ul class="detail-list">${payments || '<li class="empty">No payments recorded.</li>'}</ul></section><section><h3>Pro & billing activity</h3><ul class="detail-list">${activity || '<li class="empty">No activity recorded.</li>'}</ul></section></div>`;
  } catch (error) { $('#detail-body').innerHTML = `<p class="detail-error">${escapeHtml(error.message)}</p>`; }
}
$('#close-detail').addEventListener('click', () => $('#user-detail').close());
$('#user-detail').addEventListener('click', event => { if (event.target === $('#user-detail')) $('#user-detail').close(); });
