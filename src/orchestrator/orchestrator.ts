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
import { IGeminiService } from '../ai/gemini.ts';
import { CandidateManager } from '../health/candidates.ts';
import { IncidentManager } from '../health/incidents.ts';
import { ProductionControlManager } from '../safety/productionControl.ts';
import { InMemoryStorageAdapter } from '../storage/storage.ts';
import { ITelegramClient } from '../telegram/client.ts';
import {
  AgentMetadata,
  BaseEvent,
  Env,
  EventHandler,
  EventType,
  IAgent,
  Incident,
  IStorage,
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
  private candidateManager?: CandidateManager;
  private storage?: IStorage;
  private env: Partial<Env>;

  // Production Control & Safeguards Layer
  public readonly productionControl: ProductionControlManager;

  // Registered agents
  public readonly researcher: ResearcherAgent;
  public readonly strategist: StrategistAgent;
  public readonly writer: WriterAgent;
  public readonly factChecker: FactCheckerAgent;
  public readonly publisher: PublisherAgent;
  public readonly analyst: AnalystAgent;
  public readonly repairAgent: RepairAgent;

  constructor(
    telegramClient?: ITelegramClient,
    incidentManager?: IncidentManager,
    env?: Partial<Env>,
    candidateManager?: CandidateManager,
    geminiService?: IGeminiService,
    storage?: IStorage,
    productionControl?: ProductionControlManager
  ) {
    this.incidentManager = incidentManager;
    this.candidateManager = candidateManager;
    this.storage = storage;
    this.env = env || {};

    // Initialize production control manager
    this.productionControl =
      productionControl ||
      new ProductionControlManager(this.storage || new InMemoryStorageAdapter(), this.env);

    // Initialize agent instances
    this.researcher = new ResearcherAgent(geminiService);
    this.strategist = new StrategistAgent();
    this.writer = new WriterAgent();
    this.factChecker = new FactCheckerAgent(geminiService);
    this.publisher = new PublisherAgent(telegramClient, this.env, this.productionControl);
    this.analyst = new AnalystAgent(storage, candidateManager);
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
        await this.publish(
          'content.requested',
          {
            researchId: result.data.id,
            topic: result.data.topic,
            summary: result.data.summary,
            keyTakeaways: result.data.keyTakeaways,
            suggestedSources: result.data.suggestedSources,
            relevanceScore: result.data.relevanceScore,
            targetFormat: 'short_tip',
          },
          event.correlationId
        );
      }
    });

    // 2. Content requested -> strategist evaluation -> writer draft generation
    this.subscribe('content.requested', async (event) => {
      const contentReq = event.payload as any;
      const researchOutput: any = {
        id: contentReq.researchId || `res_${Date.now()}`,
        topic: contentReq.topic,
        summary: contentReq.summary || `Research context for ${contentReq.topic}`,
        keyTakeaways: contentReq.keyTakeaways || [],
        suggestedSources: contentReq.suggestedSources || [],
        relevanceScore: contentReq.relevanceScore || 0.85,
      };

      const strategyResult = await this.strategist.execute(researchOutput, event.correlationId);
      if (strategyResult.success && strategyResult.data && strategyResult.data.shouldPublish) {
        const writerResult = await this.writer.execute(
          {
            topic: researchOutput.topic,
            summary: researchOutput.summary,
            decision: strategyResult.data,
          },
          event.correlationId
        );

        if (writerResult.success && writerResult.data) {
          await this.publish('content.generated', writerResult.data, event.correlationId);
        }
      }
    });

    // 3. Content generated -> fact checker verification -> shadow candidate recording
    this.subscribe('content.generated', async (event) => {
      const generatedDraft = event.payload as any;
      const checkResult = await this.factChecker.execute(generatedDraft, event.correlationId);
      if (checkResult.success && checkResult.data) {
        await this.publish(
          'content.checked',
          {
            ...checkResult.data,
            draftText: generatedDraft.draftText,
            topic: generatedDraft.topic,
            suggestedTags: generatedDraft.suggestedTags,
            sources: generatedDraft.sources,
          },
          event.correlationId
        );

        if (checkResult.data.passed) {
          // Record candidate in shadow storage
          let recordedStatus = 'approved';
          if (this.candidateManager) {
            const candidate = await this.candidateManager.recordCandidate({
              contentId: checkResult.data.contentId,
              topic: generatedDraft.topic,
              draftText: generatedDraft.draftText,
              suggestedTags: generatedDraft.suggestedTags,
              sources: generatedDraft.sources,
              status: 'approved',
              confidenceScore: checkResult.data.confidenceScore,
              qualityScore: checkResult.data.qualityScore,
              qualityBreakdown: checkResult.data.qualityBreakdown,
              claimsVerified: checkResult.data.claimsVerified,
              correlationId: event.correlationId,
            });
            if (candidate) {
              recordedStatus = candidate.status;
              await this.publish('candidate.recorded', candidate, event.correlationId);
            }
          }

          if (recordedStatus === 'approved') {
            await this.publish(
              'content.approved',
              {
                contentId: checkResult.data.contentId,
                approvedBy: 'auto_eval:fact_checker',
                approvedAt: Date.now(),
                topic: generatedDraft.topic,
                formattedText: generatedDraft.draftText,
                channelId: this.env.TELEGRAM_CHANNEL_ID || '@techpluseai',
                qualityScore: checkResult.data.qualityScore,
                confidenceScore: checkResult.data.confidenceScore,
              },
              event.correlationId
            );
          } else {
            await this.publish(
              'content.rejected',
              {
                contentId: checkResult.data.contentId,
                topic: generatedDraft.topic,
                reason: 'CandidateManager duplicate similarity or threshold guard rejected draft',
                rejectionCode: 'DUPLICATE_TOPIC_SIMILARITY',
                confidenceScore: checkResult.data.confidenceScore,
                qualityScore: checkResult.data.qualityScore,
              },
              event.correlationId
            );
          }
        } else {
          // Record rejected candidate in shadow storage
          const reason = checkResult.data.rejectionReason || checkResult.data.notes || 'Fact-checking confidence threshold not satisfied';
          if (this.candidateManager) {
            const candidate = await this.candidateManager.recordCandidate({
              contentId: checkResult.data.contentId,
              topic: generatedDraft.topic,
              draftText: generatedDraft.draftText,
              suggestedTags: generatedDraft.suggestedTags,
              sources: generatedDraft.sources,
              status: 'rejected',
              rejectionReason: reason,
              rejectionCode: checkResult.data.rejectionCode,
              confidenceScore: checkResult.data.confidenceScore,
              qualityScore: checkResult.data.qualityScore,
              qualityBreakdown: checkResult.data.qualityBreakdown,
              claimsVerified: checkResult.data.claimsVerified,
              correlationId: event.correlationId,
            });
            if (candidate) {
              await this.publish('candidate.recorded', candidate, event.correlationId);
            }
          }

          await this.publish(
            'content.rejected',
            {
              contentId: checkResult.data.contentId,
              topic: generatedDraft.topic,
              reason,
              rejectionCode: checkResult.data.rejectionCode,
              confidenceScore: checkResult.data.confidenceScore,
              qualityScore: checkResult.data.qualityScore,
            },
            event.correlationId
          );
        }
      }
    });

    // 4. Content approved -> publisher agent (with test mode safety)
    this.subscribe('content.approved', async (event) => {
      const approvedContent = event.payload as any;
      const channelId = approvedContent.channelId || this.env.TELEGRAM_CHANNEL_ID || '@techpluseai';

      const publishResult = await this.publisher.execute(
        {
          contentId: approvedContent.contentId,
          channelId,
          formattedText: approvedContent.formattedText,
          isManualTest: false,
          qualityScore: approvedContent.qualityScore,
          confidenceScore: approvedContent.confidenceScore,
          factCheckPassed: true,
          actor: 'agent:orchestrator',
        },
        event.correlationId
      );

      // Publish content.published event with result metadata
      await this.publish(
        'content.published',
        {
          contentId: approvedContent.contentId,
          messageId: publishResult.data?.messageId ?? 0,
          channelId,
          publishedAt: publishResult.data?.publishedAt ?? Date.now(),
          status: publishResult.success ? 'published' : 'blocked_by_safety_policy',
          testModeActive: Boolean(publishResult.metadata?.testModeActive),
        },
        event.correlationId
      );
    });

    // 5. Candidate recorded / Content published -> analyst agent performance tracking & feedback loop
    this.subscribe('candidate.recorded', async (event) => {
      try {
        await this.analyst.execute({ refreshFeedback: true }, event.correlationId);
      } catch (err) {
        logger.warn('analyst_candidate_feedback_failed', 'Failed to update feedback on candidate.recorded', { error: err });
      }
    });

    this.subscribe('content.published', async (event) => {
      try {
        const publishedPayload = event.payload as any;
        await this.analyst.execute({ channelId: publishedPayload?.channelId }, event.correlationId);
      } catch (err) {
        logger.warn('analyst_publish_feedback_failed', 'Failed to update feedback on content.published', { error: err });
      }
    });

    // 6. Incident created -> repair agent evaluation
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
