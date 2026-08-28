/**
 * Autonomous Telegram Channel Manager - Core Type Definitions
 * Foundation Phase Architecture
 */

// ============================================================================
// Cloudflare Worker Runtime Bindings
// ============================================================================

export interface ScheduledEvent {
  cron: string;
  type: string;
  scheduledTime: number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface KVNamespaceListResult {
  keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  list_complete: boolean;
  cursor?: string;
}

export interface KVNamespace {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number; metadata?: any }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVNamespaceListResult>;
}

// ============================================================================
// Environment & Configuration Types
// ============================================================================

export interface Env {
  // Secret environment bindings
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  GEMINI_API_KEY?: string;
  TELEGRAM_CHANNEL_ID?: string;
  ADMIN_SECRET?: string;

  // Non-sensitive configuration
  ENVIRONMENT?: 'development' | 'staging' | 'production' | 'test';
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  APP_URL?: string;
  TELEGRAM_TEST_MODE?: string | boolean;

  // Cloudflare Storage & Asset Bindings (optional in foundation, fallback to in-memory)
  STORAGE_KV?: KVNamespace;
  ASSETS?: { fetch: (request: Request | string, init?: RequestInit) => Promise<Response> } | any;
}

export interface PublicConfig {
  environment: 'development' | 'staging' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  appUrl: string;
  channelId?: string;
  channelIdConfigured: boolean;
  telegramConfigured: boolean;
  geminiConfigured: boolean;
  adminAuthEnabled: boolean;
  testMode: boolean;
  version: string;
}

export interface SecretConfig {
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
  geminiApiKey?: string;
  telegramChannelId?: string;
  adminSecret?: string;
  testMode?: boolean;
}

export interface ValidatedConfig {
  public: PublicConfig;
  secrets: SecretConfig;
}

// ============================================================================
// Event & Orchestration Types
// ============================================================================

export type EventType =
  | 'research.requested'
  | 'content.requested'
  | 'content.generated'
  | 'content.checked'
  | 'content.approved'
  | 'content.rejected'
  | 'content.scheduled'
  | 'content.published'
  | 'candidate.recorded'
  | 'incident.created'
  | 'webhook.received'
  | 'telegram.update.received'
  | 'system.health_checked'
  | 'scheduler.cycle_started'
  | 'scheduler.cycle_completed'
  | 'scheduler.cycle_failed'
  | 'analytics.feedback_updated'
  | 'control.kill_switch_toggled'
  | 'control.autonomous_state_changed'
  | 'control.gate_evaluated'
  | 'audit.log_recorded';

