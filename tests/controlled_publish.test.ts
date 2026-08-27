import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createAppContext } from '../src/index.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, ShadowCandidate } from '../src/types/index.ts';

describe('Phase 13: Controlled Live Publishing Readiness', () => {
  let storage: InMemoryStorageAdapter;
  let baseEnv: Env & { __STORAGE__?: any; __TELEGRAM_CLIENT__?: any };
  let mockTgClient: ITelegramClient;

  const createMockTelegramClient = (overrides?: Partial<ITelegramClient>): ITelegramClient => ({
    isConfigured: vi.fn(() => true),
    getMe: vi.fn().mockResolvedValue({ id: 123456, is_bot: true, first_name: 'TeleCoreBot', username: 'telecore_bot' }),
    sendMessage: vi.fn().mockResolvedValue({
      message_id: 884422,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -1001987654321, title: 'TeleCore Channel', type: 'channel', username: 'telecore_channel' },
      text: 'Published post content',
    }),
    getChat: vi.fn().mockResolvedValue({ id: -1001987654321, title: 'TeleCore Channel', type: 'channel', username: 'telecore_channel' }),
    getChatMember: vi.fn().mockResolvedValue({ status: 'administrator', user: { id: 123456, is_bot: true, first_name: 'TeleCoreBot' } }),
    getChatAdministrators: vi.fn().mockResolvedValue([]),
    setWebhook: vi.fn().mockResolvedValue(true),
    deleteWebhook: vi.fn().mockResolvedValue(true),
    getWebhookInfo: vi.fn().mockResolvedValue({ url: 'https://telecore-ai.workers.dev/webhooks/telegram', has_custom_certificate: false, pending_update_count: 0 }),
    verifyChannelAccess: vi.fn().mockResolvedValue({ valid: true, canPost: true, botUsername: 'telecore_bot' }),
    ...overrides,
  });

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    mockTgClient = createMockTelegramClient();
    baseEnv = {
      TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      TELEGRAM_WEBHOOK_SECRET: 'webhook_sec_123',
      GEMINI_API_KEY: 'test_gemini_key',
      TELEGRAM_CHANNEL_ID: '@telecore_channel',
      ADMIN_SECRET: 'owner_secret_999',
      ENVIRONMENT: 'production',
      APP_URL: 'https://telecore-ai.workers.dev',
      TELEGRAM_TEST_MODE: 'true',
      __STORAGE__: storage as any,
      __TELEGRAM_CLIENT__: mockTgClient as any,
    };
  });

  const sampleApprovedCandidate: ShadowCandidate = {
    id: 'cand_approved_001',
    topic: 'Edge Compute LLMs in Production',
    draftText: 'Deep dive into edge compute LLM deployments with quantized ONNX runtimes and sub-10ms response latency.',
    suggestedTags: ['AI', 'Edge', 'Systems'],
    sources: ['https://arxiv.org/abs/2301.00000', 'https://github.com/onnx/runtime'],
    status: 'approved',
    confidenceScore: 0.95,
    qualityScore: 9.2,
    qualityBreakdown: {
      factualAccuracy: 0.95,
      technicalDepth: 0.92,
      actionableUtility: 0.90,
      clarityAndTone: 0.94,
      sourceGrounding: 0.92,
    },
    claimsVerified: [
      { claim: 'ONNX runtimes support sub-10ms latency', verified: true, citation: 'https://arxiv.org' },
    ],
    timestamp: Date.now() - 60000,
  };

  const sampleRejectedCandidate: ShadowCandidate = {
    id: 'cand_rejected_001',
    topic: 'Get Rich Quick with Crypto Bots',
    draftText: 'Mind-blowing 1000x secret trick to make millions today! Guaranteed returns!',
    suggestedTags: ['Crypto', 'Hype'],
    sources: [],
    status: 'rejected',
    rejectionCode: 'BANNED_HYPE_PATTERNS',
    rejectionReason: 'Promotional hyperbole and speculative hype detected',
    confidenceScore: 0.35,
    qualityScore: 2.1,
    timestamp: Date.now() - 120000,
  };

  it('1. Rejects unauthenticated requests with 401', async () => {
    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: 'cand_approved_001' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('2. Rejects requests with invalid Admin Secret with 401 Unauthorized', async () => {
    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong_admin_secret',
      },
      body: JSON.stringify({ candidateId: 'cand_approved_001' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
  });

  it('3. Returns 404 when publishing a non-existent candidate', async () => {
    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({ candidateId: 'cand_non_existent_999' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.message).toContain('Candidate not found');
  });

  it('4. Rejects publication of a candidate with status "rejected" (400)', async () => {
    const candidateToSave: ShadowCandidate = {
      ...sampleRejectedCandidate,
    };
    await storage.set(`candidate:${candidateToSave.id}`, candidateToSave);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({ candidateId: candidateToSave.id }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('cannot be published because its status is');
    expect(data.status).toBe('rejected');
  });

  it('5. Rejects publication when global kill switch is engaged (403)', async () => {
    const app = createAppContext(baseEnv);
    await storage.set(`candidate:${sampleApprovedCandidate.id}`, sampleApprovedCandidate);
    await app.productionControl.setKillSwitch(true, 'Emergency maintenance in progress', 'owner:admin');

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({ candidateId: sampleApprovedCandidate.id }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Global Kill Switch');
  });

  it('6. Rejects unsafe candidates failing pre-publication safety gates', async () => {
    // Create an approved candidate but with low quality score that fails the 7.0 threshold
    const lowQualityCandidate: ShadowCandidate = {
      ...sampleApprovedCandidate,
      id: 'cand_low_qual_001',
      qualityScore: 4.5, // Below 7.0 threshold
    };
    await storage.set(`candidate:${lowQualityCandidate.id}`, lowQualityCandidate);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({ candidateId: lowQualityCandidate.id }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Quality Threshold Met');
  });

  it('7. Successfully publishes ONE approved candidate under owner authorization with zero live API calls', async () => {
    await storage.set(`candidate:${sampleApprovedCandidate.id}`, sampleApprovedCandidate);

    const request = new Request(`https://telecore-ai.workers.dev/api/admin/candidates/${sampleApprovedCandidate.id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: sampleApprovedCandidate.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.candidateId).toBe(sampleApprovedCandidate.id);
    expect(data.messageId).toBeGreaterThan(0);
    expect(data.publishedAt).toBeGreaterThan(0);
    expect(data.candidate.status).toBe('published');
    expect(data.candidate.publishedMessageId).toBe(data.messageId);

    // Verify candidate state updated in storage
    const app = createAppContext(baseEnv);
    const storedCand = await app.candidateManager.getCandidate(sampleApprovedCandidate.id);
    expect(storedCand?.status).toBe('published');
    expect(storedCand?.publishedMessageId).toBe(data.messageId);
    expect(storedCand?.publishedAt).toBeDefined();

    // Verify decision was recorded in audit log
    const auditLogs = await app.productionControl.listDecisionLogs({ limit: 10 });
    expect(auditLogs.length).toBeGreaterThan(0);
    const prePublishLogs = auditLogs.filter(
      (l) => l.targetContentId === sampleApprovedCandidate.id
    );
    expect(prePublishLogs.length).toBeGreaterThan(0);
  });

  it('8. Strictly blocks duplicate/replay publishing attempts (409 Conflict)', async () => {
    // Seed candidate that is ALREADY marked published
    const alreadyPublishedCandidate: ShadowCandidate = {
      ...sampleApprovedCandidate,
      id: 'cand_published_replay_001',
      status: 'published',
      publishedAt: Date.now() - 3600000,
      publishedMessageId: 771122,
      publishedChannelId: '@telecore_channel',
    };
    await storage.set(`candidate:${alreadyPublishedCandidate.id}`, alreadyPublishedCandidate);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: alreadyPublishedCandidate.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(409);
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(data.alreadyPublished).toBe(true);
    expect(data.error).toContain('Duplicate/replay publication prevented');
    expect(data.messageId).toBe(771122);

    // Verify blocked replay attempt is audited
    const app = createAppContext(baseEnv);
    const auditLogs = await app.productionControl.listDecisionLogs({ limit: 10 });
    const replayAudit = auditLogs.find(
      (l) => l.targetContentId === alreadyPublishedCandidate.id && l.decision === 'BLOCK'
    );
    expect(replayAudit).toBeDefined();
    expect(replayAudit?.metadata?.antiReplayViolation).toBe(true);
  });

  it('9. Supports POST /api/admin/publish-candidate with JSON payload body', async () => {
    const freshCandidate: ShadowCandidate = {
      ...sampleApprovedCandidate,
      id: 'cand_fresh_approved_002',
      status: 'approved',
      topic: 'Vector Database Indexing at Scale',
      draftText: 'HNSW graph indexing techniques for dense vector retrieval in sub-millisecond production latency bounds.',
      qualityScore: 9.6,
      confidenceScore: 0.98,
      publishedAt: undefined,
      publishedMessageId: undefined,
    };
    await storage.set(`candidate:${freshCandidate.id}`, freshCandidate);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: freshCandidate.id,
        targetChannel: '@telecore_channel',
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.candidateId).toBe(freshCandidate.id);
    expect(data.candidate.status).toBe('published');
  });
});
