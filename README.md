# BuildMyPortfolio

A browser-based resume editor with multiple templates, editable sections, JSON project import/export, local autosave, and PDF export.

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

The site is multi-page: `/` opens the editor, `/editor.html` is the editor page, and `/about.html` is the About page. No Render web service or environment variables are required.

## Project structure

- `frontend/editor.html` is the resume editor page.
- `frontend/about.html` contains product and developer information.
- `frontend/src/style.css` contains the app styles.
- `frontend/src/main.js` contains the editor behavior.
- `frontend/index.html` redirects to the named app page.
- `backend/server.js` serves the production frontend and provides `/api/health`.
- `reference/` keeps the original standalone HTML for reference.
- `vite.config.js` configures the frontend build.
- `package.json` and `package-lock.json` manage scripts and dependencies.

Resume data is still stored in the browser; the backend currently provides static hosting and a health endpoint.