export interface BaseEvent<T = unknown> {
  id: string;
  type: EventType;
  timestamp: number;
  correlationId?: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

export interface ResearchRequestedPayload {
  topic?: string;
  niche: string;
  sourceHints?: string[];
  maxItems?: number;
}

export interface ContentRequestedPayload {
  researchId?: string;
  topic: string;
  targetFormat?: 'short_tip' | 'deep_dive' | 'tool_review' | 'news_summary';
  editorialTone?: string;
}

export type ContentType =
  | 'NEWS'
  | 'PRODUCT_RELEASE'
  | 'RESEARCH'
  | 'EXPLAINER'
  | 'BENCHMARK'
  | 'ANALYSIS';

export type ClaimType = 'sourced_fact' | 'observation' | 'inference' | 'opinion';

export interface GroundedClaim {
  claim: string;
  source: string;
  claimType: ClaimType;
  verifiedInSource: boolean;
  isQuantitative?: boolean;
  critique?: string;
}

export interface ContentGeneratedPayload {
  contentId: string;
  topic: string;
  draftText: string;
  suggestedTags: string[];
  sources: string[];
  mediaPrompt?: string;
  contentType?: ContentType;
  primaryEntity?: string;
  developmentSummary?: string;
  groundedClaims?: GroundedClaim[];
}

export interface QualityBreakdown {
  factualAccuracy: number;
  technicalDepth: number;
  actionableUtility: number;
  clarityAndTone: number;
  sourceGrounding: number;
  claimGrounding?: number;
  telegramSuitability?: number;
}

export interface ContentCheckedPayload {
  contentId: string;
  passed: boolean;
  claimsVerified: Array<{
    claim: string;
    verified: boolean;
    citation?: string;
    critique?: string;
    claimType?: ClaimType;
    isQuantitative?: boolean;
  }>;
  confidenceScore: number;
  qualityScore?: number;
  qualityBreakdown?: QualityBreakdown;
  rejectionReason?: string;
  rejectionCode?: string;
  notes?: string;
  contentType?: ContentType;
}

export interface ContentApprovedPayload {
  contentId: string;
  approvedBy: string; // 'auto_eval' or user id
  approvedAt: number;
  scheduleTime?: number;
  topic?: string;
  formattedText?: string;
  channelId?: string;
  qualityScore?: number;
  confidenceScore?: number;
}

export interface ContentRejectedPayload {
  contentId: string;
  topic: string;
  reason: string;
  rejectionCode?: string;
  confidenceScore?: number;
  qualityScore?: number;
}

export interface ShadowCandidate {
  id: string;
  topic: string;
  draftText: string;
  suggestedTags: string[];
  sources: string[];
  status: 'approved' | 'rejected' | 'published';
  publishedAt?: number;
  publishedMessageId?: number;
  publishedChannelId?: string;
  rejectionReason?: string;
  rejectionCode?: string;
  confidenceScore?: number;
  qualityScore?: number;
  qualityBreakdown?: QualityBreakdown;
  claimsVerified?: Array<{ claim: string; verified: boolean; citation?: string }>;
  correlationId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ControlledPublishRequest {
  candidateId: string;
  targetChannel?: string;
  correlationId?: string;
}

export interface ControlledPublishResult {
  ok: boolean;
  message: string;
  candidateId: string;
  messageId: number;
  channelId: string;
  publishedAt: number;
  gateResult: PrePublicationGateResult;
  candidate: ShadowCandidate;
}

export interface ContentScheduledPayload {
  contentId: string;
  scheduledFor: number;
  channelId: string;
}

export interface ContentPublishedPayload {
  contentId: string;
  messageId: number;
  channelId: string;
  publishedAt: number;
  status?: string;
  testModeActive?: boolean;
}

export type ChannelEvent =
  | BaseEvent<ResearchRequestedPayload>
  | BaseEvent<ContentRequestedPayload>
  | BaseEvent<ContentGeneratedPayload>
  | BaseEvent<ContentCheckedPayload>
  | BaseEvent<ContentApprovedPayload>
  | BaseEvent<ContentRejectedPayload>
  | BaseEvent<ShadowCandidate>
  | BaseEvent<ContentScheduledPayload>
  | BaseEvent<ContentPublishedPayload>
  | BaseEvent<Incident>
  | BaseEvent<TelegramUpdate>
  | BaseEvent<HealthReport>;

export type EventHandler<T = unknown> = (event: BaseEvent<T>) => Promise<void> | void;

// ============================================================================
// Agent Architecture Interfaces
// ============================================================================

export type AgentRole =
  | 'researcher'
  | 'strategist'
  | 'writer'
  | 'factChecker'
  | 'publisher'
  | 'analyst'
  | 'repairAgent';

export interface AgentMetadata {
  name: string;
  role: AgentRole;
  version: string;
  description: string;
  isAutonomous: boolean;
  status: 'ready' | 'standby' | 'disabled' | 'error';
}

export interface AgentExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface IAgent<TInput = unknown, TOutput = unknown> {
  readonly metadata: AgentMetadata;
  execute(input: TInput, correlationId?: string): Promise<AgentExecutionResult<TOutput>>;
  canHandle(event: BaseEvent): boolean;
}

// ============================================================================
// Telegram Bot API Types (Clean Minimal Abstraction)
// ============================================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface TelegramChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: TelegramUser;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  is_anonymous?: boolean;
}

export interface TelegramChannelVerificationResult {
  bot: 'connected' | 'unauthorized' | 'not_configured' | 'error';
  botId?: number;
  botUsername?: string;
  botName?: string;
  channel: 'reachable' | 'not_configured' | 'not_found' | 'forbidden' | 'error';
  channelId?: string | number;
  channelTitle?: string;
  channelUsername?: string;
  publishing: 'available' | 'restricted' | 'unavailable' | 'not_configured';
  memberStatus?: string;
  canPostMessages?: boolean;
  verifiedAt: number;
  error?: string;
}

export interface TelegramUpdateSummary {
  updateId: number;
  updateType: 'message' | 'channel_post' | 'edited_message' | 'edited_channel_post' | 'unknown';
  timestamp: number;
  chatId?: number | string;
  chatType?: string;
  chatTitle?: string;
  hasText: boolean;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
}

// ============================================================================
// Health & Incident Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
  name: string;
  status: HealthStatus;
  critical: boolean;
  message?: string;
  latencyMs?: number;
  lastChecked: number;
}

