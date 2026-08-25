/**
 * Local Development Server & Preview Bridge
 * Binds port 3000 and bridges Cloudflare Worker handler with Vite frontend
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import worker from './src/index.ts';
import { Env } from './src/types/index.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Raw and JSON body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Environment bindings bridge
  const env: Env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    TELEGRAM_CHANNEL_ID: process.env.TELEGRAM_CHANNEL_ID,
    ADMIN_SECRET: process.env.ADMIN_SECRET,
    ENVIRONMENT: (process.env.ENVIRONMENT as Env['ENVIRONMENT']) || 'development',
    LOG_LEVEL: (process.env.LOG_LEVEL as Env['LOG_LEVEL']) || 'info',
    APP_URL: process.env.APP_URL || `http://localhost:${PORT}`,
    TELEGRAM_TEST_MODE: process.env.TELEGRAM_TEST_MODE || 'true',
  };

  // Bridge Express requests to the Cloudflare Worker fetch handler for API and webhook routes
  app.all(['/health', '/api/*', '/webhooks/*'], async (req, res) => {
    try {
      const fullUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}${req.originalUrl}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      const requestInit: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        requestInit.body = JSON.stringify(req.body);
      }

      const workerRequest = new Request(fullUrl, requestInit);
      const workerResponse = await worker.fetch(workerRequest, env);

      res.status(workerResponse.status);
      workerResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const responseBody = await workerResponse.text();
      res.send(responseBody);
    } catch (err) {
      console.error('[Server Bridge Error]', err);
      res.status(500).json({ error: { message: 'Worker bridge error', code: 'BRIDGE_ERROR' } });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Autonomous Telegram Channel Manager server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
