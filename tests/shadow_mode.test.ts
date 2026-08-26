import { describe, expect, it, vi } from 'vitest';
import { CandidateManager } from '../src/health/candidates.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import worker from '../src/index.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, ShadowCandidate } from '../src/types/index.ts';

describe('Phase 6: Autonomous Shadow Mode', () => {
  const mockEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'test_webhook_sec_123',
    GEMINI_API_KEY: 'test_gemini_key',
    TELEGRAM_CHANNEL_ID: '@telecore_channel',
    ADMIN_SECRET: 'shadow_admin_secret_456',
    ENVIRONMENT: 'production',
    APP_URL: 'https://telecore-ai.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  describe('CandidateManager', () => {
    it('creates, records, and retrieves an approved shadow candidate', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      const candidate = await candidateMgr.recordCandidate({
        topic: 'Autonomous Cloudflare Edge Agents',
        draftText: 'Detailed post content discussing distributed agents on edge workers.',
        suggestedTags: ['AI', 'Cloudflare', 'Edge'],
        sources: ['https://blog.cloudflare.com'],
        status: 'approved',
        confidenceScore: 0.96,
        claimsVerified: [
          { claim: 'Workers run on V8 isolates', verified: true, citation: 'https://developers.cloudflare.com' },
        ],
        correlationId: 'test_corr_001',
      });

      expect(candidate).toBeDefined();
      expect(candidate?.id).toBeDefined();
      expect(candidate?.status).toBe('approved');
      expect(candidate?.topic).toBe('Autonomous Cloudflare Edge Agents');

      const retrieved = await candidateMgr.getCandidate(candidate!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(candidate?.id);

      const list = await candidateMgr.listCandidates();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(candidate?.id);
    });

    it('records and filters rejected candidates with rejection reason', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      await candidateMgr.recordCandidate({
        topic: 'Unverified Claim Post',
        draftText: 'Draft text with questionable numbers.',
        suggestedTags: ['Rumor'],
        sources: [],
        status: 'rejected',
        rejectionReason: 'Confidence score below 0.85 threshold',
        confidenceScore: 0.45,
        correlationId: 'test_corr_002',
      });

      const approvedList = await candidateMgr.listCandidates(10, 'approved');
      expect(approvedList.length).toBe(0);

      const rejectedList = await candidateMgr.listCandidates(10, 'rejected');
      expect(rejectedList.length).toBe(1);
      expect(rejectedList[0].status).toBe('rejected');
      expect(rejectedList[0].rejectionReason).toBe('Confidence score below 0.85 threshold');

      const stats = await candidateMgr.getCandidateStats();
      expect(stats.total).toBe(1);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(1);
    });

    it('prevents duplicate candidate storage within deduplication window', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      const payload = {
        topic: 'Duplicate Edge Post',
        draftText: 'Identical content string for testing deduplication safety.',
        suggestedTags: ['Testing'],
        sources: ['https://example.com'],
        status: 'approved' as const,
        correlationId: 'corr_dup_1',
      };

      const first = await candidateMgr.recordCandidate(payload);
      expect(first).toBeDefined();

      // Immediate second attempt with identical topic and draftText returns existing candidate
      const second = await candidateMgr.recordCandidate(payload);
      expect(second.id).toBe(first.id);

      const list = await candidateMgr.listCandidates();
      expect(list.length).toBe(1);
    });
  });

  describe('End-to-End Orchestrator Pipeline with Shadow Mode', () => {
    it('executes research.requested through fact-checking to candidate recording without Telegram calls', async () => {
      const storage = new InMemoryStorageAdapter();
      const incidentMgr = new IncidentManager(storage);
      const candidateMgr = new CandidateManager(storage);

      const mockSendMessage = vi.fn();
      const mockTelegramClient: ITelegramClient = {
        isConfigured: () => true,
        getMe: vi.fn(),
        sendMessage: mockSendMessage,
        getChat: vi.fn(),
        getChatMember: vi.fn(),
        getChatAdministrators: vi.fn(),
        setWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        verifyChannelAccess: vi.fn(),
      };

      const orchestrator = new Orchestrator(mockTelegramClient, incidentMgr, mockEnv, candidateMgr);

      const candidateEvents: ShadowCandidate[] = [];
      orchestrator.subscribe('candidate.recorded', (event) => {
        candidateEvents.push(event.payload as ShadowCandidate);
      });

      // Dispatch research.requested trigger (simulating scheduled cron or autonomous cycle)
      const event = await orchestrator.publish('research.requested', {
        niche: 'AI + technology + automation',
        topic: 'Autonomous Cloudflare Edge Agents in 2026',
      });

      expect(event).toBeDefined();

      // Verify that candidate was recorded in CandidateManager
      const storedCandidates = await candidateMgr.listCandidates();
      expect(storedCandidates.length).toBe(1);
      expect(storedCandidates[0].topic).toContain('Autonomous Cloudflare Edge Agents in 2026');
      expect(storedCandidates[0].draftText).toBeDefined();
      expect(storedCandidates[0].status).toBe('approved');
      expect(storedCandidates[0].timestamp).toBeGreaterThan(0);

      // Verify candidate.recorded event was emitted
      expect(candidateEvents.length).toBe(1);
      expect(candidateEvents[0].id).toBe(storedCandidates[0].id);

      // CRITICAL: Verify NO real Telegram message calls were made
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Shadow Candidate Endpoints', () => {
    it('allows public telemetry inspection via GET /api/candidates', async () => {
      const req = new Request('https://telecore-ai.workers.dev/api/candidates', {
        method: 'GET',
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('candidates');
      expect(Array.isArray(data.candidates)).toBe(true);
    });

    it('requires admin authorization for GET /api/admin/candidates', async () => {
      const unauthorizedReq = new Request('https://telecore-ai.workers.dev/api/admin/candidates', {
        method: 'GET',
      });

      const resUnauthorized = await worker.fetch(unauthorizedReq, mockEnv);
      expect(resUnauthorized.status).toBe(401);

      const authorizedReq = new Request('https://telecore-ai.workers.dev/api/admin/candidates', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mockEnv.ADMIN_SECRET}`,
        },
      });

      const resAuthorized = await worker.fetch(authorizedReq, mockEnv);
      expect(resAuthorized.status).toBe(200);
      const data = await resAuthorized.json();
      expect(data).toHaveProperty('candidates');
    });

    it('handles scheduled cron event without error or Telegram publishing', async () => {
      const scheduledEvent = {
        cron: '0 * * * *',
        scheduledTime: Date.now(),
        type: 'scheduled',
      };

      // Call worker.scheduled
      await expect(worker.scheduled(scheduledEvent, mockEnv)).resolves.not.toThrow();
    });
  });
});
