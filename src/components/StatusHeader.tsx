import { Bot, CheckCircle2, AlertTriangle, ShieldCheck, Radio, Lock } from 'lucide-react';
import React from 'react';
import { HealthReport, PublicConfig } from '../types/index.ts';

interface StatusHeaderProps {
  health: HealthReport | null;
  config: PublicConfig | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({
  health,
  config,
  isLoading,
  onRefresh,
}) => {
  const isHealthy = health?.status === 'healthy';
  const isDegraded = health?.status === 'degraded';
  const isTestMode = config?.testMode !== false;

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <Bot className="h-6 w-6 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                TeleCore AI
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                v{config?.version || '0.1.0'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Editorial: &ldquo;Technology that matters, explained and made useful.&rdquo;
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Test Mode Safety Badge */}
          <div
            id="test-mode-badge"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isTestMode
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <Lock className="h-3 w-3 text-amber-600" />
            <span>
              {isTestMode ? 'Test Mode: Active (Autonomous publishing blocked)' : 'Live Mode (Autonomous publishing enabled)'}
            </span>
          </div>

          {/* Status Badge */}
          <div
            id="system-status-badge"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isHealthy
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : isDegraded
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <Radio className={`h-3 w-3 ${isHealthy ? 'animate-pulse text-emerald-500' : 'text-amber-500'}`} />
            <span>
              {isLoading
                ? 'Evaluating...'
                : health
                ? `System ${health.status.toUpperCase()}`
                : 'Connecting...'}
            </span>
          </div>

          {/* Security Indicator */}
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-700 border border-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Zero-Leak Secrets Enforced</span>
          </div>

          <button
            id="refresh-status-btn"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1"
          >
            {isLoading ? 'Checking...' : 'Refresh Telemetry'}
          </button>
        </div>
      </div>
    </header>
  );
};
