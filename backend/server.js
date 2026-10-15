import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(backendDir, '../dist');
const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/', (_request, response) => {
  response.sendFile(path.join(distDir, 'editor.html'));
});

app.use(express.static(distDir));
app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`BuildMyPortfolio backend listening on port ${port}`);
});