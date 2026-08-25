/**
 * Autonomous Telegram Channel Manager - Telegram Bot API Client
 *
 * Dedicated client abstraction for interacting with the Telegram Bot API.
 * Designed for Cloudflare Workers runtime and standard testing environments.
 */

import {
  SendMessageOptions,
  TelegramApiResponse,
  TelegramChannelVerificationResult,
  TelegramChat,
  TelegramChatMember,
  TelegramMessage,
  TelegramUser,
  TelegramWebhookInfo,
} from '../types/index.ts';
import { ConfigurationError, TelegramApiError } from '../utils/errors.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('TelegramClient');

export interface ITelegramClient {
  isConfigured(): boolean;
  getMe(): Promise<TelegramUser>;
  sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage>;
  getChat(chatId: number | string): Promise<TelegramChat>;
  getChatMember(chatId: number | string, userId: number): Promise<TelegramChatMember>;
  getChatAdministrators(chatId: number | string): Promise<TelegramChatMember[]>;
  setWebhook(url: string, secretToken?: string): Promise<boolean>;
  deleteWebhook(dropPendingUpdates?: boolean): Promise<boolean>;
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
  verifyChannelAccess(channelId?: string | number): Promise<TelegramChannelVerificationResult>;
}

export type FetchFn = typeof fetch;

export class TelegramClient implements ITelegramClient {
  private botToken?: string;
  private apiBaseUrl: string;
  private customFetch: FetchFn;

