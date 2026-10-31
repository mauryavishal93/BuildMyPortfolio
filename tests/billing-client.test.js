import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBillingResponse } from '../frontend/src/billing-client.js';

test('billing client parses successful JSON responses', async () => {
  const result = await parseBillingResponse(new Response(JSON.stringify({ entitlement: { planId: 'pro' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  }));
  assert.deepEqual(result, { entitlement: { planId: 'pro' } });
});

test('billing client surfaces backend JSON errors', async () => {
  await assert.rejects(
    parseBillingResponse(new Response(JSON.stringify({ error: 'Voucher has expired.' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })),
    { message: 'Voucher has expired.' }
  );
});

test('billing client diagnoses a missing non-JSON API route', async () => {
  await assert.rejects(
    parseBillingResponse(new Response('<!doctype html><title>Not found</title>', { status: 404 })),
    { message: 'Billing request failed (HTTP 404). The billing API route was not found. Check that /api is routed to the backend.' }
  );
});

test('billing client diagnoses non-JSON backend failures without hiding the HTTP status', async () => {
  await assert.rejects(
    parseBillingResponse(new Response('<!doctype html><title>Internal Server Error</title>', { status: 502 })),
    { message: 'Billing request failed (HTTP 502). The backend returned an unexpected response. Check its deployment and server logs.' }
  );
});
