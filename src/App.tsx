/**
 * Autonomous Telegram Channel Manager - Foundation Dashboard (Phase 14B)
 */

import React, { useEffect, useState } from 'react';
import { AgentDeck } from './components/AgentDeck.tsx';
import { CandidatesViewer } from './components/CandidatesViewer.tsx';
import { CloudflareGuide } from './components/CloudflareGuide.tsx';
import { ControlledPublishDashboard } from './components/ControlledPublishDashboard.tsx';
import { FeedbackViewer } from './components/FeedbackViewer.tsx';
import { HealthOverview } from './components/HealthOverview.tsx';
import { IncidentsViewer } from './components/IncidentsViewer.tsx';
import { OverviewCards } from './components/OverviewCards.tsx';
import { PipelineInspector } from './components/PipelineInspector.tsx';
import { ProductionControlViewer } from './components/ProductionControlViewer.tsx';
import { SchedulerViewer } from './components/SchedulerViewer.tsx';
import { SidebarNav, TabId } from './components/SidebarNav.tsx';
import { StatusHeader } from './components/StatusHeader.tsx';
import { TelegramManager } from './components/TelegramManager.tsx';
import {
  AgentMetadata,
  EventType,
  FeedbackLearningReport,
  HealthReport,
  Incident,
  PublicConfig,
  SchedulerStatus,
  ShadowCandidate,
} from './types/index.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [processedEventsCount, setProcessedEventsCount] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; type: EventType; timestamp: number }>>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [candidates, setCandidates] = useState<ShadowCandidate[]>([]);
  const [candidateStats, setCandidateStats] = useState<{ total: number; approved: number; rejected: number } | undefined>(undefined);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [feedbackReport, setFeedbackReport] = useState<FeedbackLearningReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [adminToken, setAdminTokenState] = useState<string>(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('telecore_admin_token') || '' : '';
  });

  const setAdminToken = (token: string) => {
    setAdminTokenState(token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('telecore_admin_token', token);
    }
  };

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

      // 3. Fetch Candidates (try public first, or authenticated if token present)
      try {
        const headers: Record<string, string> = {};
        if (adminToken.trim()) {
          headers['Authorization'] = `Bearer ${adminToken.trim()}`;
        }
        const endpoint = adminToken.trim() ? '/api/admin/candidates' : '/api/candidates';
        let candRes = await fetch(endpoint, { headers });
        if (!candRes.ok && adminToken.trim()) {
          // Fallback to public endpoint
          candRes = await fetch('/api/candidates');
        }
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

      // 6. Fetch Feedback Learning Report
      try {
        const fbRes = await fetch('/api/analytics/feedback');
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          if (fbData.report) {
            setFeedbackReport(fbData.report);
          }
        }
      } catch {
        // Fallback gracefully
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

  const handleRefreshFeedback = async () => {
    try {
      const res = await fetch('/api/analytics/feedback/refresh', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.report) {
        setFeedbackReport(data.report);
      }
      await fetchStatus();
    } catch (err) {
      console.error('Failed to refresh feedback report:', err);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased flex flex-col">
      {/* Top Bar / Header */}
      <StatusHeader
        health={health}
        config={config}
        isLoading={isLoading}
        onRefresh={fetchStatus}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        candidates={candidates}
        incidents={incidents}
      />

      {/* Main Layout: Responsive Sidebar + Content Area */}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col lg:flex-row gap-6 flex-1 items-start">
        {/* Desktop Sidebar Navigation */}
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          health={health}
          config={config}
          candidates={candidates}
          incidents={incidents}
          isLoading={isLoading}
          onRefresh={fetchStatus}
        />

        {/* Dynamic Main Content Pane */}
        <main className="flex-1 w-full min-w-0 space-y-6 pb-12">
          {/* TAB 1: OVERVIEW & SYSTEM HEALTH */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              <OverviewCards
                health={health}
                config={config}
                candidates={candidates}
                candidateStats={candidateStats}
                scheduler={scheduler}
                feedbackReport={feedbackReport}
                incidents={incidents}
                onNavigate={(tab) => setActiveTab(tab as TabId)}
                onTriggerScheduledCycle={handleTriggerScheduledCycle}
                isLoading={isLoading}
              />

              {/* Subsystem Health Cards */}
              <HealthOverview
                dependencies={health?.dependencies}
                config={config}
              />
            </div>
          )}

          {/* TAB 2: CONTROLLED PUBLISHING & CANDIDATES ARCHIVE */}
          {activeTab === 'publishing' && (
            <div className="space-y-6 animate-fadeIn">
              <ControlledPublishDashboard
                candidates={candidates}
                onRefresh={fetchStatus}
                defaultChannel={config?.telegramChannelId || '@techpluseai'}
                adminToken={adminToken}
                setAdminToken={setAdminToken}
                onTriggerShadowCycle={handleTriggerScheduledCycle}
              />

              <CandidatesViewer
                candidates={candidates}
                stats={candidateStats}
                onRefresh={fetchStatus}
              />
            </div>
          )}

          {/* TAB 3: SAFETY & PRODUCTION CONTROLS */}
          {activeTab === 'safety' && (
            <div className="space-y-6 animate-fadeIn">
              <ProductionControlViewer
                onRefresh={fetchStatus}
              />

              <TelegramManager
                config={config}
                onRefresh={fetchStatus}
              />
            </div>
          )}

          {/* TAB 4: INTELLIGENT SCHEDULER & FEEDBACK LOOP */}
          {activeTab === 'scheduler' && (
            <div className="space-y-6 animate-fadeIn">
              <SchedulerViewer
                scheduler={scheduler}
                onRefresh={fetchStatus}
                onTriggerCycle={handleTriggerScheduledCycle}
              />

              <FeedbackViewer
                report={feedbackReport}
                onRefreshFeedback={handleRefreshFeedback}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* TAB 5: 7-AGENT CORE & EVENT PIPELINE */}
          {activeTab === 'agents' && (
            <div className="space-y-6 animate-fadeIn">
              <AgentDeck agents={agents} />

              <PipelineInspector
                processedCount={processedEventsCount}
                recentEvents={recentEvents}
                onTriggerEvent={handleTriggerEvent}
              />
            </div>
          )}

          {/* TAB 6: INCIDENTS & SELF-HEALING REGISTRY */}
          {activeTab === 'incidents' && (
            <div className="space-y-6 animate-fadeIn">
              <IncidentsViewer
                incidents={incidents}
                onRefresh={fetchStatus}
              />
            </div>
          )}

          {/* TAB 7: CLOUDFLARE DEPLOYMENT & SECRETS GUIDE */}
          {activeTab === 'deployment' && (
            <div className="space-y-6 animate-fadeIn">
              <CloudflareGuide />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
