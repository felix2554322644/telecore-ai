import { describe, expect, it } from 'vitest';
import { RepairAgent } from '../src/agents/repairAgent.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';

describe('Incident Management & Self-Healing Preparation', () => {
  it('should record, list, retrieve, and update incident statuses', async () => {
    const storage = new InMemoryStorageAdapter();
    const manager = new IncidentManager(storage);

    const recorded = await manager.recordIncident({
      component: 'TelegramPublisher',
      severity: 'high',
      error: 'Network timeout connecting to api.telegram.org',
      context: { retryCount: 2 },
    });

    expect(recorded.id).toBeDefined();
    expect(recorded.status).toBe('open');
    expect(recorded.severity).toBe('high');
    expect(recorded.component).toBe('TelegramPublisher');

    // Fetch by ID
    const fetched = await manager.getIncident(recorded.id);
    expect(fetched?.id).toBe(recorded.id);

    // List
    const list = await manager.listIncidents();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(recorded.id);

    // Update status
    const updated = await manager.updateIncidentStatus(recorded.id, 'resolved', 'Network connectivity restored');
    expect(updated?.status).toBe('resolved');
    expect(updated?.resolvedAt).toBeDefined();
    expect(updated?.resolutionNotes).toBe('Network connectivity restored');
  });

  it('should formulate safe diagnostic proposals via RepairAgent', async () => {
    const repairAgent = new RepairAgent();

    const result = await repairAgent.execute({
      incident: {
        id: 'inc_test_123',
        timestamp: Date.now(),
        component: 'GeminiService',
        severity: 'critical',
        error: 'API quota exceeded or key invalid',
        status: 'open',
        retryCount: 0,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.diagnosis.incidentId).toBe('inc_test_123');
    expect(result.data?.diagnosis.recommendedAction).toBe('escalate_to_owner');
    expect(result.data?.requiresOwnerApproval).toBe(true);
    expect(result.data?.proposal?.riskAssessment).toBe('low');
  });
});
