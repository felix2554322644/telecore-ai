import {
  Brain,
  Compass,
  FileEdit,
  CheckCircle,
  Send,
  BarChart3,
  Wrench,
  Lock,
  Cpu,
} from 'lucide-react';
import React from 'react';
import { AgentMetadata } from '../types/index.ts';

interface AgentDeckProps {
  agents: AgentMetadata[];
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  researcher: <Brain className="h-5 w-5 text-indigo-600" />,
  strategist: <Compass className="h-5 w-5 text-sky-600" />,
  writer: <FileEdit className="h-5 w-5 text-violet-600" />,
  factChecker: <CheckCircle className="h-5 w-5 text-emerald-600" />,
  publisher: <Send className="h-5 w-5 text-blue-600" />,
  analyst: <BarChart3 className="h-5 w-5 text-amber-600" />,
  repairAgent: <Wrench className="h-5 w-5 text-rose-600" />,
};

export const AgentDeck: React.FC<AgentDeckProps> = ({ agents }) => {
  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-slate-700" />
            Autonomous Agent Registry
          </h2>
          <p className="text-xs text-slate-500">
            7 modular specialized agents ready for event orchestration and targeted AI delegation.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md border border-slate-200 self-start sm:self-auto font-mono">
          All Agents: Foundation Standby
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.name}
            id={`agent-card-${agent.role}`}
            className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                  {AGENT_ICONS[agent.role] || <Brain className="h-5 w-5 text-slate-600" />}
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  {agent.status}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-slate-900">{agent.name}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5 capitalize">{agent.role}</p>

              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {agent.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 font-medium">
                <Lock className="h-3 w-3 text-slate-400" />
                Permission-Bounded
              </span>
              <span className="text-[10px] text-slate-400">v{agent.version}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
