import { CheckCircle2, AlertCircle, Database, MessageSquare, Sparkles, Shield } from 'lucide-react';
import React from 'react';
import { DependencyHealth, PublicConfig } from '../types/index.ts';

interface HealthOverviewProps {
  dependencies: Record<string, DependencyHealth> | undefined;
  config: PublicConfig | null;
}

export const HealthOverview: React.FC<HealthOverviewProps> = ({ dependencies, config }) => {
  const depsList = dependencies ? Object.values(dependencies) : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Storage Card */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Database className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            Active
          </span>
        </div>
        <h3 className="text-xs font-semibold text-slate-800 mt-3">Storage Abstraction</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {dependencies?.storage?.message || 'In-Memory Adapter / Cloudflare KV Ready'}
        </p>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Latency</span>
          <span>{dependencies?.storage?.latencyMs !== undefined ? `${dependencies.storage.latencyMs}ms` : '0ms'}</span>
        </div>
      </div>

      {/* Telegram Card */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
              config?.telegramConfigured
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {config?.telegramConfigured ? 'Connected' : 'Standby'}
          </span>
        </div>
        <h3 className="text-xs font-semibold text-slate-800 mt-3">Telegram Bot API</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {config?.telegramConfigured
            ? 'Bot token configured and ready'
            : 'Pending TELEGRAM_BOT_TOKEN binding'}
        </p>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Webhook Endpoint</span>
          <span className="font-mono">/webhooks/telegram</span>
        </div>
      </div>

      {/* Gemini AI Card */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
              config?.geminiConfigured
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {config?.geminiConfigured ? 'Configured' : 'Standby'}
          </span>
        </div>
        <h3 className="text-xs font-semibold text-slate-800 mt-3">Gemini AI Service</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {config?.geminiConfigured
            ? 'Server-side @google/genai initialized'
            : 'Pending GEMINI_API_KEY binding'}
        </p>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Model Architecture</span>
          <span>gemini-3.7-flash</span>
        </div>
      </div>

      {/* Security & Isolation Card */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <Shield className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            Enforced
          </span>
        </div>
        <h3 className="text-xs font-semibold text-slate-800 mt-3">Security Boundaries</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          No arbitrary code execution, secret values redacted in all logs and outputs.
        </p>
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Environment</span>
          <span className="font-mono">{config?.environment || 'development'}</span>
        </div>
      </div>
    </div>
  );
};
