import { Cloud, Key, Terminal, ArrowRight, ExternalLink } from 'lucide-react';
import React from 'react';

export const CloudflareGuide: React.FC = () => {
  return (
    <section className="p-5 rounded-2xl border border-slate-200 bg-slate-900 text-slate-100 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cloud className="h-5 w-5 text-sky-400" />
            Cloudflare Workers Production Deployment &amp; Setup Guide
          </h2>
          <p className="text-xs text-slate-400">
            Engineered for $0/month free tier with zero ongoing server costs.
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
          Wrangler Ready
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Step 1 */}
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold">
            <span className="h-5 w-5 rounded-full bg-sky-900/80 border border-sky-700 text-sky-300 flex items-center justify-center text-[10px]">
              1
            </span>
            Configure Secrets
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Store API tokens securely using Cloudflare Wrangler CLI (never hardcode in code or repo):
          </p>
          <pre className="p-2 rounded bg-slate-950 text-[10px] font-mono text-emerald-400 overflow-x-auto">
{`wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put ADMIN_SECRET
wrangler secret put TELEGRAM_CHANNEL_ID`}
          </pre>
        </div>

        {/* Step 2 */}
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold">
            <span className="h-5 w-5 rounded-full bg-sky-900/80 border border-sky-700 text-sky-300 flex items-center justify-center text-[10px]">
              2
            </span>
            Deploy Worker
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Deploy the single modular worker to Cloudflare global edge network:
          </p>
          <pre className="p-2 rounded bg-slate-950 text-[10px] font-mono text-emerald-400 overflow-x-auto">
{`npm run test
npm run build
wrangler deploy`}
          </pre>
        </div>

        {/* Step 3 */}
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold">
            <span className="h-5 w-5 rounded-full bg-sky-900/80 border border-sky-700 text-sky-300 flex items-center justify-center text-[10px]">
              3
            </span>
            Set Webhook
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Register your worker endpoint with Telegram Bot API:
          </p>
          <pre className="p-2 rounded bg-slate-950 text-[10px] font-mono text-emerald-400 overflow-x-auto">
{`curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \\
  -d "url=https://<WORKER_URL>/webhooks/telegram" \\
  -d "secret_token=<WEBHOOK_SECRET>"`}
          </pre>
        </div>
      </div>
    </section>
  );
};
