import { Calendar, CheckCircle2, Clock, Filter, RefreshCw, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { SchedulerStatus } from '../types/index.ts';

interface SchedulerViewerProps {
  scheduler?: SchedulerStatus | null;
  onRefresh?: () => void;
  onTriggerCycle?: () => Promise<any>;
}

export const SchedulerViewer: React.FC<SchedulerViewerProps> = ({
  scheduler,
  onRefresh,
  onTriggerCycle,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastCycleResult, setLastCycleResult] = useState<any>(null);

  const handleRunNow = async () => {
    if (!onTriggerCycle) return;
    setIsRunning(true);
    try {
      const res = await onTriggerCycle();
      setLastCycleResult(res);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setLastCycleResult({ ok: false, error: err.message || 'Execution failed' });
    } finally {
      setIsRunning(false);
    }
  };

  const activeCategory = scheduler?.activeCategory || 'Autonomous Agent Architectures';
  const nextCategory = scheduler?.nextCategory || 'Edge LLM Inference';
  const totalCycles = scheduler?.totalCycles || 0;
  const successfulCycles = scheduler?.successfulCycles || 0;
  const failedCycles = scheduler?.failedCycles || 0;
  const recentCycles = scheduler?.recentCycles || [];
  const avoidedCount = scheduler?.avoidedTopicsCount || 0;
  const clusters = scheduler?.clusters || [];

  return (
    <section className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Intelligent Topic Scheduler</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              Phase 11: Feedback-Guided Rotation
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Autonomous cluster rotation biased by learned quality feedback, similarity avoidance & dynamic AI topic generation (Shadow Mode).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          )}

          {onTriggerCycle && (
            <button
              onClick={handleRunNow}
              disabled={isRunning}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Zap className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Executing Cycle...' : 'Run Scheduled Cycle'}
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs font-medium text-slate-500">Active Cluster</p>
          <p className="text-sm font-semibold text-slate-800 mt-1 truncate" title={activeCategory}>
            {activeCategory}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">Next: {nextCategory}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs font-medium text-slate-500">Total Cycles</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{totalCycles}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">{successfulCycles} successful</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs font-medium text-slate-500">Avoidance Pool</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{avoidedCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Recent topics guarded</p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs font-medium text-slate-500">Last Execution</p>
          <p className="text-sm font-semibold text-slate-800 mt-1">
            {scheduler?.lastScheduledAt ? new Date(scheduler.lastScheduledAt).toLocaleTimeString() : 'Never'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {scheduler?.lastScheduledAt ? new Date(scheduler.lastScheduledAt).toLocaleDateString() : 'Awaiting cron'}
          </p>
        </div>
      </div>

      {/* Last execution alert / result */}
      {lastCycleResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
            lastCycleResult.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1.5">
              {lastCycleResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
              {lastCycleResult.ok ? 'Cycle Trigger Succeeded (Shadow Mode)' : 'Cycle Trigger Failed'}
            </span>
            <span className="text-[10px] opacity-75">{new Date().toLocaleTimeString()}</span>
          </div>
          {lastCycleResult.topic && (
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">Topic:</span> "{lastCycleResult.topic}"
              {lastCycleResult.category && <span className="ml-2 px-1.5 py-0.5 rounded bg-white/60 text-[10px] font-mono">{lastCycleResult.category}</span>}
            </p>
          )}
          {lastCycleResult.message && <p className="text-[11px] opacity-90">{lastCycleResult.message}</p>}
        </div>
      )}

      {/* Curated Technical Topic Clusters */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          Configured Technical Topic Rotation Clusters ({clusters.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {clusters.map((cluster, idx) => {
            const isActive = cluster.name === activeCategory;
            return (
              <div
                key={cluster.id}
                className={`p-3 rounded-xl border transition-all text-xs ${
                  isActive
                    ? 'border-indigo-300 bg-indigo-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-medium text-slate-800 truncate" title={cluster.name}>
                    {idx + 1}. {cluster.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {cluster.learnedWeight !== undefined && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200" title="Learned dynamic weight">
                        {cluster.learnedWeight}x
                      </span>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white">
                        Active
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{cluster.topicCount} curated topics</span>
                  <span>•</span>
                  <span className="font-mono text-[10px]">id: {cluster.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Scheduled Run History */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          Recent Scheduled Cycle History
        </h3>

        {recentCycles.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
            No scheduled cycles executed yet. Cron trigger or manual run will populate rotation history.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {recentCycles.map((cycle) => (
              <div key={cycle.cycleId} className="p-3 bg-white hover:bg-slate-50 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 truncate">"{cycle.topic}"</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {cycle.category}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        cycle.source === 'gemini_dynamic'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : cycle.source === 'cluster_rotation'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {cycle.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span>{new Date(cycle.timestamp).toLocaleTimeString()}</span>
                    {cycle.durationMs && <span>{cycle.durationMs}ms</span>}
                    {cycle.rejectionReason && (
                      <span className="text-amber-600 truncate" title={cycle.rejectionReason}>
                        Note: {cycle.rejectionReason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      cycle.status === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : cycle.status === 'filtered'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {cycle.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