  constructor(
    botToken?: string,
    customFetch: FetchFn = fetch,
    apiBaseUrl = 'https://api.telegram.org'
  ) {
    this.botToken = botToken?.trim();
    this.customFetch = customFetch;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.botToken.length > 0);
  }

  private getEndpoint(method: string): string {
    if (!this.botToken) {
      throw new ConfigurationError('TELEGRAM_BOT_TOKEN is not configured');
    }
    return `${this.apiBaseUrl}/bot${this.botToken}/${method}`;
  }

  private async callApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const url = this.getEndpoint(method);

    logger.debug('telegram_api_call_start', `Calling Telegram API method: ${method}`);

    try {
      let signal: AbortSignal | undefined;
      if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        signal = AbortSignal.timeout(8000);
      }

      const response = await this.customFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      const data = (await response.json()) as TelegramApiResponse<T>;

      if (!response.ok || !data.ok) {
        const errorDesc = data.description || `HTTP ${response.status} ${response.statusText}`;
        logger.error('telegram_api_call_failed', `Telegram API error on ${method}: ${errorDesc}`, {
          context: { method, errorCode: data.error_code },
        });
        throw new TelegramApiError(`Telegram API error: ${errorDesc}`, data.error_code, {
          method,
        });
      }

      if (data.result === undefined) {
        throw new TelegramApiError(`Telegram API returned empty result for ${method}`, undefined, {
          method,
        });
      }

      return data.result;
    } catch (err) {
      if (err instanceof TelegramApiError || err instanceof ConfigurationError) {
        throw err;
      }
      logger.error('telegram_network_error', `Network error during Telegram API call ${method}`, {
        error: err,
      });
      throw new TelegramApiError(
        `Failed to reach Telegram API: ${err instanceof Error ? err.message : 'Network error'}`,
        undefined,
        { method }
      );
    }
  }

  /**
   * Get basic information about the bot (getMe)
   */
  public async getMe(): Promise<TelegramUser> {
    return this.callApi<TelegramUser>('getMe');
  }

  /**
   * Send a text message to a specified chat or channel
   */
  public async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    if (!text || text.trim().length === 0) {
      throw new TelegramApiError('Message text cannot be empty');
    }

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      ...options,
    };

    return this.callApi<TelegramMessage>('sendMessage', payload);
  }

  /**
   * Get up to date information about a chat or channel
   */
  public async getChat(chatId: number | string): Promise<TelegramChat> {
    return this.callApi<TelegramChat>('getChat', { chat_id: chatId });
  }

  /**
   * Get information about a member of a chat/channel
   */
  public async getChatMember(chatId: number | string, userId: number): Promise<TelegramChatMember> {
    return this.callApi<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  /**
   * Get list of administrators in a chat/channel
   */
  public async getChatAdministrators(chatId: number | string): Promise<TelegramChatMember[]> {
    return this.callApi<TelegramChatMember[]>('getChatAdministrators', { chat_id: chatId });
  }

  /**
   * Register a webhook endpoint with Telegram
   */
  public async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    if (!url || !url.startsWith('https://')) {
      throw new TelegramApiError('Webhook URL must be a valid HTTPS URL');
    }

    const payload: Record<string, unknown> = {
      url,
      allowed_updates: ['message', 'channel_post', 'edited_channel_post'],
    };

    if (secretToken && secretToken.trim().length > 0) {
      payload.secret_token = secretToken.trim();
    }

    return this.callApi<boolean>('setWebhook', payload);
  }

  /**
   * Remove current webhook integration
   */
  public async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.callApi<boolean>('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  /**
   * Retrieve current webhook status from Telegram
   */
  public async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.callApi<TelegramWebhookInfo>('getWebhookInfo');
  }

  /**
   * Comprehensive diagnostic verification: Checks bot authentication and channel permissions.
   * Never leaks bot tokens or sensitive secrets.
   */
  public async verifyChannelAccess(
    targetChannelId?: string | number
  ): Promise<TelegramChannelVerificationResult> {
    const verifiedAt = Date.now();

    if (!this.isConfigured()) {
      return {
        bot: 'not_configured',
        channel: 'not_configured',
        publishing: 'not_configured',
        verifiedAt,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      };
    }

    // Step 1: Verify Bot Identity
    let botUser: TelegramUser;
    try {
      botUser = await this.getMe();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to authenticate bot token';
      return {
        bot: 'unauthorized',
        channel: targetChannelId ? 'error' : 'not_configured',
        publishing: 'unavailable',
        verifiedAt,
        error: `Bot authentication failed: ${msg}`,
      };
    }

    // Step 2: If no target channel provided
    if (!targetChannelId || String(targetChannelId).trim().length === 0) {
      return {
        bot: 'connected',
        botId: botUser.id,
        botUsername: botUser.username,
        botName: botUser.first_name,
        channel: 'not_configured',
        publishing: 'not_configured',
        verifiedAt,
      };
    }

    const cleanChannelId = typeof targetChannelId === 'string' ? targetChannelId.trim() : targetChannelId;

    // Step 3: Check Channel Reachability & Metadata
    let chatInfo: TelegramChat;
    try {
      chatInfo = await this.getChat(cleanChannelId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach channel';
      const isForbidden = msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('access');
      const isNotFound = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('chat not found');

      return {
        bot: 'connected',
        botId: botUser.id,
        botUsername: botUser.username,
        botName: botUser.first_name,
        channel: isForbidden ? 'forbidden' : isNotFound ? 'not_found' : 'error',
        channelId: cleanChannelId,
        publishing: 'unavailable',
        verifiedAt,
        error: `Channel check error: ${msg}`,
      };
    }

    // Step 4: Check Bot Member Permissions in Channel
    let memberInfo: TelegramChatMember | null = null;
    let canPost = false;
    let memberStatus = 'unknown';

    try {
      memberInfo = await this.getChatMember(cleanChannelId, botUser.id);
      memberStatus = memberInfo.status;

      if (memberInfo.status === 'creator') {
        canPost = true;
      } else if (memberInfo.status === 'administrator') {
        // In channels, administrators typically have can_post_messages
        canPost = memberInfo.can_post_messages !== false;
      } else {
        canPost = false;
      }
    } catch (memberErr) {
      logger.warn('channel_member_check_warning', `Could not inspect member status: ${memberErr instanceof Error ? memberErr.message : 'Unknown'}`);
      // Fallback: If getChat succeeded and type is channel, assume status based on getChat
      memberStatus = 'inaccessible_member_info';
    }

    return {
      bot: 'connected',
      botId: botUser.id,
      botUsername: botUser.username,
      botName: botUser.first_name,
      channel: 'reachable',
      channelId: chatInfo.id,
      channelTitle: chatInfo.title,
      channelUsername: chatInfo.username,
      publishing: canPost ? 'available' : 'restricted',
      memberStatus,
      canPostMessages: canPost,
      verifiedAt,
    };
  }
}
