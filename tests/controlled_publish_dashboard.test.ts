import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createAppContext } from '../src/index.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, ShadowCandidate } from '../src/types/index.ts';

describe('Phase 14A: Controlled Publishing Dashboard & API Workflows', () => {
  let storage: InMemoryStorageAdapter;
  let baseEnv: Env & { __STORAGE__?: any; __TELEGRAM_CLIENT__?: any };
  let mockTgClient: ITelegramClient;

  const createMockTelegramClient = (overrides?: Partial<ITelegramClient>): ITelegramClient => ({
    isConfigured: vi.fn(() => true),
    getMe: vi.fn().mockResolvedValue({ id: 123456, is_bot: true, first_name: 'TeleCoreBot', username: 'telecore_bot' }),
    sendMessage: vi.fn().mockResolvedValue({
      message_id: 995511,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -1001987654321, title: 'Tech Pulse AI', type: 'channel', username: 'techpluseai' },
      text: 'Live published technical post',
    }),
    getChat: vi.fn().mockResolvedValue({ id: -1001987654321, title: 'Tech Pulse AI', type: 'channel', username: 'techpluseai' }),
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
      TELEGRAM_CHANNEL_ID: '@techpluseai',
      ADMIN_SECRET: 'super_admin_secret_456',
      ENVIRONMENT: 'production',
      APP_URL: 'https://telecore-ai.workers.dev',
      TELEGRAM_TEST_MODE: 'true',
      __STORAGE__: storage as any,
      __TELEGRAM_CLIENT__: mockTgClient as any,
    };
  });

  const createSampleCandidate = (overrides?: Partial<ShadowCandidate>): ShadowCandidate => ({
    id: 'cand_phase14_001',
    topic: 'Deterministic Agentic Reliability at Scale',
    draftText: 'Architecting resilient serverless multi-agent pipelines with deterministic quality validation gates.',
    suggestedTags: ['AI', 'Architecture', 'Agents'],
    sources: ['https://arxiv.org/abs/2401.00000'],
    status: 'approved',
    confidenceScore: 0.96,
    qualityScore: 9.4,
    qualityBreakdown: {
      factualAccuracy: 0.96,
      technicalDepth: 0.94,
      actionableUtility: 0.92,
      clarityAndTone: 0.95,
      sourceGrounding: 0.94,
    },
    claimsVerified: [
      { claim: 'Deterministic gates reduce hallucination by 98%', verified: true, citation: 'https://arxiv.org' },
    ],
    timestamp: Date.now() - 30000,
    ...overrides,
  });

  it('1. GET /api/candidates returns all shadow candidates for dashboard consumption', async () => {
    const cand1 = createSampleCandidate({ id: 'cand_phase14_001' });
    const cand2 = createSampleCandidate({
      id: 'cand_phase14_002',
      topic: 'Low-Latency KV Storage in Cloudflare Workers',
      draftText: 'Optimizing global read performance with tiered in-memory caches and edge-replicated state stores.',
    });
    await storage.set(`candidate:${cand1.id}`, cand1);
    await storage.set(`candidate:${cand2.id}`, cand2);

    const request = new Request('https://telecore-ai.workers.dev/api/candidates', {
      method: 'GET',
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.candidates).toHaveLength(2);
    expect(data.stats.approved).toBe(2);
    expect(data.candidates.some((c: ShadowCandidate) => c.id === cand1.id)).toBe(true);
  });

  it('2. POST /api/admin/publish-candidate executes single-post publication with messageId returned', async () => {
    const cand = createSampleCandidate({ id: 'cand_phase14_pub_001' });
    await storage.set(`candidate:${cand.id}`, cand);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: cand.id,
        targetChannel: '@techpluseai',
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.candidateId).toBe(cand.id);
    expect(data.messageId).toBe(995511);
    expect(data.channelId).toBe('@techpluseai');
    expect(data.publishedAt).toBeDefined();

    // Verify stored candidate updated to status 'published'
    const stored = await storage.get<ShadowCandidate>(`candidate:${cand.id}`);
    expect(stored?.status).toBe('published');
    expect(stored?.publishedMessageId).toBe(995511);
    expect(stored?.publishedChannelId).toBe('@techpluseai');
  });

  it('3. Rejects publishing attempt when Authorization header is missing', async () => {
    const cand = createSampleCandidate({ id: 'cand_phase14_unauth_001' });
    await storage.set(`candidate:${cand.id}`, cand);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidateId: cand.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('4. Rejects publishing attempt with wrong admin token with 401 Unauthorized', async () => {
    const cand = createSampleCandidate({ id: 'cand_phase14_bad_token_001' });
    await storage.set(`candidate:${cand.id}`, cand);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong_token_123',
      },
      body: JSON.stringify({
        candidateId: cand.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('5. Blocks duplicate publishing attempt on already published candidate (Anti-Replay)', async () => {
    const alreadyPublished = createSampleCandidate({
      id: 'cand_phase14_already_pub_001',
      status: 'published',
      publishedAt: Date.now() - 10000,
      publishedMessageId: 771133,
      publishedChannelId: '@techpluseai',
    });
    await storage.set(`candidate:${alreadyPublished.id}`, alreadyPublished);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: alreadyPublished.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('already published');
  });

  it('6. Blocks candidate if quality score fails safety threshold (< 7.5)', async () => {
    const lowQualityCand = createSampleCandidate({
      id: 'cand_low_qual_999',
      qualityScore: 6.2, // Below 7.5 threshold
      status: 'approved',
    });
    await storage.set(`candidate:${lowQualityCand.id}`, lowQualityCand);

    const request = new Request('https://telecore-ai.workers.dev/api/admin/publish-candidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        candidateId: lowQualityCand.id,
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Quality Threshold Met');
  });

  it('7. Supports POST /api/admin/candidates/:id/publish route parameter syntax', async () => {
    const cand = createSampleCandidate({ id: 'cand_phase14_param_001' });
    await storage.set(`candidate:${cand.id}`, cand);

    const request = new Request(`https://telecore-ai.workers.dev/api/admin/candidates/${cand.id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${baseEnv.ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        targetChannel: '@techpluseai',
      }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.candidateId).toBe(cand.id);
    expect(data.messageId).toBe(995511);
  });
});
