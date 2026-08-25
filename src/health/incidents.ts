/**
 * Autonomous Telegram Channel Manager - Incident System
 *
 * Captures, records, and tracks system errors, service degradations,
 * and operational incidents to provide observability and lay the foundation
 * for future self-healing agents.
 */

import { IStorage, Incident, IncidentSeverity, IncidentStatus } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('IncidentManager');

export interface CreateIncidentInput {
  component: string;
  severity: IncidentSeverity;
  error: string;
  context?: Record<string, unknown>;
}

export class IncidentManager {
  private storage: IStorage;
  private readonly storagePrefix = 'incident:';
  private inMemoryIncidents: Incident[] = [];

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Record a new operational incident
   */
  public async recordIncident(input: CreateIncidentInput): Promise<Incident> {
    const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const incident: Incident = {
      id,
      timestamp: Date.now(),
      component: input.component,
      severity: input.severity,
      error: input.error,
      context: input.context,
      status: 'open',
      retryCount: 0,
    };

    this.inMemoryIncidents.unshift(incident);
    // Keep max 100 in memory
    if (this.inMemoryIncidents.length > 100) {
      this.inMemoryIncidents.pop();
    }

    try {
      await this.storage.set(`${this.storagePrefix}${id}`, incident, {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });
    } catch (err) {
      logger.error('incident_storage_failed', `Failed to persist incident ${id} in storage`, {
        error: err,
      });
    }

    logger.warn('incident_recorded', `Incident ${id} [${incident.severity.toUpperCase()}] in ${incident.component}: ${incident.error}`, {
      context: {
        incidentId: id,
        component: incident.component,
        severity: incident.severity,
      },
    });

    return incident;
  }

  /**
   * Fetch an incident by ID
   */
  public async getIncident(id: string): Promise<Incident | null> {
    const memoryMatch = this.inMemoryIncidents.find((inc) => inc.id === id);
    if (memoryMatch) return memoryMatch;

    return this.storage.get<Incident>(`${this.storagePrefix}${id}`);
  }

  /**
   * List recent incidents
   */
  public async listIncidents(limit = 20): Promise<Incident[]> {
    if (this.inMemoryIncidents.length >= limit) {
      return this.inMemoryIncidents.slice(0, limit);
    }

    try {
      const keys = await this.storage.list(this.storagePrefix);
      const fetched: Incident[] = [];

      for (const key of keys.slice(0, limit)) {
        const inc = await this.storage.get<Incident>(key);
        if (inc) {
          fetched.push(inc);
        }
      }

      // Merge and deduplicate
      const all = [...this.inMemoryIncidents];
      for (const item of fetched) {
        if (!all.some((existing) => existing.id === item.id)) {
          all.push(item);
        }
      }

      return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch {
      return this.inMemoryIncidents.slice(0, limit);
    }
  }

  /**
   * Update incident status (e.g. mitigated, resolved)
   */
  public async updateIncidentStatus(
    id: string,
    status: IncidentStatus,
    notes?: string
  ): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    incident.status = status;
    if (status === 'resolved') {
      incident.resolvedAt = Date.now();
    }
    if (notes) {
      incident.resolutionNotes = notes;
    }

    // Update in-memory
    const memIdx = this.inMemoryIncidents.findIndex((inc) => inc.id === id);
    if (memIdx !== -1) {
      this.inMemoryIncidents[memIdx] = incident;
    } else {
      this.inMemoryIncidents.unshift(incident);
    }

    // Update in storage
    await this.storage.set(`${this.storagePrefix}${id}`, incident);

    logger.info('incident_status_updated', `Incident ${id} updated to status '${status}'`);
    return incident;
  }
}
