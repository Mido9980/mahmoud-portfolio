import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { attachUser } from './auth.js';
import { ensureDirs, startWorker } from './jobs.js';
import authRoutes from './routes/auth.js';
import directorRoutes from './routes/director.js';
import projectRoutes from './routes/projects.js';
import jobRoutes from './routes/jobs.js';
import adminRoutes from './routes/admin.js';
import assetRoutes from './routes/assets.js';
import libraryRoutes from './routes/library.js';
import systemRoutes from './routes/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; worker-src 'self'; base-uri 'self'; form-action 'self'",
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

app.use('/api/auth', authRoutes);
app.use('/api/director', directorRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', assetRoutes);
app.use('/api', libraryRoutes);
app.use('/api', systemRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'API route not found.' } });
});

app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    maxAge: 0,
    etag: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }),
);

app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (res.headersSent) return;
  let status = err.status || 500;
  let message = err.message || 'Something went wrong.';
  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large.';
  }
  if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 12 MB.' : `Upload error: ${err.message}`;
  }
  if (status >= 500) {
    console.error('[error]', err);
    if (!err.status) message = 'Something went wrong. Check the server logs.';
  }
  res.status(status).json({ error: { code: err.code || 'server_error', message } });
});

const port = Number(process.env.PORT) || 3000;

async function boot() {
  await initDb();
  await ensureDirs();
  startWorker();
  if (!process.env.APP_SECRET) {
    console.warn('[nova] APP_SECRET is not set — provider keys saved from the dashboard will be rejected.');
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`[nova] NOVA AI VIDEO AGENT ULTRA listening on http://0.0.0.0:${port}`);
  });
}

boot().catch((err) => {
  console.error('[nova] boot failed:', err);
  process.exit(1);
});
