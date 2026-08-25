import { AlertOctagon, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import React from 'react';
import { Incident } from '../types/index.ts';

interface IncidentsViewerProps {
  incidents: Incident[];
  onRefresh: () => void;
}

export const IncidentsViewer: React.FC<IncidentsViewerProps> = ({ incidents, onRefresh }) => {
  return (
    <section className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            Incident Registry &amp; Self-Healing Telemetry
          </h2>
          <p className="text-xs text-slate-500">
            Automated tracking of operational errors and diagnostic proposals for future self-repair.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1 rounded bg-slate-100 border border-slate-200"
        >
          Refresh Incidents
        </button>
      </div>

      {incidents.length === 0 ? (
        <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <h3 className="text-xs font-semibold text-emerald-900">Zero Open Incidents</h3>
            <p className="text-xs text-emerald-700 mt-0.5">
              All subsystems are operating normally with no recorded errors.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition space-y-2"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      inc.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : inc.severity === 'high'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {inc.severity}
                  </span>
                  <span className="text-xs font-semibold text-slate-900">{inc.component}</span>
                  <span className="text-[10px] font-mono text-slate-400">({inc.id})</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{new Date(inc.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              <p className="text-xs text-slate-700 font-mono bg-white p-2 rounded border border-slate-200 break-words">
                {inc.error}
              </p>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Status: <strong className="capitalize text-slate-800">{inc.status}</strong></span>
                <span>Retry Count: {inc.retryCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
