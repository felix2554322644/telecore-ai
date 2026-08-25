/**
 * Autonomous Telegram Channel Manager - Telegram Manager & Test Publication Component
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  PublicConfig,
  TelegramChannelVerificationResult,
  TelegramWebhookInfo,
} from '../types/index.ts';

interface TelegramManagerProps {
  config: PublicConfig | null;
  onRefresh: () => Promise<void>;
}

export const TelegramManager: React.FC<TelegramManagerProps> = ({ config, onRefresh }) => {
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>(
    '🚀 TeleCore AI Foundation Test\n\nAutonomous channel manager foundation verified on Cloudflare Workers architecture.\n\n#AI #Technology #Automation'
  );
  const [parseMode, setParseMode] = useState<'Markdown' | 'HTML'>('Markdown');
  const [disableNotification, setDisableNotification] = useState<boolean>(false);

  // States
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<TelegramChannelVerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishResult, setPublishResult] = useState<any>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [webhookUrlInput, setWebhookUrlInput] = useState<string>('');
  const [isWebhookLoading, setIsWebhookLoading] = useState<boolean>(false);
  const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(null);
  const [webhookFeedback, setWebhookFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Verify Bot & Channel
  const handleVerifyAccess = async () => {
    setIsVerifying(true);
    setVerificationError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret.trim()) {
        headers['Authorization'] = `Bearer ${adminSecret.trim()}`;
      }

      const res = await fetch('/api/admin/telegram/verify', {
        method: 'POST',
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to verify Telegram credentials');
      }

      setVerificationResult(data.verification);
      await onRefresh();
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  // 2. Publish Test Message
  const handleTestPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim()) return;

    setIsPublishing(true);
    setPublishResult(null);
    setPublishError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret.trim()) {
        headers['Authorization'] = `Bearer ${adminSecret.trim()}`;
      }

      const res = await fetch('/api/admin/telegram/test-publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: testMessage,
          parse_mode: parseMode,
          disable_notification: disableNotification,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Test publication failed');
      }

      setPublishResult(data.result);
      await onRefresh();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to publish test message');
    } finally {
      setIsPublishing(false);
    }
  };

  // 3. Webhook Info
  const handleGetWebhookInfo = async () => {
    setIsWebhookLoading(true);
    setWebhookFeedback(null);
    try {
      const headers: Record<string, string> = {};
      if (adminSecret.trim()) {
        headers['Authorization'] = `Bearer ${adminSecret.trim()}`;
      }

      const res = await fetch('/api/admin/telegram/webhook-info', { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to retrieve webhook info');
      }
      setWebhookInfo(data.webhookInfo);
    } catch (err) {
      setWebhookFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not fetch webhook info',
      });
    } finally {
      setIsWebhookLoading(false);
    }
  };

  // 4. Setup Webhook
  const handleSetupWebhook = async () => {
    setIsWebhookLoading(true);
    setWebhookFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret.trim()) {
        headers['Authorization'] = `Bearer ${adminSecret.trim()}`;
      }

      const res = await fetch('/api/admin/telegram/setup-webhook', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          webhookUrl: webhookUrlInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to setup webhook');
      }

      setWebhookFeedback({
        type: 'success',
        message: `Webhook registered to ${data.webhookUrl}`,
      });
      await handleGetWebhookInfo();
    } catch (err) {
      setWebhookFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to register webhook',
      });
    } finally {
      setIsWebhookLoading(false);
    }
  };

  // 5. Delete Webhook
  const handleDeleteWebhook = async () => {
    if (!window.confirm('Delete webhook from Telegram? Pending updates will be dropped.')) return;
    setIsWebhookLoading(true);
    setWebhookFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminSecret.trim()) {
        headers['Authorization'] = `Bearer ${adminSecret.trim()}`;
      }

      const res = await fetch('/api/admin/telegram/delete-webhook', {
        method: 'POST',
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to delete webhook');
      }

      setWebhookFeedback({
        type: 'success',
        message: 'Webhook deleted successfully',
      });
      setWebhookInfo(null);
    } catch (err) {
      setWebhookFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete webhook',
      });
    } finally {
      setIsWebhookLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Controlled Phase Safety Notice */}
      <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-lg bg-sky-100 text-sky-700 shrink-0 mt-0.5">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold text-sky-950">Telegram Integration & Publishing Control</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-200/80 text-sky-900 border border-sky-300 uppercase tracking-wide">
                Test Mode Active
              </span>
            </div>
            <p className="text-xs text-sky-800 mt-1">
              Autonomous publishing is paused. All channel communication in this phase is restricted to owner-initiated tests and diagnostic verifications.
            </p>
          </div>
        </div>

        {/* Global Admin Secret Field */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative">
            <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Enter ADMIN_SECRET..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 w-52"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Diagnostics & Credentials (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Bot & Channel Diagnostics */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Connectivity & Identity</h3>
              </div>
              <button
                id="btn-verify-telegram"
                onClick={handleVerifyAccess}
                disabled={isVerifying}
                className="flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                {isVerifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Verify Access</span>
              </button>
            </div>

            {verificationError && (
              <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Bot Status Row */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Telegram Bot</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded border ${
                    config?.telegramConfigured
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {verificationResult?.botUsername
                    ? `@${verificationResult.botUsername}`
                    : config?.telegramConfigured
                    ? 'Token Configured'
                    : 'Missing Token'}
                </span>
              </div>

              {/* Channel Status Row */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Target Channel</span>
                <span className="font-mono text-slate-800">
                  {config?.channelId || (config?.channelIdConfigured ? 'Configured' : 'Not Configured')}
                </span>
              </div>

              {/* Publishing Capability Row */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-600 font-medium">Channel Publishing</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded border ${
                    verificationResult?.publishing === 'available'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : verificationResult?.publishing === 'restricted'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {verificationResult?.publishing
                    ? verificationResult.publishing.toUpperCase()
                    : 'AWAITING VERIFICATION'}
                </span>
              </div>

              {verificationResult && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs space-y-1 text-emerald-900">
                  <div className="font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Verified Details</span>
                  </div>
                  {verificationResult.channelTitle && (
                    <div>Channel: <span className="font-medium">{verificationResult.channelTitle}</span></div>
                  )}
                  {verificationResult.memberStatus && (
                    <div>Bot Role: <span className="font-medium">{verificationResult.memberStatus}</span></div>
                  )}
                  {verificationResult.botId && (
                    <div>Bot ID: <span className="font-mono">{verificationResult.botId}</span></div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card: Webhook Endpoint Control */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Link2 className="h-4 w-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Webhook Management</h3>
              </div>
              <button
                onClick={handleGetWebhookInfo}
                disabled={isWebhookLoading}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium"
              >
                Inspect Webhook
              </button>
            </div>

            {webhookFeedback && (
              <div
                className={`mt-3 p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                  webhookFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {webhookFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span>{webhookFeedback.message}</span>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Public HTTPS Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://your-worker.workers.dev/webhooks/telegram"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Leave empty to use APP_URL environment variable if set.
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleSetupWebhook}
                  disabled={isWebhookLoading}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition disabled:opacity-50"
                >
                  {isWebhookLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  <span>Set Webhook</span>
                </button>
                <button
                  onClick={handleDeleteWebhook}
                  disabled={isWebhookLoading}
                  className="p-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition"
                  title="Delete Webhook"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {webhookInfo && (
                <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="font-semibold text-slate-800">Current Webhook State:</div>
                  <div className="text-slate-600 truncate font-mono text-[11px]">
                    URL: {webhookInfo.url || 'None (polling/inactive)'}
                  </div>
                  <div className="text-slate-600">
                    Pending Updates: <span className="font-semibold">{webhookInfo.pending_update_count}</span>
                  </div>
                  {webhookInfo.last_error_message && (
                    <div className="text-rose-600 text-[11px]">
                      Last error: {webhookInfo.last_error_message}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Controlled Test Publisher (7 cols) */}
        <div className="lg:col-span-7">
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  TEST TELEGRAM MESSAGE (Owner-Initiated Test)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {testMessage.length} / 4096 chars
              </span>
            </div>

            <form onSubmit={handleTestPublish} className="mt-4 space-y-4">
              {publishError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{publishError}</span>
                </div>
              )}

              {publishResult && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Message Published Successfully to Telegram Channel!</span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-700">
                    Message ID: #{publishResult.messageId} | Channel: {publishResult.channelTitle} | Chat ID: {publishResult.chatId}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message Content (Markdown / Text)
                </label>
                <textarea
                  id="input-test-message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={6}
                  maxLength={4096}
                  placeholder="Compose test message..."
                  className="w-full text-xs font-mono p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Presets */}
              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-400 font-medium">Presets:</span>
                <button
                  type="button"
                  onClick={() =>
                    setTestMessage(
                      '🚀 TeleCore AI Foundation Test\n\nAutonomous channel manager foundation verified on Cloudflare Workers architecture.\n\n#AI #Technology #Automation'
                    )
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  System Test
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTestMessage(
                      '💡 **Tech Insight: Zero-Cold-Start AI Workers**\n\nBy leveraging Cloudflare Workers with streaming Gemini models, latency drops from seconds to sub-200ms.\n\nKey takeaways:\n• Serverless edge execution\n• Minimal memory footprint\n• Secret isolation via wrangler bindings'
                    )
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Tech Insight
                </button>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-600">Parse Mode:</label>
                  <select
                    value={parseMode}
                    onChange={(e) => setParseMode(e.target.value as any)}
                    className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="Markdown">Markdown</option>
                    <option value="HTML">HTML</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="silent-notify"
                    checked={disableNotification}
                    onChange={(e) => setDisableNotification(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <label htmlFor="silent-notify" className="text-xs text-slate-600 cursor-pointer">
                    Silent Notification
                  </label>
                </div>
              </div>

              {/* Send Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Will post to channel: {config?.channelId || 'configured channel'}</span>
                </div>

                <button
                  id="btn-send-telegram-test"
                  type="submit"
                  disabled={isPublishing || !testMessage.trim()}
                  className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition shadow-xs disabled:opacity-50"
                >
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>Publish Test Message</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