export interface HealthReport {
  status: HealthStatus;
  environment: string;
  version: string;
  timestamp: number;
  uptimeSeconds: number;
  dependencies: Record<string, DependencyHealth>;
}

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'mitigated' | 'resolved' | 'escalated';

export interface Incident {
  id: string;
  timestamp: number;
  component: string;
  severity: IncidentSeverity;
  error: string;
  context?: Record<string, unknown>;
  status: IncidentStatus;
  retryCount: number;
  resolvedAt?: number;
  resolutionNotes?: string;
}

// ============================================================================
// Self-Healing Infrastructure Preparation Types (Future Expansion)
// ============================================================================

export interface IncidentDiagnosis {
  incidentId: string;
  timestamp: number;
  rootCauseHypothesis: string;
  affectedComponents: string[];
  recommendedAction: 'retry' | 'fallback' | 'config_update' | 'code_repair' | 'escalate_to_owner';
  confidenceScore: number;
}

export interface RepairProposal {
  id: string;
  incidentId: string;
  diagnosisId: string;
  createdAt: number;
  targetFile?: string;
  description: string;
  riskAssessment: 'low' | 'medium' | 'high';
  requiresOwnerApproval: boolean;
  diffSummary?: string;
}

export interface RepairAttempt {
  id: string;
  proposalId: string;
  attemptedAt: number;
  status: 'pending_approval' | 'applying' | 'verifying' | 'succeeded' | 'failed' | 'rolled_back';
  verificationResult?: {
    testsPassed: boolean;
    errorCount: number;
    notes: string;
  };
}

// ============================================================================
// Storage Abstraction Types
// ============================================================================

export interface StorageOptions {
  expirationTtl?: number; // in seconds
}

export interface IStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, options?: StorageOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

export interface ScheduledCycleRecord {
  cycleId: string;
  topic: string;
  category: string;
  source: 'gemini_dynamic' | 'cluster_rotation' | 'fallback_recovery';
  timestamp: number;
  cron?: string;
  status: 'success' | 'filtered' | 'failed';
  rejectionReason?: string;
  candidateId?: string;
  correlationId?: string;
  durationMs?: number;
}

export interface TopicCluster {
  id: string;
  name: string;
  description: string;
  sourceHints: string[];
  topics: string[];
}

export interface SchedulerState {
  lastCategoryIndex: number;
  lastScheduledAt?: number;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  recentTopics: ScheduledCycleRecord[];
  consecutiveFailures: number;
}

export interface SchedulerStatus {
  activeCategory: string;
  nextCategory: string;
  totalClusters: number;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  lastScheduledAt?: number;
  recentCycles: ScheduledCycleRecord[];
  avoidedTopicsCount: number;
  clusters: Array<{ id: string; name: string; topicCount: number; learnedWeight?: number }>;
  feedbackSummary?: {
    totalEvaluated: number;
    overallApprovalRate: number;
    overallAvgQuality: number;
    topClusters: string[];
  };
}

export interface ClusterPerformanceMetrics {
  clusterId: string;
  clusterName: string;
  totalGenerated: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number; // 0.0 to 1.0
  avgQualityScore: number; // 0.0 to 1.0
  avgConfidenceScore: number; // 0.0 to 1.0
  qualityBreakdownAvg: QualityBreakdown;
  commonRejectionCodes: Array<{ code: string; count: number }>;
  learnedWeight: number; // Dynamic weight (e.g. 0.5 to 2.5) used to influence scheduler rotation
  sampleCount: number;
  lastEvaluatedAt: number;
}

