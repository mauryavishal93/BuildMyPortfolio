# PersonaCraftPro

A browser-based resume editor with multiple templates, editable sections, JSON project import/export, local autosave, optional Google sign-in and Firebase cloud resume storage, and high-resolution PDF export with selectable text. PDF downloads are capped below 500 KB; the exporter balances image resolution and JPEG quality, and blocks downloads if a resume cannot fit at readable settings.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Setup

```sh
npm install
npm run dev
```

Vite opens the editor at `/`. To run the billing API locally, start the backend in a second terminal with `npm run backend`; Vite proxies `/api` requests to `http://127.0.0.1:3000`. Billing remains disabled unless all server-side configuration is present.

## Production

```sh
npm run build
npm start
```

The production build is generated in `dist/`. `npm start` serves the site and billing API; run `npm run build` first.

## Deploy on Render

The root `render.yaml` configures a Render Node web service that serves the built site and trusted billing API. Push it to the `main` branch, then in Render choose **New > Blueprint** and connect `mauryavishal93/PersonaCraftPro`. Render runs `npm install && npm run build`, then `npm start`. Approve the `buildmyportfolio` service to start the deploy. Because the GitHub repository is private, authorize Render to access it when prompted. Configure the secret environment variables described below before enabling billing.

The site is multi-page: `/` opens the editor; `/editor.html` is the editor page; `/about.html` is the About page; `/privacy.html` is the privacy policy; `/pricing.html` is the plan and purchase page; `/terms.html` describes service terms; and `/refunds.html` describes refund status.

## Project structure

- `frontend/index.html`, `frontend/editor.html`, `frontend/about.html`, and `frontend/privacy.html` are the main HTML entry points.
- `frontend/pricing.html`, `frontend/src/pricing.js`, and `frontend/src/billing-client.js` provide the signed-in monthly/yearly purchase experience and call the same-origin billing API.
- `frontend/src/main.js` owns editor state, resume rendering, editing controls, local autosave, JSON import/export, and PDF workflows.
- `frontend/src/plan-access.js` centralizes the Free/Pro feature definitions and UI gates. Editor access is based on entitlements loaded from the server; browser code is not the payment authority.
- `frontend/src/firebase-cloud.js` provides Google authentication and per-user Firestore resume storage. Firebase SDK modules are loaded only when cloud/auth features are used.
- `backend/server.js` verifies Firebase ID tokens, creates Razorpay subscriptions, verifies checkout signatures and provider state, processes signed webhooks, supports cancellation, and manages server-side Firestore entitlements.
- `backend/billing.js` contains server-owned prices, subscription intervals, signature checks, and entitlement validity logic.
- `firestore.rules` restricts resume documents to their authenticated owner and explicitly blocks all client access to billing documents. `firebase.json` maps the rules for Firebase CLI rules-only deployments; it does not configure Firebase Hosting.
- `frontend/src/ats-scoring.js`, `frontend/src/cover-letter.js`, `frontend/src/cover-letter-pdf.js`, and `frontend/src/zoom.js` contain focused editor helpers.
- `frontend/src/style.css` and `frontend/src/about.css` contain editor and informational-page styles.
- `vite.config.js` configures the frontend build and local API proxy. `tests/` contains the Node.js test suite.

## Data flow

Resume editing and autosaving work locally in the browser without an account. If saved project data cannot be read, the editor pauses autosave, keeps the original data available for download, and asks before replacing it; a valid legacy copy can be recovered. JSON imports are limited to 5 MB and validated before replacing the current project. Optional Google sign-in and Firebase cloud resume storage remain separate from local browser drafts. Signed-in Free users may use any Pro template and get two lifetime Pro-template PDF downloads per Google account; each download counts, including repeats. Firestore rules protect the account counter from reset, and active server-verified Pro subscribers are not limited. Deploy the updated rule before enabling this allowance with `firebase deploy --only firestore:rules`.

Paid plan purchases require a signed-in Google account. The backend verifies the Firebase ID token, creates the subscription with a server-selected Razorpay plan, verifies the checkout signature and Razorpay subscription/payment state, and activates entitlements only from verified checkout/provider events. A signed-in user can cancel future renewals; access remains valid through the current paid period. Resume contents and job descriptions are not sent to Razorpay.

## Free and Pro plans

Core resume editing, six templates, two lifetime Pro-template PDF downloads after Google sign-in, standard PDF export, resume-only ATS checks, basic cover-letter tools, JSON backup, and browser autosave remain free. Pro costs ₹99 per month or ₹399 per year as a recurring subscription until canceled. Pro includes all 20 templates, unlimited Pro-template PDF downloads, and job-description ATS matching.

Checkout fails closed until the server is fully configured. Start in Razorpay test mode and:

1. Create a Razorpay Plan for INR 99 billed monthly and another for INR 399 billed yearly, each with interval 1. Set their IDs as `RAZORPAY_PLAN_MONTHLY_ID` and `RAZORPAY_PLAN_YEARLY_ID`. Before creating any subscription, the backend fetches and verifies the provider plan amount, currency, and interval; the browser cannot set the charge amount.
2. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the server environment. Never put provider secrets in Vite variables, frontend code, or browser storage.
3. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to a server-only Firebase service account JSON with only the permissions needed to verify Firebase Authentication ID tokens and access billing records. This enables authenticated Pro-entitlement reads independently of Razorpay checkout readiness, so existing paid users remain recognized while new purchases are disabled. Firebase client rules explicitly deny access to billing documents.
4. Set the Razorpay webhook URL to `https://<your-domain>/api/billing/webhook` and subscribe to `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, and `subscription.expired`. The backend verifies signatures against the exact raw body and records event IDs for idempotency.
5. Keep checkout disabled while reviewing and publishing final service terms and refund information, then complete the Razorpay test-mode checklist below. Only after those checks pass should the operator set `BILLING_TERMS_PUBLISHED=true`, `BILLING_REFUNDS_PUBLISHED=true`, `BILLING_TEST_MODE_VERIFIED=true`, `BILLING_LIVE_LAUNCH_APPROVED=true`, and `BILLING_ENABLED=true`. These release-approval flags are unset by default and are not added to the Render Blueprint, so configuring provider credentials alone cannot enable live checkout. Checkout also requires all provider credentials, plan IDs, and Firebase Admin credentials.
6. Optional vouchers are configured privately using the Render `PRO_VOUCHERS_JSON` server environment variable, for example `[{"code":"PRIVATE-CODE-123","durationDays":30,"maxRedemptions":50}]`. Use uppercase alphanumeric codes with optional hyphens, durations from 1 to 3,650 days, and a redemption cap. Codes are never returned by the public config endpoint; sample codes shown in the pricing page are examples only. Redemption requires Google sign-in, is one-time per account per code, and is rejected while that account already has active Pro access. Checkout can remain disabled while vouchers are active.

The configured Razorpay subscriptions cover up to 100 years of billing cycles. Using Razorpay test credentials, verify purchases, renewals, failed payments, cancellations, webhook replay, and expired entitlements. Record and review those results, verify the production webhook and published policies, and only then approve the live launch. The repository contains no payment credentials; live purchases remain unavailable until all external services and release gates are explicitly configured.
