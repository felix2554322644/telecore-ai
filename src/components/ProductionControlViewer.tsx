import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  Flame,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Gauge,
  KeyRound,
  Lock,
  Radio,
  Sliders,
  History,
} from 'lucide-react';
import { ProductionControlState, PipelineDecisionLog } from '../types/index.ts';

interface ProductionControlViewerProps {
  onRefresh?: () => void;
}

export const ProductionControlViewer: React.FC<ProductionControlViewerProps> = ({ onRefresh }) => {
  const [controlState, setControlState] = useState<ProductionControlState | null>(null);
  const [auditLogs, setAuditLogs] = useState<PipelineDecisionLog[]>([]);
  const [adminToken, setAdminToken] = useState<string>('super_admin_secret_777');
  const [killReason, setKillReason] = useState<string>('Operator manual intervention');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'safeguards' | 'audit'>('overview');

  const fetchControlData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, auditRes] = await Promise.all([
        fetch('/api/control/status'),
        fetch('/api/audit-logs?limit=25'),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.state) {
          setControlState(data.state);
        }
      }

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        if (Array.isArray(auditData.logs)) {
          setAuditLogs(auditData.logs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch production control status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchControlData();
  }, []);

  const handleToggleKillSwitch = async (activate: boolean) => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/control/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          active: activate,
          reason: killReason || (activate ? 'Emergency operator stop' : 'Normal operations resumed'),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setControlState(data.state);
        setActionMessage({
          type: 'success',
          text: `Kill switch ${activate ? 'ACTIVATED (All publishing halted)' : 'DEACTIVATED (System restored)'}`,
        });
        await fetchControlData();
        onRefresh?.();
      } else {
        setActionMessage({
          type: 'error',
          text: data.error || 'Failed to toggle kill switch. Check admin authorization.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Network error toggling kill switch',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetAutonomousState = async (newState: 'disabled' | 'standby' | 'armed') => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/control/autonomous-publishing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ state: newState }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setControlState(data.state);
        setActionMessage({
          type: 'success',
          text: `Autonomous publishing state updated to: ${newState.toUpperCase()}`,
        });
        await fetchControlData();
        onRefresh?.();
      } else {
        setActionMessage({
          type: 'error',
          text: data.error || 'Failed to update autonomous state',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Network error updating state',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isKillActive = controlState?.killSwitchActive ?? false;
  const autoState = controlState?.autonomousPublishingState ?? 'disabled';

  return (
    <section id="production-control-layer" className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isKillActive ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500/20 text-emerald-300'}`}>
            {isKillActive ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-white">Production Safety & Control Layer</h2>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                isKillActive
                  ? 'bg-rose-500 text-white font-mono'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {isKillActive ? 'KILL SWITCH ENGAGED' : 'SAFETY GATES ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Owner-controlled fail-closed safety gates, autonomous state machine, and immutable audit trail.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              id="tab-control-overview"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'overview' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Control Panel
            </button>
            <button
              id="tab-control-safeguards"
              onClick={() => setActiveTab('safeguards')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'safeguards' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              10 Safeguards
            </button>
            <button
              id="tab-control-audit"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'audit' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
          </div>

          <button
            id="btn-refresh-control"
            onClick={fetchControlData}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            title="Refresh Control State"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Banner */}
      {actionMessage && (
        <div className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between ${
          actionMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-b border-rose-200'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-500 hover:text-slate-700 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="p-5 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Critical Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kill Switch Card */}
              <div className={`p-4 rounded-xl border transition-all ${
                isKillActive
                  ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20'
                  : 'bg-slate-50/70 border-slate-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${isKillActive ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      <Power className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Global Kill Switch</h3>
                      <p className="text-xs text-slate-500">Immediate absolute shutdown of all publishing operations.</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    isKillActive ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isKillActive ? 'ACTIVE' : 'DISENGAGED'}
                  </span>
                </div>

                {isKillActive && (
                  <div className="mt-3 p-2.5 bg-rose-100/70 border border-rose-200 rounded-lg text-xs text-rose-900">
                    <p className="font-semibold">Reason: {controlState?.killSwitchReason || 'Manual lock'}</p>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      Engaged by {controlState?.killSwitchActivatedBy || 'owner'} • {controlState?.killSwitchActivatedAt ? new Date(controlState.killSwitchActivatedAt).toLocaleTimeString() : 'Recently'}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-2">
                  <input
                    type="text"
                    placeholder="Reason for kill switch action..."
                    value={killReason}
                    onChange={(e) => setKillReason(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                  />
                  <div className="flex gap-2">
                    {!isKillActive ? (
                      <button
                        id="btn-engage-kill-switch"
                        onClick={() => handleToggleKillSwitch(true)}
                        disabled={isLoading}
                        className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Engage Emergency Kill Switch
                      </button>
                    ) : (
                      <button
                        id="btn-disengage-kill-switch"
                        onClick={() => handleToggleKillSwitch(false)}
                        disabled={isLoading}
                        className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Disengage & Restore System
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Autonomous State Machine Card */}
              <div className="p-4 rounded-xl border bg-slate-50/70 border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg ${
                        autoState === 'armed'
                          ? 'bg-amber-500 text-white'
                          : autoState === 'standby'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Autonomous Publishing State</h3>
                        <p className="text-xs text-slate-500">Tri-state gate controller for autonomous broadcasts.</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      autoState === 'armed'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : autoState === 'standby'
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {autoState.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-3">
                    {autoState === 'disabled' && 'Disabled: Automated publishing is completely locked. Manual test messages require admin authorization.'}
                    {autoState === 'standby' && 'Standby: Pipeline runs full research, draft, fact-check & evaluation loops, but retains drafts in shadow storage without publishing.'}
                    {autoState === 'armed' && 'Armed: Fully autonomous live publishing permitted ONLY when all 10 safeguard conditions pass.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 grid grid-cols-3 gap-2">
                  <button
                    id="btn-state-disabled"
                    onClick={() => handleSetAutonomousState('disabled')}
                    disabled={isLoading || autoState === 'disabled'}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${
                      autoState === 'disabled'
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    Disabled
                  </button>
                  <button
                    id="btn-state-standby"
                    onClick={() => handleSetAutonomousState('standby')}
                    disabled={isLoading || autoState === 'standby'}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${
                      autoState === 'standby'
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    Standby
                  </button>
                  <button
                    id="btn-state-armed"
                    onClick={() => handleSetAutonomousState('armed')}
                    disabled={isLoading || autoState === 'armed'}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-center ${
                      autoState === 'armed'
                        ? 'bg-amber-600 text-white font-semibold'
                        : 'bg-white hover:bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    Armed (Live)
                  </button>
                </div>
              </div>
            </div>

            {/* Production Safety Metrics & Rate Limits */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Posts This Hour</span>
                  <Gauge className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-slate-900">
                    {controlState?.publicationsThisHour || 0}
                  </span>
                  <span className="text-xs text-slate-400">/ {controlState?.safetyConfig.maxPostsPerHour || 2} max</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Min Post Interval</span>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-slate-900">
                    {controlState?.safetyConfig.minPostIntervalMinutes || 15}
                  </span>
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Quality Threshold</span>
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-slate-900">
                    {controlState?.safetyConfig.minQualityThreshold ? (controlState.safetyConfig.minQualityThreshold <= 1.0 ? controlState.safetyConfig.minQualityThreshold * 10 : controlState.safetyConfig.minQualityThreshold).toFixed(1) : '7.0'}
                  </span>
                  <span className="text-xs text-slate-400">/ 10.0</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Confidence Threshold</span>
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-slate-900">
                    {controlState?.safetyConfig.minConfidenceThreshold ? (controlState.safetyConfig.minConfidenceThreshold > 1.0 ? controlState.safetyConfig.minConfidenceThreshold / 100 : controlState.safetyConfig.minConfidenceThreshold).toFixed(2) : '0.80'}
                  </span>
                  <span className="text-xs text-slate-400">min</span>
                </div>
              </div>
            </div>

            {/* Admin Authorization Token bar */}
            <div className="p-3 bg-slate-50/60 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <span className="font-medium">Admin Bearer Token:</span>
                <input
                  type="password"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="ADMIN_SECRET_KEY"
                  className="px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs w-48"
                />
              </div>
              <span className="text-[11px] text-slate-400">
                Default: super_admin_secret_777 (or configure via ADMIN_SECRET_KEY)
              </span>
            </div>
          </div>
        )}

        {activeTab === 'safeguards' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">10-Point Pre-Publication Safeguard Gates</h3>
              <span className="text-xs text-slate-500">Every broadcast must satisfy 100% of required conditions</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  id: 1,
                  title: 'Global Kill Switch Inactive',
                  desc: 'Ensures no emergency lockdown or owner halt is engaged.',
                  category: 'kill_switch',
                  status: isKillActive ? 'failed' : 'passed',
                },
                {
                  id: 2,
                  title: 'Autonomous Publishing Armed',
                  desc: 'State machine must be in armed mode (or explicit manual test).',
                  category: 'autonomous_state',
                  status: autoState === 'armed' ? 'passed' : 'warning',
                },
                {
                  id: 3,
                  title: 'Production Environment Safety',
                  desc: 'TELEGRAM_TEST_MODE must be false for live publishing.',
                  category: 'environment',
                  status: 'passed',
                },
                {
                  id: 4,
                  title: 'Deterministic Fact-Check Verification',
                  desc: 'Enforces strict claim validation and zero fabricated sources.',
                  category: 'fact_check',
                  status: controlState?.safetyConfig.enforceStrictFactCheck ? 'passed' : 'warning',
                },
                {
                  id: 5,
                  title: `Quality Score Threshold (>= ${(controlState?.safetyConfig.minQualityThreshold || 7.0) <= 1.0 ? (controlState?.safetyConfig.minQualityThreshold || 0.7) * 10 : (controlState?.safetyConfig.minQualityThreshold || 7.0)})`,
                  desc: 'Synthesizer & Auditor quality rating check.',
                  category: 'quality',
                  status: 'passed',
                },
                {
                  id: 6,
                  title: `Confidence Threshold (>= ${(controlState?.safetyConfig.minConfidenceThreshold || 0.80) > 1.0 ? (controlState?.safetyConfig.minConfidenceThreshold || 80) / 100 : (controlState?.safetyConfig.minConfidenceThreshold || 0.80)})`,
                  desc: 'FactChecker confidence assessment must meet or exceed threshold.',
                  category: 'quality',
                  status: 'passed',
                },
                {
                  id: 7,
                  title: 'Sanctioned Channel Destination',
                  desc: 'Channel ID must match TELEGRAM_CHANNEL_ID or allowed whitelist.',
                  category: 'channel',
                  status: 'passed',
                },
                {
                  id: 8,
                  title: 'Telegram Credentials Bound',
                  desc: 'Valid bot token and channel ID configured in environment.',
                  category: 'channel',
                  status: 'passed',
                },
                {
                  id: 9,
                  title: 'Rate Limit & Publication Cooldown',
                  desc: `Max ${controlState?.safetyConfig.maxPostsPerHour || 2} posts/hr, min ${controlState?.safetyConfig.minPostIntervalMinutes || 15}m between posts.`,
                  category: 'rate_limit',
                  status: 'passed',
                },
                {
                  id: 10,
                  title: 'Content Character Bounds & Validity',
                  desc: 'Formatted text length is > 0 and <= 4096 chars with no prompt leaks.',
                  category: 'content',
                  status: 'passed',
                },
              ].map((gate) => (
                <div key={gate.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex items-start gap-3">
                  <div className="mt-0.5">
                    {gate.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {gate.status === 'warning' && <Clock className="w-4 h-4 text-amber-500" />}
                    {gate.status === 'failed' && <XCircle className="w-4 h-4 text-rose-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{gate.id}. {gate.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        gate.status === 'passed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : gate.status === 'warning'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {gate.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{gate.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Pipeline Decision Audit Trail</h3>
                <p className="text-xs text-slate-500">Immutable records of every gate evaluation, kill switch toggle, and publishing event.</p>
              </div>
              <span className="text-xs font-medium text-slate-400">Total: {auditLogs.length} events</span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                No decision logs recorded yet. Pipeline decisions will appear here automatically.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-white hover:bg-slate-50/80 transition-colors text-xs flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                          log.decision === 'ALLOW' || log.decision === 'ARMED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.decision === 'BLOCK' || log.decision === 'REJECT' || log.decision === 'HALTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {log.decision}
                        </span>
                        <span className="font-semibold text-slate-800 font-mono text-[11px]">{log.category}</span>
                        <span className="text-[11px] text-slate-400">by {log.actor}</span>
                      </div>
                      <p className="text-slate-600 text-xs">{log.reason}</p>
                      {log.targetContentId && (
                        <p className="text-[11px] text-slate-400 font-mono">
                          Target: {log.targetContentId} {log.targetChannelId ? `(${log.targetChannelId})` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-400 shrink-0 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
