# PersonaCraftPro

A browser-based resume editor with multiple templates, editable sections, JSON project import/export, guest browser-saving controls, Google sign-in and Firebase cloud resume storage, and high-resolution PDF export with selectable text. Signed-in users reopen the cloud resume they last worked on. PDF downloads are capped below 500 KB; the exporter balances image resolution and JPEG quality, and blocks downloads if a resume cannot fit at readable settings.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Setup

```sh
npm install
npm run dev
```

Vite opens the editor at `/`. To run the billing API locally, start the backend in a second terminal with `npm run backend`; Vite proxies `/api` requests to `http://127.0.0.1:3000`. Billing remains disabled unless all server-side configuration is present.

Check whether the website backend is running with `GET /api/health`. It returns HTTP `200` and `{"status":"ok"}` when available, with caching disabled.

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
- `frontend/pricing.html` and `frontend/src/pricing.js` describe the free feature set and support contact dialog.
- `frontend/src/main.js` owns editor state, resume rendering, editing controls, local autosave, JSON import/export, and PDF workflows.
- `Templates/` keeps each resume template's metadata (`template.js`) and design styles (`style.css`) in its own named folder. `Templates/index.js` registers the template modules; the editor uses a shared data-driven renderer.
- `frontend/src/plan-access.js` lists the features available to everyone; there are no paid feature gates.
- `frontend/src/firebase-cloud.js` provides Google authentication and per-user Firestore resume storage. Firebase SDK modules are loaded only when cloud/auth features are used.
- `backend/server.js` retains legacy billing-history and cancellation support; new subscription, plan-change, and voucher-redemption requests are disabled.
- `backend/billing.js` contains legacy subscription and entitlement helpers.
- `firestore.rules` restricts resume documents to their authenticated owner and explicitly blocks all client access to billing documents. `firebase.json` maps the rules for Firebase CLI rules-only deployments; it does not configure Firebase Hosting.
- `frontend/src/ats-scoring.js`, `frontend/src/cover-letter.js`, `frontend/src/cover-letter-pdf.js`, and `frontend/src/zoom.js` contain focused editor helpers.
- `frontend/src/style.css` and `frontend/src/about.css` contain editor and informational-page styles.
- `vite.config.js` configures the frontend build and local API proxy. `tests/` contains the Node.js test suite.

## Data flow

Guest resumes are saved in this browser by default. The editor header's **Save in this browser** toggle controls whether guest resume data is autosaved to `localStorage`; when off, edits stay in memory and are discarded on refresh or page close. The preference is remembered. Google-authenticated resumes always use account-scoped Firebase cloud storage and are never written to guest resume storage. The ID of the last-opened cloud resume is stored in a private account preference, so the editor reopens that resume on the user's next visit; if it was deleted, the most recently updated resume is opened instead. If the account has no saved resumes, a guest draft can be migrated or a new cloud resume is created. If saved project data cannot be read, the editor pauses autosave, keeps the original data available for download, and asks before replacing it; a valid legacy copy can be recovered. JSON imports are limited to 5 MB and validated before replacing the current project. All 20 templates, unlimited text-based PDF exports, and unlimited resume-only and job-description ATS checks are free. Firestore rules protect account-scoped resumes and preferences.

## Free features and legacy billing

Every feature is available at no cost; there are no paid plans, vouchers, or usage limits. Google sign-in is optional and is only needed for cloud resume storage.

Legacy billing records and cancellation support remain so existing subscribers can stop renewals and review account activity. The app and billing API do not allow new subscriptions, plan changes, or voucher redemption. Resume contents and job descriptions are not sent to payment services.
