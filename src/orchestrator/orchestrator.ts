/**
 * Autonomous Telegram Channel Manager - Orchestrator
 *
 * Core coordinator managing event dispatching, workflow pipelines,
 * agent task routing, and failure recovery.
 */

import { AnalystAgent } from '../agents/analyst.ts';
import { FactCheckerAgent } from '../agents/factChecker.ts';
import { PublisherAgent } from '../agents/publisher.ts';
import { RepairAgent } from '../agents/repairAgent.ts';
import { ResearcherAgent } from '../agents/researcher.ts';
import { StrategistAgent } from '../agents/strategist.ts';
import { WriterAgent } from '../agents/writer.ts';
import { IncidentManager } from '../health/incidents.ts';
import { ITelegramClient } from '../telegram/client.ts';
import {
  AgentMetadata,
  BaseEvent,
  Env,
  EventHandler,
  EventType,
  IAgent,
  Incident,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Orchestrator');

export interface OrchestratorStatus {
  activeAgents: AgentMetadata[];
  eventListenersCount: Record<string, number>;
  processedEventsCount: number;
  recentEvents: Array<{ id: string; type: EventType; timestamp: number }>;
}

export class Orchestrator {
  private handlers = new Map<EventType, Set<EventHandler>>();
  private agents = new Map<string, IAgent>();
  private processedEventsCount = 0;
  private recentEvents: Array<{ id: string; type: EventType; timestamp: number }> = [];
  private incidentManager?: IncidentManager;
  private env: Partial<Env>;

  // Registered agents
  public readonly researcher: ResearcherAgent;
  public readonly strategist: StrategistAgent;
  public readonly writer: WriterAgent;
  public readonly factChecker: FactCheckerAgent;
  public readonly publisher: PublisherAgent;
  public readonly analyst: AnalystAgent;
  public readonly repairAgent: RepairAgent;

  constructor(telegramClient?: ITelegramClient, incidentManager?: IncidentManager, env?: Partial<Env>) {
    this.incidentManager = incidentManager;
    this.env = env || {};

    // Initialize agent instances
    this.researcher = new ResearcherAgent();
    this.strategist = new StrategistAgent();
    this.writer = new WriterAgent();
    this.factChecker = new FactCheckerAgent();
    this.publisher = new PublisherAgent(telegramClient, this.env);
    this.analyst = new AnalystAgent();
    this.repairAgent = new RepairAgent();

    // Register default agents
    this.registerAgent(this.researcher);
    this.registerAgent(this.strategist);
    this.registerAgent(this.writer);
    this.registerAgent(this.factChecker);
    this.registerAgent(this.publisher);
    this.registerAgent(this.analyst);
    this.registerAgent(this.repairAgent);

    // Setup internal default pipelines
    this.setupInternalPipelines();
  }

  public registerAgent(agent: IAgent): void {
    this.agents.set(agent.metadata.name, agent);
    logger.debug('agent_registered', `Registered agent: ${agent.metadata.name} (${agent.metadata.role})`);
  }

  public getAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Subscribe to specific event types
   */
  public subscribe<T = unknown>(eventType: EventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const set = this.handlers.get(eventType)!;
    set.add(handler as EventHandler);

    return () => {
      set.delete(handler as EventHandler);
    };
  }

  /**
   * Publish and dispatch an event through the orchestrator
   */
  public async publish<T = unknown>(
    eventType: EventType,
    payload: T,
    correlationId?: string
  ): Promise<BaseEvent<T>> {
    const event: BaseEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: eventType,
      timestamp: Date.now(),
      correlationId: correlationId || `corr_${Date.now()}`,
      payload,
    };

    this.processedEventsCount++;
    this.recentEvents.unshift({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
    });
    if (this.recentEvents.length > 50) {
      this.recentEvents.pop();
    }

    logger.info('event_dispatched', `Dispatched event: ${eventType} [${event.id}]`, {
      correlationId: event.correlationId,
      context: { eventType, eventId: event.id },
    });

    // Execute registered subscribers
    const subscribers = this.handlers.get(eventType);
    if (subscribers && subscribers.size > 0) {
      for (const handler of subscribers) {
        try {
          await handler(event as BaseEvent);
        } catch (err) {
          logger.error('event_handler_failed', `Handler error for event ${eventType}`, {
            correlationId: event.correlationId,
            error: err,
          });

          await this.handleExecutionError(eventType, err, event.correlationId);
        }
      }
    }

    return event;
  }

  private async handleExecutionError(
    sourceComponent: string,
    error: unknown,
    correlationId?: string
  ): Promise<void> {
    if (this.incidentManager) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      await this.incidentManager.recordIncident({
        component: `Orchestrator:${sourceComponent}`,
        severity: 'medium',
        error: errorMessage,
        context: { correlationId },
      });
    }
  }

  /**
   * Configure foundational event wiring between agents
   */
  private setupInternalPipelines(): void {
    // 1. Research requested -> researcher agent
    this.subscribe('research.requested', async (event) => {
      const result = await this.researcher.execute(event.payload as any, event.correlationId);
      if (result.success && result.data) {
        await this.publish('content.requested', {
          researchId: result.data.id,
          topic: result.data.topic,
          targetFormat: 'short_tip',
        }, event.correlationId);
      }
    });

    // 2. Incident created -> repair agent evaluation
    this.subscribe('incident.created', async (event) => {
      await this.repairAgent.execute({ incident: event.payload as Incident }, event.correlationId);
    });
  }

  /**
   * Get operational overview of orchestrator
   */
  public getStatus(): OrchestratorStatus {
    const listenersCount: Record<string, number> = {};
    for (const [evt, set] of this.handlers.entries()) {
      listenersCount[evt] = set.size;
    }

    return {
      activeAgents: Array.from(this.agents.values()).map((a) => a.metadata),
      eventListenersCount: listenersCount,
      processedEventsCount: this.processedEventsCount,
      recentEvents: [...this.recentEvents],
    };
  }
}
