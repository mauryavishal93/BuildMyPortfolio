import { applyStaticVoucher, clearStaticVoucher, getStaticEntitlement } from './plan-access.js';

const statusEl = document.getElementById('voucherStatus');
const detailsEl = document.getElementById('voucherDetails');
const form = document.getElementById('voucherForm');
const codeInput = document.getElementById('voucherCode');
const clearBtn = document.getElementById('clearVoucherBtn');

function renderVoucherState() {
  const entitlement = getStaticEntitlement();

  if (!entitlement) {
    statusEl.textContent = 'No active voucher yet.';
    detailsEl.textContent = 'Use a valid voucher code to unlock Pro features for this browser.';
    return;
  }

  const expires = new Date(entitlement.validUntil).toLocaleString();
  statusEl.textContent = `Voucher active: ${entitlement.code}`;
  detailsEl.textContent = `Pro access is active until ${expires}.`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();

  if (!code) {
    statusEl.textContent = 'Please enter a voucher code.';
    detailsEl.textContent = 'Example codes: WELCOME10, PRO30, LIFETIMEVIP';
    return;
  }

  const result = applyStaticVoucher(code);
  if (!result.success) {
    statusEl.textContent = 'Voucher not accepted.';
    detailsEl.textContent = result.message;
    return;
  }

  statusEl.textContent = result.message;
  detailsEl.textContent = 'This browser now has static Pro access enabled.';
  codeInput.value = '';
});

clearBtn.addEventListener('click', () => {
  clearStaticVoucher();
  renderVoucherState();
  statusEl.textContent = 'Voucher cleared.';
  detailsEl.textContent = 'The browser can no longer use a static Pro voucher until a new one is applied.';
});

renderVoucherState();
