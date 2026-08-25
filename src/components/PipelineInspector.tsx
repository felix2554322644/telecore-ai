import { Play, Sparkles, Activity, Layers, CornerDownRight } from 'lucide-react';
import React, { useState } from 'react';
import { EventType } from '../types/index.ts';

interface PipelineInspectorProps {
  processedCount: number;
  recentEvents: Array<{ id: string; type: EventType; timestamp: number }>;
  onTriggerEvent: (type: EventType, payload?: unknown) => Promise<any>;
}

export const PipelineInspector: React.FC<PipelineInspectorProps> = ({
  processedCount,
  recentEvents,
  onTriggerEvent,
}) => {
  const [selectedEventType, setSelectedEventType] = useState<EventType>('research.requested');
  const [customTopic, setCustomTopic] = useState('Autonomous Cloudflare Worker Architecture');
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      let payload: unknown = {};
      if (selectedEventType === 'research.requested') {
        payload = {
          topic: customTopic,
          niche: 'AI + technology + automation',
          maxItems: 3,
        };
      } else if (selectedEventType === 'content.requested') {
        payload = {
          topic: customTopic,
          targetFormat: 'short_tip',
          editorialTone: 'Technology that matters, explained and made useful.',
        };
      } else if (selectedEventType === 'incident.created') {
        payload = {
          id: `sim_inc_${Date.now()}`,
          timestamp: Date.now(),
          component: 'SimulatedWorker',
          severity: 'medium',
          error: 'Transient connection timeout simulation',
          status: 'open',
          retryCount: 1,
        };
      }

      const result = await onTriggerEvent(selectedEventType, payload);
      setLastResult(result);
    } catch (err: any) {
      setLastResult({ error: err.message || 'Execution error' });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <section className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            Orchestrator Pipeline Simulator
          </h2>
          <p className="text-xs text-slate-500">
            Dispatch strongly-typed events to verify agent workflow transitions and incident triggers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <Activity className="h-4 w-4 text-emerald-500" />
          <span>Processed Events: <strong className="text-slate-900">{processedCount}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trigger Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Event Type
            </label>
            <select
              id="event-type-select"
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value as EventType)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="research.requested">research.requested (Researcher -&gt; Strategist)</option>
              <option value="content.requested">content.requested (Writer draft)</option>
              <option value="content.generated">content.generated (Fact Checker audit)</option>
              <option value="incident.created">incident.created (Repair Agent diagnosis)</option>
              <option value="system.health_checked">system.health_checked</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Topic / Context
            </label>
            <input
              id="event-topic-input"
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Edge AI Models, Telegram Bot Webhooks"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            id="dispatch-event-btn"
            onClick={handleExecute}
            disabled={isExecuting}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isExecuting ? (
              <span>Dispatching event...</span>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Dispatch Event to Orchestrator</span>
              </>
            )}
          </button>

          {lastResult && (
            <div className="mt-3 p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-48">
              <div className="flex items-center justify-between text-slate-400 mb-1 border-b border-slate-800 pb-1">
                <span>Dispatch Result</span>
                <Sparkles className="h-3 w-3 text-amber-400" />
              </div>
              <pre>{JSON.stringify(lastResult, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Live Event Stream */}
        <div className="lg:col-span-7 space-y-3">
          <h3 className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Recent Event Bus History</span>
            <span className="text-[10px] text-slate-400 font-mono">In-Memory Audit Buffer</span>
          </h3>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {recentEvents.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No events recorded yet. Click &ldquo;Dispatch Event&rdquo; to test.
              </div>
            ) : (
              recentEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CornerDownRight className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="font-mono font-medium text-slate-800 truncate">
                      {evt.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-slate-400">{evt.id}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
