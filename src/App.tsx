/**
 * Autonomous Telegram Channel Manager - Foundation Dashboard
 */

import React, { useEffect, useState } from 'react';
import { AgentDeck } from './components/AgentDeck.tsx';
import { CandidatesViewer } from './components/CandidatesViewer.tsx';
import { CloudflareGuide } from './components/CloudflareGuide.tsx';
import { HealthOverview } from './components/HealthOverview.tsx';
import { IncidentsViewer } from './components/IncidentsViewer.tsx';
import { PipelineInspector } from './components/PipelineInspector.tsx';
import { SchedulerViewer } from './components/SchedulerViewer.tsx';
import { StatusHeader } from './components/StatusHeader.tsx';
import { TelegramManager } from './components/TelegramManager.tsx';
import {
  AgentMetadata,
  EventType,
  HealthReport,
  Incident,
  PublicConfig,
  SchedulerStatus,
  ShadowCandidate,
} from './types/index.ts';

export default function App() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [processedEventsCount, setProcessedEventsCount] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; type: EventType; timestamp: number }>>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [candidates, setCandidates] = useState<ShadowCandidate[]>([]);
  const [candidateStats, setCandidateStats] = useState<{ total: number; approved: number; rejected: number } | undefined>(undefined);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Health
      const healthRes = await fetch('/health');
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as HealthReport;
        setHealth(healthData);
      }

      // 2. Fetch Status
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setConfig(statusData.config);
        if (statusData.orchestrator) {
          setAgents(statusData.orchestrator.activeAgents || []);
          setProcessedEventsCount(statusData.orchestrator.processedEventsCount || 0);
          setRecentEvents(statusData.orchestrator.recentEvents || []);
        }
        if (Array.isArray(statusData.incidents)) {
          setIncidents(statusData.incidents);
        }
        if (statusData.candidates?.stats) {
          setCandidateStats(statusData.candidates.stats);
        }
        if (statusData.scheduler) {
          setScheduler(statusData.scheduler);
        }
      }

      // 3. Fetch Candidates
      try {
        const candRes = await fetch('/api/candidates');
        if (candRes.ok) {
          const candData = await candRes.json();
          if (Array.isArray(candData.candidates)) {
            setCandidates(candData.candidates);
          }
          if (candData.stats) {
            setCandidateStats(candData.stats);
          }
        }
      } catch {
        // Fallback gracefully
      }

      // 4. Fetch Incidents
      try {
        const incRes = await fetch('/api/incidents');
        if (incRes.ok) {
          const incData = await incRes.json();
          if (Array.isArray(incData.incidents)) {
            setIncidents(incData.incidents);
          }
        }
      } catch {
        // Keep incidents from /api/status if direct call fails
      }

      // 5. Fetch Scheduler status directly if not present
      try {
        const schedRes = await fetch('/api/scheduler');
        if (schedRes.ok) {
          const schedData = await schedRes.json();
          if (schedData.scheduler) {
            setScheduler(schedData.scheduler);
          }
        }
      } catch {
        // Keep scheduler from /api/status
      }
    } catch (err) {
      console.error('Failed to fetch system telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTriggerEvent = async (type: EventType, payload?: unknown) => {
    try {
      const res = await fetch('/api/test/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventType: type, payload }),
      });

      const data = await res.json();
      await fetchStatus();
      return data;
    } catch (err) {
      console.error('Failed to trigger event:', err);
      throw err;
    }
  };

  const handleTriggerScheduledCycle = async () => {
    try {
      const res = await fetch('/api/scheduler/run', {
        method: 'POST',
      });
      const data = await res.json();
      await fetchStatus();
      return data;
    } catch (err) {
      console.error('Failed to trigger scheduled cycle:', err);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-900 font-sans antialiased pb-16">
      {/* Top Bar / Header */}
      <StatusHeader
        health={health}
        config={config}
        isLoading={isLoading}
        onRefresh={fetchStatus}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Core Subsystem Health Cards */}
        <HealthOverview
          dependencies={health?.dependencies}
          config={config}
        />

        {/* Intelligent Topic Scheduler & Cluster Rotation */}
        <SchedulerViewer
          scheduler={scheduler}
          onRefresh={fetchStatus}
          onTriggerCycle={handleTriggerScheduledCycle}
        />

        {/* Telegram Integration & Controlled Test Publisher */}
        <TelegramManager
          config={config}
          onRefresh={fetchStatus}
        />

        {/* Autonomous Shadow Mode Candidates */}
        <CandidatesViewer
          candidates={candidates}
          stats={candidateStats}
          onRefresh={fetchStatus}
        />

        {/* 7 Core Foundation Agents */}
        <AgentDeck agents={agents} />

        {/* Orchestrator Event Bus Inspector & Simulator */}
        <PipelineInspector
          processedCount={processedEventsCount}
          recentEvents={recentEvents}
          onTriggerEvent={handleTriggerEvent}
        />

        {/* Incident Management & Self-Healing Registry */}
        <IncidentsViewer
          incidents={incidents}
          onRefresh={fetchStatus}
        />

        {/* Cloudflare Workers Deployment & Secrets Guide */}
        <CloudflareGuide />
      </main>
    </div>
  );
}