export interface ContentCharacteristicMetrics {
  approvedLengthStats: {
    avgCharCount: number;
    avgWordCount: number;
    minWordCount: number;
    maxWordCount: number;
  };
  rejectedLengthStats: {
    avgCharCount: number;
    avgWordCount: number;
  };
  optimalWordRange: { min: number; max: number };
  avgSourcesCount: number;
  avgTagsCount: number;
  topPerformingTags: Array<{ tag: string; count: number; approvalRate: number }>;
  claimVerificationRate: number;
  highScoringTopics: Array<{ topic: string; qualityScore: number; clusterName?: string }>;
}

export interface FeedbackLearningReport {
  generatedAt: number;
  totalEvaluatedCandidates: number;
  overallApprovalRate: number;
  overallAvgQuality: number;
  clusterPerformance: Record<string, ClusterPerformanceMetrics>;
  contentCharacteristics: ContentCharacteristicMetrics;
  topPerformingClusters: string[];
  underperformingClusters: string[];
  recommendations: string[];
}

// ============================================================================
// Phase 12: Production Control & Safety Layer Types
// ============================================================================

export type AutonomousPublishingState = 'disabled' | 'armed' | 'standby';

export interface ProductionSafetyConfig {
  minQualityThreshold: number; // default 0.85
  minConfidenceThreshold: number; // default 0.90
  maxPostsPerHour: number; // rate limit (default 2)
  minPostIntervalMinutes: number; // cooldown (default 15 mins)
  allowedChannels: string[]; // whitelist of allowed channel IDs/usernames
  enforceStrictFactCheck: boolean; // default true
  maxCharacterLength: number; // default 4096 (Telegram limit)
}

export interface ProductionControlState {
  killSwitchActive: boolean;
  killSwitchReason?: string;
  killSwitchActivatedAt?: number;
  killSwitchActivatedBy?: string;
  autonomousPublishingState: AutonomousPublishingState;
  autonomousPublishingArmedAt?: number;
  autonomousPublishingArmedBy?: string;
  lastPublishedAt?: number;
  publicationsThisHour: number;
  safetyConfig: ProductionSafetyConfig;
  updatedAt: number;
}

export interface PrePublicationCheck {
  name: string;
  category: 'kill_switch' | 'autonomous_state' | 'environment' | 'quality' | 'fact_check' | 'channel' | 'rate_limit' | 'content';
  passed: boolean;
  required: boolean;
  details?: string;
}

export interface PrePublicationGateRequest {
  contentId: string;
  channelId: string;
  formattedText: string;
  isManualTest?: boolean;
  qualityScore?: number;
  confidenceScore?: number;
  factCheckPassed?: boolean;
  claimsVerifiedCount?: number;
  actor?: string;
  correlationId?: string;
}

export interface PrePublicationGateResult {
  allowed: boolean;
  action: 'ALLOW' | 'BLOCK' | 'REJECT';
  reason: string;
  checks: PrePublicationCheck[];
  timestamp: number;
  evaluatedBy: string;
}

export type DecisionCategory =
  | 'kill_switch'
  | 'autonomous_state'
  | 'pre_publish_gate'
  | 'candidate_evaluation'
  | 'content_generation'
  | 'scheduler_cycle'
  | 'admin_action'
  | 'safety_violation';

export interface PipelineDecisionLog {
  id: string;
  timestamp: number;
  correlationId?: string;
  category: DecisionCategory;
  decision: 'ALLOW' | 'BLOCK' | 'REJECT' | 'ESCALATE' | 'TRIGGER' | 'ARMED' | 'DISARMED' | 'HALTED';
  reason: string;
  actor: string; // e.g. 'system', 'scheduler', 'owner:admin', 'agent:publisher', 'agent:fact_checker'
  targetContentId?: string;
  targetChannelId?: string;
  checks?: PrePublicationCheck[];
  metadata?: Record<string, unknown>;
}

export type {
  GeminiAuditParams,
  GeminiAuditResult,
  GeminiResearchParams,
  GeminiResearchResult,
  IGeminiService,
} from '../ai/gemini.ts';


