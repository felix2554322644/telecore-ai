import React from 'react';
import {
  LayoutDashboard,
  Send,
  ShieldCheck,
  Calendar,
  Users,
  AlertTriangle,
  BookOpen,
  Radio,
  Sparkles,
  Lock,
  RefreshCw,
  Bot,
} from 'lucide-react';
import { HealthReport, PublicConfig, Incident, ShadowCandidate } from '../types/index.ts';

export type TabId =
  | 'overview'
  | 'publishing'
  | 'safety'
  | 'scheduler'
  | 'agents'
  | 'incidents'
  | 'deployment';

interface SidebarNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  health: HealthReport | null;
  config: PublicConfig | null;
  candidates: ShadowCandidate[];
  incidents: Incident[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  health,
  config,
  candidates,
  incidents,
  isLoading,
  onRefresh,
}) => {
  const approvedUnpublishedCount = candidates.filter(
    (c) => c.status === 'approved' && !c.publishedAt
  ).length;

  const openIncidentsCount = incidents.filter(
    (i) => i.status === 'open' || i.status === 'in_progress'
  ).length;

  const isHealthy = health?.status === 'healthy';

  const navItems: Array<{
    id: TabId;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
    badgeColor?: string;
  }> = [
    {
      id: 'overview',
      label: 'Overview & Health',
      description: 'System KPIs, telemetry & health status',
      icon: LayoutDashboard,
    },
    {
      id: 'publishing',
      label: 'Controlled Publishing',
      description: 'One-click live Telegram dispatch',
      icon: Send,
      badge: approvedUnpublishedCount > 0 ? `${approvedUnpublishedCount} Ready` : undefined,
      badgeColor: 'bg-blue-600 text-white animate-pulse',
    },
    {
      id: 'safety',
      label: 'Safety & Production',
      description: 'Kill switch, caps & channel link',
      icon: ShieldCheck,
    },
    {
      id: 'scheduler',
      label: 'Scheduler & Feedback',
      description: 'Topic rotation & learning loops',
      icon: Calendar,
    },
    {
      id: 'agents',
      label: 'Agents & Pipeline',
      description: '7-agent core & event bus',
      icon: Users,
    },
    {
      id: 'incidents',
      label: 'Incidents & Healing',
      description: 'Audit trails & self-repair',
      icon: AlertTriangle,
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      id: 'deployment',
      label: 'Deployment & Guide',
      description: 'Cloudflare Workers & secrets setup',
      icon: BookOpen,
    },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between h-auto lg:h-[calc(100vh-4rem)] lg:sticky lg:top-16 shadow-sm rounded-2xl lg:rounded-none lg:shadow-none p-3 lg:p-4 my-3 lg:my-0">
      {/* Navigation Links */}
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-medium text-sm transition group ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs border border-blue-200/60'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-blue-600'
                        : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="truncate block">{item.label}</span>
                  </div>
                </div>

                {item.badge && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                      item.badgeColor || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer Info Card */}
      <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Channel:</span>
            <span className="font-semibold text-slate-800 truncate max-w-[120px]">
              {config?.telegramChannelId || '@techpluseai'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Mode:</span>
            <span
              className={`font-semibold ${
                config?.testMode !== false ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {config?.testMode !== false ? 'Test Safeguards' : 'Live Autonomous'}
            </span>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Refreshing...' : 'Refresh Telemetry'}</span>
        </button>
      </div>
    </aside>
  );
};
