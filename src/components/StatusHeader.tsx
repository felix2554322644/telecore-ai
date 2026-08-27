import React from 'react';
import { Bot, Radio, Lock, ShieldCheck, RefreshCw, LayoutDashboard, Send, Shield, Calendar, Users, AlertTriangle, BookOpen } from 'lucide-react';
import { HealthReport, PublicConfig, Incident, ShadowCandidate } from '../types/index.ts';
import { TabId } from './SidebarNav.tsx';

interface StatusHeaderProps {
  health: HealthReport | null;
  config: PublicConfig | null;
  isLoading: boolean;
  onRefresh: () => void;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  candidates?: ShadowCandidate[];
  incidents?: Incident[];
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({
  health,
  config,
  isLoading,
  onRefresh,
  activeTab,
  onSelectTab,
  candidates = [],
  incidents = [],
}) => {
  const isHealthy = health?.status === 'healthy';
  const isDegraded = health?.status === 'degraded';
  const isTestMode = config?.testMode !== false;

  const approvedUnpublishedCount = candidates.filter(
    (c) => c.status === 'approved' && !c.publishedAt
  ).length;

  const mobileTabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | string }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'publishing', label: 'Publishing', icon: Send, badge: approvedUnpublishedCount || undefined },
    { id: 'safety', label: 'Safety', icon: Shield },
    { id: 'scheduler', label: 'Scheduler', icon: Calendar },
    { id: 'agents', label: 'Agents', icon: Users },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
    { id: 'deployment', label: 'Guide', icon: BookOpen },
  ];

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Logo and Brand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Bot className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                  TeleCore AI
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                  v{config?.version || '0.1.0'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Autonomous Telegram Channel Management Platform
              </p>
            </div>
          </div>

          {/* Quick Refresh on mobile */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Status Indicators & Action Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Test Mode Safety Badge */}
          <div
            id="test-mode-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isTestMode
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <Lock className="h-3 w-3 text-amber-600" />
            <span>
              {isTestMode ? 'Test Mode Active' : 'Live Autonomous Mode'}
            </span>
          </div>

          {/* Status Badge */}
          <div
            id="system-status-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
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
                : 'Online'}
            </span>
          </div>

          {/* Refresh button on desktop */}
          <button
            id="refresh-status-btn"
            onClick={onRefresh}
            disabled={isLoading}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Checking...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Mobile / Tablet Navigation Pill Bar */}
      <div className="lg:hidden px-4 pb-2.5 pt-1 overflow-x-auto border-t border-slate-100 flex items-center gap-1.5 no-scrollbar">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
