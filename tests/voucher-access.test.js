import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStaticVoucher, readStaticVoucherState } from '../frontend/src/plan-access.js';

test('accepts a valid static voucher code and stores it', () => {
  const store = new Map();
  const result = applyStaticVoucher('WELCOME10', store);

  assert.equal(result.success, true);
  assert.equal(result.entitlement.planId, 'pro');
  assert.equal(readStaticVoucherState(store)?.code, 'WELCOME10');
});

test('rejects an unknown voucher code', () => {
  const store = new Map();
  const result = applyStaticVoucher('NOT-A-REAL-CODE', store);

  assert.equal(result.success, false);
  assert.equal(result.message.includes('Invalid voucher'), true);
});
