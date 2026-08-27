import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { Env } from '../src/types/index.ts';

describe('Cloudflare Worker Static Assets & React Dashboard Delivery', () => {
  let storage: InMemoryStorageAdapter;
  let mockAssetsFetcher: { fetch: ReturnType<typeof vi.fn> };
  let baseEnv: Env & { __STORAGE__?: any; ASSETS?: any };

  const mockIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>TeleCore AI - Autonomous Telegram Channel Manager</title>
    <script type="module" crossorigin src="/assets/index-BXphrxOx.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-BMY10u2p.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();

    mockAssetsFetcher = {
      fetch: vi.fn(async (requestInput: Request | string) => {
        const reqUrl = typeof requestInput === 'string' ? requestInput : requestInput.url;
        const parsed = new URL(reqUrl, 'https://telecore-ai.workers.dev');

        if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
          return new Response(mockIndexHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }

        if (parsed.pathname === '/assets/index-BXphrxOx.js') {
          return new Response('console.log("react app bundle");', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          });
        }

        if (parsed.pathname === '/assets/index-BMY10u2p.css') {
          return new Response('body { background: #0f172a; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css; charset=utf-8' },
          });
        }

        return new Response('Not Found', { status: 404 });
      }),
    };

    baseEnv = {
      TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      TELEGRAM_WEBHOOK_SECRET: 'webhook_sec_123',
      GEMINI_API_KEY: 'test_gemini_key',
      TELEGRAM_CHANNEL_ID: '@techpluseai',
      ADMIN_SECRET: 'super_admin_secret_456',
      ENVIRONMENT: 'production',
      APP_URL: 'https://telecore-ai.workers.dev',
      TELEGRAM_TEST_MODE: 'true',
      __STORAGE__: storage as any,
      ASSETS: mockAssetsFetcher,
    };
  });

  it('1. GET / on Cloudflare Worker delivers the compiled React dashboard HTML via ASSETS binding', async () => {
    const request = new Request('https://telecore-ai.workers.dev/', {
      method: 'GET',
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('TeleCore AI - Autonomous Telegram Channel Manager');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('/assets/index-BXphrxOx.js');
    expect(mockAssetsFetcher.fetch).toHaveBeenCalled();
  });

  it('2. GET /assets/* static JS and CSS files are served directly through ASSETS binding', async () => {
    const jsRequest = new Request('https://telecore-ai.workers.dev/assets/index-BXphrxOx.js', {
      method: 'GET',
    });
    const jsResponse = await worker.fetch(jsRequest, baseEnv);
    expect(jsResponse.status).toBe(200);
    expect(jsResponse.headers.get('Content-Type')).toContain('application/javascript');
    expect(await jsResponse.text()).toContain('react app bundle');

    const cssRequest = new Request('https://telecore-ai.workers.dev/assets/index-BMY10u2p.css', {
      method: 'GET',
    });
    const cssResponse = await worker.fetch(cssRequest, baseEnv);
    expect(cssResponse.status).toBe(200);
    expect(cssResponse.headers.get('Content-Type')).toContain('text/css');
  });

  it('3. Client-side SPA routes fallback to index.html for browser navigation', async () => {
    const clientNavRequest = new Request('https://telecore-ai.workers.dev/candidates/view', {
      method: 'GET',
    });

    const response = await worker.fetch(clientNavRequest, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('<div id="root"></div>');
  });

  it('4. API routes (e.g. GET /api/status, GET /health) continue to execute Worker handlers and do not route to ASSETS', async () => {
    const apiRequest = new Request('https://telecore-ai.workers.dev/api/status', {
      method: 'GET',
    });

    const response = await worker.fetch(apiRequest, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const data = await response.json();
    expect(data.system.name).toBe('TeleCore AI');
    // ASSETS fetcher should NOT have been invoked for /api/status
    expect(mockAssetsFetcher.fetch).not.toHaveBeenCalled();
  });

  it('5. GET /api returns the API catalog JSON', async () => {
    const catalogRequest = new Request('https://telecore-ai.workers.dev/api', {
      method: 'GET',
    });

    const response = await worker.fetch(catalogRequest, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const data = await response.json();
    expect(data.service).toContain('TeleCore AI');
    expect(data.endpoints).toBeDefined();
    expect(data.endpoints).toContain('GET  /api/status');
  });

  it('6. Fallback serves HTML when ASSETS binding is not provided', async () => {
    const noAssetsEnv = { ...baseEnv, ASSETS: undefined };
    const request = new Request('https://telecore-ai.workers.dev/', {
      method: 'GET',
    });

    const response = await worker.fetch(request, noAssetsEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('TeleCore AI');
    expect(html).toContain('<div id="root">');
  });
});
