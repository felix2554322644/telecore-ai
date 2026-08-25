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

  it('should route research.requested to researcher and chain to content.requested', async () => {
    const orchestrator = new Orchestrator();
    const contentRequestedSpy = vi.fn();

    orchestrator.subscribe('content.requested', contentRequestedSpy);

    await orchestrator.publish('research.requested', {
      niche: 'AI + technology + automation',
      topic: 'Edge Compute LLMs',
    });

    expect(contentRequestedSpy).toHaveBeenCalledTimes(1);
    expect(contentRequestedSpy.mock.calls[0][0].payload.topic).toBe('Edge Compute LLMs');
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
