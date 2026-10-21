# BuildMyPortfolio

A browser-based resume editor with multiple templates, editable sections, JSON project import/export, local autosave, optional Google sign-in and Firebase cloud resume storage, and high-resolution PDF export with selectable text.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Setup

```sh
npm install
npm run dev
```

Vite opens the editor at the root URL (`/`).

## Production

```sh
npm run build
npm start
```

The production build is generated in `dist/`. `npm start` serves that build; run `npm run build` first.

## Deploy on Render

The root `render.yaml` configures a Render Static Site. Push it to the `main` branch, then in Render choose **New > Blueprint** and connect `mauryavishal93/BuildMyPortfolio`. Render will run `npm install && npm run build` and publish `dist/`. Approve the `buildmyportfolio` service to start the deploy. Because the GitHub repository is private, authorize Render to access it when prompted.

The site is multi-page: `/` redirects to the editor, `/editor.html` is the editor page, `/about.html` is the About page, and `/privacy.html` is the privacy policy. No Render web service or environment variables are required.

## Project structure

- `frontend/index.html`, `frontend/editor.html`, `frontend/about.html`, and `frontend/privacy.html` are the HTML entry points.
- `frontend/src/main.js` owns the editor state, resume rendering, editing controls, local autosave, JSON import/export, and PDF workflows.
- `frontend/src/firebase-cloud.js` provides optional Google authentication and per-user Firestore resume storage. Firebase SDK modules are loaded only when cloud features are used.
- `firestore.rules` restricts resume documents to the authenticated owner. `firebase.json` maps this rules file for Firebase CLI rules-only deployments; it does not configure Firebase Hosting.
- `frontend/src/ats-scoring.js`, `frontend/src/cover-letter.js`, `frontend/src/cover-letter-pdf.js`, and `frontend/src/zoom.js` contain focused editor helpers.
- `frontend/src/style.css` and `frontend/src/about.css` contain the editor and informational-page styles.
- `backend/server.js` serves the production frontend and provides `/api/health`; the Render deployment uses the static-site configuration in `render.yaml`.
- `vite.config.js` configures the frontend build, while `package.json` and `package-lock.json` define scripts and dependencies.
- `tests/` contains the Node.js test suite. `reference/` keeps the original standalone HTML for reference.

## Data flow

Resume editing and autosaving work locally in the browser without an account. When a user chooses to sign in and save a resume, the Firebase client stores that named resume in Firestore under the user's authenticated UID. Firestore security rules enforce per-user access. JSON download remains a separate, local backup workflow. The app does not use its Express health-check server as a resume API.
