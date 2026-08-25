import { describe, expect, it, vi } from 'vitest';
import { TelegramClient } from '../src/telegram/client.ts';
import { ConfigurationError, TelegramApiError } from '../src/utils/errors.ts';

describe('Telegram Client', () => {
  it('should throw ConfigurationError if botToken is missing during call', async () => {
    const client = new TelegramClient(undefined);
    expect(client.isConfigured()).toBe(false);
    await expect(client.getMe()).rejects.toThrow(ConfigurationError);
  });

  it('should call getMe successfully when Telegram API returns 200 OK', async () => {
    const mockUser = {
      id: 1234567,
      is_bot: true,
      first_name: 'AI Channel Manager Bot',
      username: 'aichannel_mgr_bot',
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: mockUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new TelegramClient('test_bot_token', mockFetch as any);
    const result = await client.getMe();

    expect(result.id).toBe(1234567);
    expect(result.username).toBe('aichannel_mgr_bot');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/bottest_bot_token/getMe');
  });

  it('should send a message with Markdown formatting', async () => {
    const mockMessage = {
      message_id: 42,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 999, type: 'channel', title: 'AI Insights' },
      text: '*Hello Channel*',
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: mockMessage }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new TelegramClient('test_token', mockFetch as any);
    const sent = await client.sendMessage('@my_channel', '*Hello Channel*', {
      parse_mode: 'Markdown',
    });

    expect(sent.message_id).toBe(42);
    const requestPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestPayload.chat_id).toBe('@my_channel');
    expect(requestPayload.text).toBe('*Hello Channel*');
    expect(requestPayload.parse_mode).toBe('Markdown');
  });

  it('should set and delete webhooks with secret token', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const client = new TelegramClient('test_token', mockFetch as any);

    const setRes = await client.setWebhook('https://example.workers.dev/webhooks/telegram', 'sec_tok_123');
    expect(setRes).toBe(true);
    const setPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(setPayload.url).toBe('https://example.workers.dev/webhooks/telegram');
    expect(setPayload.secret_token).toBe('sec_tok_123');

    const delRes = await client.deleteWebhook(true);
    expect(delRes).toBe(true);
  });

  it('should handle Telegram API error responses gracefully without exposing tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const client = new TelegramClient('super_secret_bot_token', mockFetch as any);

    try {
      await client.sendMessage('@nonexistent_chat', 'test');
      expect.fail('Should have thrown TelegramApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(TelegramApiError);
      expect(err.message).toContain('Bad Request: chat not found');
      // Token must not be in error message
      expect(err.message).not.toContain('super_secret_bot_token');
    }
  });

  it('should retrieve getWebhookInfo successfully', async () => {
    const mockInfo = {
      url: 'https://my-worker.workers.dev/webhooks/telegram',
      has_custom_certificate: false,
      pending_update_count: 0,
    };

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: mockInfo }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const client = new TelegramClient('test_token', mockFetch as any);
    const info = await client.getWebhookInfo();

    expect(info.url).toBe('https://my-worker.workers.dev/webhooks/telegram');
    expect(info.pending_update_count).toBe(0);
  });

  it('should perform comprehensive channel access verification', async () => {
    const mockUser = { id: 777, is_bot: true, first_name: 'TestBot', username: 'telecore_bot' };
    const mockChat = { id: -100123456, type: 'channel', title: 'Tech Pulse' };
    const mockMember = {
      status: 'administrator',
      user: mockUser,
      can_post_messages: true,
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/getMe')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, result: mockUser }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      if (url.includes('/getChatMember')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, result: mockMember }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      if (url.includes('/getChat')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, result: mockChat }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 404 }));
    });

    const client = new TelegramClient('test_token', mockFetch as any);
    const report = await client.verifyChannelAccess('@tech_pulse');

    expect(report.bot).toBe('connected');
    expect(report.botUsername).toBe('telecore_bot');
    expect(report.channel).toBe('reachable');
    expect(report.channelTitle).toBe('Tech Pulse');
    expect(report.publishing).toBe('available');
    expect(report.canPostMessages).toBe(true);
  });
});
