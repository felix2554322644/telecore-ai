import { describe, expect, it, vi } from 'vitest';
import { IncidentManager } from '../src/health/incidents.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';

describe('Orchestrator', () => {
  it('should initialize and register all 7 core foundation agents', () => {
    const storage = new InMemoryStorageAdapter();
    const incidentMgr = new IncidentManager(storage);
    const orchestrator = new Orchestrator(undefined, incidentMgr);

    const status = orchestrator.getStatus();
    expect(status.activeAgents.length).toBe(7);

    const agentRoles = status.activeAgents.map((a) => a.role);
    expect(agentRoles).toContain('researcher');
    expect(agentRoles).toContain('strategist');
    expect(agentRoles).toContain('writer');
    expect(agentRoles).toContain('factChecker');
    expect(agentRoles).toContain('publisher');
    expect(agentRoles).toContain('analyst');
    expect(agentRoles).toContain('repairAgent');
  });

  it('should publish events and invoke subscribed handlers', async () => {
    const orchestrator = new Orchestrator();
    const customHandler = vi.fn();

    const unsubscribe = orchestrator.subscribe('content.generated', customHandler);

    const event = await orchestrator.publish('content.generated', {
      contentId: 'draft_1',
      topic: 'AI Agents',
      draftText: 'Test draft',
      suggestedTags: ['AI'],
      sources: ['https://example.com'],
    });

    expect(customHandler).toHaveBeenCalledTimes(1);
    expect(customHandler.mock.calls[0][0].id).toBe(event.id);
    expect(customHandler.mock.calls[0][0].payload.topic).toBe('AI Agents');

    // Test unsubscription
    unsubscribe();
    await orchestrator.publish('content.generated', { contentId: 'draft_2', topic: 'test', draftText: '', suggestedTags: [], sources: [] });
    expect(customHandler).toHaveBeenCalledTimes(1);
  });

  it('should route research.requested through the entire agent pipeline to content.published in test mode', async () => {
    const orchestrator = new Orchestrator(undefined, undefined, { TELEGRAM_TEST_MODE: true });
    const publishedEvents: string[] = [];

    orchestrator.subscribe('research.requested', () => { publishedEvents.push('research.requested'); });
    orchestrator.subscribe('content.requested', () => { publishedEvents.push('content.requested'); });
    orchestrator.subscribe('content.generated', () => { publishedEvents.push('content.generated'); });
    orchestrator.subscribe('content.checked', () => { publishedEvents.push('content.checked'); });
    orchestrator.subscribe('content.approved', () => { publishedEvents.push('content.approved'); });
    orchestrator.subscribe('content.published', () => { publishedEvents.push('content.published'); });

    await orchestrator.publish('research.requested', {
      niche: 'AI + technology + automation',
      topic: 'Edge Compute LLMs',
    });

    expect(publishedEvents).toContain('research.requested');
    expect(publishedEvents).toContain('content.requested');
    expect(publishedEvents).toContain('content.generated');
    expect(publishedEvents).toContain('content.checked');
    expect(publishedEvents).toContain('content.approved');
    expect(publishedEvents).toContain('content.published');
    expect(publishedEvents.length).toBe(6);

    const status = orchestrator.getStatus();
    expect(status.processedEventsCount).toBe(6);
    expect(status.recentEvents[0].type).toBe('content.published');
  });

  it('should capture handler failures as incidents without crashing orchestrator', async () => {
    const storage = new InMemoryStorageAdapter();
    const incidentMgr = new IncidentManager(storage);
    const orchestrator = new Orchestrator(undefined, incidentMgr);

    orchestrator.subscribe('system.health_checked', () => {
      throw new Error('Simulated subscriber crash');
    });

    // Should not throw
    await orchestrator.publish('system.health_checked', { status: 'healthy' });

    const incidents = await incidentMgr.listIncidents();
    expect(incidents.length).toBeGreaterThan(0);
    expect(incidents[0].error).toContain('Simulated subscriber crash');
  });
});
