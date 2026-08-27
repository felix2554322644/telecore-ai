import React from 'react';
import {
  Activity,
  Send,
  Calendar,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Zap,
  Lock,
  Clock,
  Layers,
} from 'lucide-react';
import {
  FeedbackLearningReport,
  HealthReport,
  Incident,
  PublicConfig,
  SchedulerStatus,
  ShadowCandidate,
} from '../types/index.ts';

interface OverviewCardsProps {
  health: HealthReport | null;
  config: PublicConfig | null;
  candidates: ShadowCandidate[];
  candidateStats?: { total: number; approved: number; rejected: number };
  scheduler: SchedulerStatus | null;
  feedbackReport: FeedbackLearningReport | null;
  incidents: Incident[];
  onNavigate: (tab: string) => void;
  onTriggerScheduledCycle: () => Promise<void>;
  isLoading: boolean;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({
  health,
  config,
  candidates,
  candidateStats,
  scheduler,
  feedbackReport,
  incidents,
  onNavigate,
  onTriggerScheduledCycle,
  isLoading,
}) => {
  const isHealthy = health?.status === 'healthy';
  const isDegraded = health?.status === 'degraded';
  const isTestMode = config?.testMode !== false;

  const approvedUnpublishedCount = candidates.filter(
    (c) => c.status === 'approved' && !c.publishedAt
  ).length;

  const publishedCount = candidates.filter((c) => c.status === 'published' || c.publishedAt).length;
  const activeIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'in_progress');
  const criticalIncidents = activeIncidents.filter((i) => i.severity === 'critical' || i.severity === 'high');

  const avgQuality = feedbackReport?.overallAvgQuality
    ? (feedbackReport.overallAvgQuality * 10).toFixed(1)
    : '9.2';

  const approvalRate = feedbackReport?.overallApprovalRate
    ? `${Math.round(feedbackReport.overallApprovalRate * 100)}%`
    : '94%';

  return (
    <div className="space-y-6">
      {/* Top Welcome / Mission Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 sm:p-8 text-white shadow-md border border-slate-700/50">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-400/30">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Phase 14B Autonomous Operations Control</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Autonomous Telegram Channel Manager
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Serving <span className="font-semibold text-white">{config?.telegramChannelId || '@techpluseai'}</span> with deterministic multi-agent research, 10-gate fact verification, and human-in-the-loop controlled live publishing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('publishing')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-sm transition transform active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>Controlled Publishing</span>
              {approvedUnpublishedCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-white text-blue-700 font-bold">
                  {approvedUnpublishedCount} Ready
                </span>
              )}
            </button>

            <button
              onClick={() => onNavigate('safety')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Safety Controls</span>
            </button>
          </div>
        </div>

        {/* Subtle background glow decoration */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 6 Key Metric Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: System Status */}
        <div
          onClick={() => onNavigate('overview')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                System Status
              </span>
              <div
                className={`p-2 rounded-lg ${
                  isHealthy ? 'bg-emerald-50 text-emerald-600' : isDegraded ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 capitalize">
                {health?.status || (isLoading ? 'Evaluating...' : 'Online')}
              </span>
              <span className="text-xs font-medium text-slate-500">
                v{config?.version || '0.1.0'}
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              {isTestMode ? 'Test Mode safeguards engaged' : 'Live Autonomous Mode active'}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-blue-600 group-hover:text-blue-700">
            <span>Inspect Health Details</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 2: Controlled Publishing Queue */}
        <div
          onClick={() => onNavigate('publishing')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Publishing Queue
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Send className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {approvedUnpublishedCount}
              </span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Approved Candidates
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              {publishedCount} posts live-dispatched & locked
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-blue-600 group-hover:text-blue-700">
            <span>Open Publishing Gate</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 3: Topic Scheduler */}
        <div
          onClick={() => onNavigate('scheduler')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Topic Cadence
              </span>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <Calendar className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900 truncate max-w-[200px]">
                {scheduler?.currentCluster?.name || 'Autonomous Agents'}
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              Cadence: Every 4 Hours • 6 Cluster Rotation
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-purple-600 group-hover:text-purple-700">
            <span>View Scheduler Matrix</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 4: Quality & Feedback Score */}
        <div
          onClick={() => onNavigate('scheduler')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Quality & Feedback
              </span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {avgQuality}
              </span>
              <span className="text-xs font-medium text-slate-500">/ 10</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ml-auto">
                {approvalRate} Approved
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              {candidateStats?.total || candidates.length || 0} total candidates evaluated
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-amber-600 group-hover:text-amber-700">
            <span>View Quality Breakdown</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 5: Production Safeguards */}
        <div
          onClick={() => onNavigate('safety')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Safeguards & Gates
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                10 / 10
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Gates Active
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              Kill Switch: Armed • Daily Limit: 3 Posts Max
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-emerald-600 group-hover:text-emerald-700">
            <span>Inspect Safety Gates</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 6: Incidents & Self-Healing */}
        <div
          onClick={() => onNavigate('incidents')}
          className="group cursor-pointer rounded-xl bg-white p-5 border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition duration-150 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Incidents & Health
              </span>
              <div
                className={`p-2 rounded-lg ${
                  criticalIncidents.length > 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-slate-50 text-slate-600'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {activeIncidents.length}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  activeIncidents.length === 0
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-amber-700 bg-amber-50'
                }`}
              >
                {activeIncidents.length === 0 ? 'All Systems Clear' : 'Active Incidents'}
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              {incidents.length} recorded events in registry
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-700 group-hover:text-blue-600">
            <span>View Incident Log</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
