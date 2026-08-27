import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  Award,
  Sparkles,
  Tag,
  Copy,
  Check,
  Eye,
  EyeOff,
  Radio,
  FileCheck,
} from 'lucide-react';
import { ShadowCandidate, QualityBreakdown } from '../types/index.ts';

interface ControlledPublishDashboardProps {
  candidates: ShadowCandidate[];
  onRefresh: () => void;
  defaultChannel?: string;
}

export const ControlledPublishDashboard: React.FC<ControlledPublishDashboardProps> = ({
  candidates,
  onRefresh,
  defaultChannel = '@techpluseai',
}) => {
  const [adminToken, setAdminToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [targetChannel, setTargetChannel] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<ShadowCandidate | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    message: string;
    candidateId?: string;
    messageId?: number;
    channelId?: string;
    publishedAt?: number;
    gateFailures?: string[];
    details?: unknown;
  } | null>(null);

  // Filter for approved unpublished candidates (primary focus of this dashboard)
  const approvedUnpublishedCandidates = candidates.filter(
    (c) => c.status === 'approved' && !c.publishedAt
  );

  const publishedCandidates = candidates.filter((c) => c.status === 'published' || c.publishedAt);
  const rejectedCandidates = candidates.filter((c) => c.status === 'rejected');

  const [activeTab, setActiveTab] = useState<'approved' | 'published' | 'all'>('approved');

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenConfirm = (candidate: ShadowCandidate) => {
    setSelectedCandidate(candidate);
    setShowConfirmModal(true);
    setPublishResult(null);
  };

  const handleExecutePublish = async () => {
    if (!selectedCandidate) return;

    if (!adminToken.trim()) {
      setPublishResult({
        success: false,
        message: 'Admin Secret Token is required to authorize live publication.',
        candidateId: selectedCandidate.id,
      });
      return;
    }

    setIsPublishing(true);
    setPublishResult(null);

    try {
      // Use the existing Phase 13 API endpoint: POST /api/admin/publish-candidate
      const res = await fetch('/api/admin/publish-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken.trim()}`,
        },
        body: JSON.stringify({
          candidateId: selectedCandidate.id,
          targetChannel: targetChannel.trim() || defaultChannel,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setPublishResult({
          success: true,
          message: data.message || `Candidate "${selectedCandidate.topic}" published successfully!`,
          candidateId: selectedCandidate.id,
          messageId: data.messageId || data.candidate?.publishedMessageId,
          channelId: data.channelId || targetChannel || defaultChannel,
          publishedAt: data.publishedAt || Date.now(),
          details: data,
        });
        setShowConfirmModal(false);
        onRefresh();
      } else {
        const failures: string[] = [];
        if (data.gateResult && Array.isArray(data.gateResult.failures)) {
          failures.push(...data.gateResult.failures);
        }
        setPublishResult({
          success: false,
          message: data.error || data.message || 'Publication was blocked by production safeguards.',
          candidateId: selectedCandidate.id,
          gateFailures: failures.length > 0 ? failures : undefined,
          details: data,
        });
      }
    } catch (err: any) {
      setPublishResult({
        success: false,
        message: `Network or dispatch error: ${err.message || 'Request failed'}`,
        candidateId: selectedCandidate.id,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <section id="controlled-publishing-dashboard" className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Controlled Live Publishing Dashboard
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Phase 14A
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Owner-authorized, one-post live publication of approved candidates with 10 re-evaluated safeguard gates.
              </p>
            </div>
          </div>
        </div>

        {/* Global Safety Indicators & Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            10 Safeguard Gates Armed
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
            <Radio className="h-3.5 w-3.5 text-slate-500" />
            Autonomous: Disabled
          </span>
          <button
            id="btn-refresh-controlled-publishing"
            onClick={onRefresh}
            className="text-xs text-slate-700 hover:text-slate-900 font-medium px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 cursor-pointer transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Admin Authentication & Destination Panel */}
      <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-slate-600" />
            Owner Authorization & Target Binding
          </span>
          {adminToken.trim() ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="h-3 w-3" />
              Admin Token Present
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
              <AlertTriangle className="h-3 w-3" />
              Token Required for Dispatch
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="input-admin-secret-token" className="text-[11px] font-semibold text-slate-600">
              Admin Secret Token (ADMIN_SECRET):
            </label>
            <div className="relative">
              <input
                id="input-admin-secret-token"
                type={showToken ? 'text' : 'password'}
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Enter ADMIN_SECRET..."
                className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="button"
                id="btn-toggle-token-visibility"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="input-target-channel-override" className="text-[11px] font-semibold text-slate-600">
              Target Telegram Channel (Defaults to environment binding):
            </label>
            <input
              id="input-target-channel-override"
              type="text"
              value={targetChannel}
              onChange={(e) => setTargetChannel(e.target.value)}
              placeholder={defaultChannel || '@techpluseai'}
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Result Notification Banner */}
      {publishResult && (
        <div
          id="publish-result-banner"
          className={`p-4 rounded-xl border transition space-y-2 ${
            publishResult.success
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm">
              {publishResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
              )}
              <span>{publishResult.success ? 'Publication Successful' : 'Publication Rejected / Blocked'}</span>
            </div>
            <button
              onClick={() => setPublishResult(null)}
              className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>

          <p className="text-xs font-medium leading-relaxed">{publishResult.message}</p>

          {publishResult.success && publishResult.messageId !== undefined && (
            <div className="pt-2 border-t border-emerald-200 flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold">
                Telegram Message ID: #{publishResult.messageId}
              </span>
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">
                Channel: {publishResult.channelId}
              </span>
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">
                Published At: {new Date(publishResult.publishedAt || Date.now()).toLocaleTimeString()}
              </span>
              <span className="text-[11px] text-emerald-700 font-sans font-medium">
                (Anti-replay lock engaged in candidate store)
              </span>
            </div>
          )}

          {!publishResult.success && publishResult.gateFailures && (
            <div className="pt-2 border-t border-rose-200 text-xs">
              <span className="font-semibold block mb-1">Failed Safeguard Checks:</span>
              <ul className="list-disc list-inside space-y-0.5 text-rose-800 font-mono text-[11px]">
                {publishResult.gateFailures.map((failure, idx) => (
                  <li key={idx}>{failure}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tabs & Stats */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-2">
        <div className="flex gap-2">
          <button
            id="tab-approved-candidates"
            onClick={() => setActiveTab('approved')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved Unpublished ({approvedUnpublishedCandidates.length})
          </button>
          <button
            id="tab-published-candidates"
            onClick={() => setActiveTab('published')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'published'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            Published Archive ({publishedCandidates.length})
          </button>
          <button
            id="tab-all-candidates"
            onClick={() => setActiveTab('all')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Candidates ({candidates.length})
          </button>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          {approvedUnpublishedCandidates.length} candidate{approvedUnpublishedCandidates.length === 1 ? '' : 's'} eligible for 1-post live dispatch
        </span>
      </div>

      {/* Candidates List / Grid */}
      {activeTab === 'approved' && approvedUnpublishedCandidates.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
          <FileCheck className="h-8 w-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800">No Approved Unpublished Candidates</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Candidates are generated by the shadow pipeline. When a candidate achieves $\ge 7.5$ quality score and passes deterministic fact checks, it will appear here ready for owner-authorized live publication.
          </p>
        </div>
      ) : null}

      {/* Candidates Card Display */}
      <div className="grid grid-cols-1 gap-4">
        {(activeTab === 'approved'
          ? approvedUnpublishedCandidates
          : activeTab === 'published'
          ? publishedCandidates
          : candidates
        ).map((candidate) => {
          const isApproved = candidate.status === 'approved';
          const isPublished = candidate.status === 'published' || !!candidate.publishedAt;
          const isRejected = candidate.status === 'rejected';

          return (
            <div
              key={candidate.id}
              id={`candidate-card-${candidate.id}`}
              className={`p-5 rounded-xl border transition flex flex-col justify-between space-y-4 ${
                isPublished
                  ? 'border-blue-200 bg-blue-50/10'
                  : isApproved
                  ? 'border-emerald-200 bg-emerald-50/10 hover:border-emerald-300'
                  : 'border-rose-200 bg-rose-50/10'
              }`}
            >
              {/* Header Info */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                          isPublished
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {isPublished ? (
                          <Send className="h-3 w-3" />
                        ) : isApproved ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {isPublished ? 'Published' : candidate.status}
                      </span>

                      {candidate.category && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {candidate.category}
                        </span>
                      )}

                      <span className="text-[11px] font-mono text-slate-400">ID: {candidate.id}</span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-1">{candidate.topic}</h3>
                  </div>

                  {/* Quality & Confidence Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {candidate.qualityScore !== undefined && (
                      <div className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-900 flex items-center gap-1.5 text-xs font-bold">
                        <Award className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Quality: {Math.round(candidate.qualityScore * 10)} / 100</span>
                      </div>
                    )}
                    {candidate.confidenceScore !== undefined && (
                      <div className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 flex items-center gap-1.5 text-xs font-bold">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Confidence: {Math.round(candidate.confidenceScore * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Post Content Preview */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Generated Post Content (Shadow Draft):</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(candidate.draftText, candidate.id)}
                      className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer font-normal"
                    >
                      {copiedId === candidate.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {candidate.draftText}
                  </div>
                </div>

                {/* Quality Score Breakdown (if available) */}
                {candidate.qualityBreakdown && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] pt-1">
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Factual Accuracy</span>
                      <span className="font-bold text-slate-800">
                        {Math.round(candidate.qualityBreakdown.factualAccuracy * 100)}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Technical Depth</span>
                      <span className="font-bold text-slate-800">
                        {Math.round(candidate.qualityBreakdown.technicalDepth * 100)}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Actionable Utility</span>
                      <span className="font-bold text-slate-800">
                        {Math.round(candidate.qualityBreakdown.actionableUtility * 100)}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Clarity & Tone</span>
                      <span className="font-bold text-slate-800">
                        {Math.round((candidate.qualityBreakdown.clarityTone ?? candidate.qualityBreakdown.clarityAndTone ?? 0.9) * 100)}%
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Source Grounding</span>
                      <span className="font-bold text-slate-800">
                        {Math.round(candidate.qualityBreakdown.sourceGrounding * 100)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Tags and Claims */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs pt-1">
                  {candidate.suggestedTags && candidate.suggestedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {candidate.suggestedTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}

                  {candidate.claimsVerified && candidate.claimsVerified.length > 0 && (
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      {candidate.claimsVerified.length} Fact Claims Verified
                    </span>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[11px] font-mono text-slate-400">
                  Recorded: {new Date(candidate.timestamp).toLocaleString()}
                </span>

                {isPublished ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-blue-200">
                      <Send className="h-3.5 w-3.5" />
                      Published (Telegram Message ID: #{candidate.publishedMessageId || 'N/A'})
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">Anti-Replay Active</span>
                  </div>
                ) : isApproved ? (
                  <button
                    id={`btn-publish-one-${candidate.id}`}
                    type="button"
                    onClick={() => handleOpenConfirm(candidate)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition shadow-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publish ONE to Telegram
                  </button>
                ) : (
                  <div className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    Rejected: {candidate.rejectionCode || candidate.rejectionReason || 'Quality threshold not met'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedCandidate && (
        <div
          id="publish-confirmation-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm Controlled Live Publication</h3>
                  <p className="text-xs text-slate-500">Phase 14 One-Post Authorized Dispatch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                Single Live Dispatch Warning
              </div>
              <p className="leading-relaxed">
                This action will publish exactly <strong>ONE</strong> post to your configured Telegram channel. All 10 pre-publication safeguards (Global Kill Switch, Quality & Confidence scores, rate limits, anti-replay lock) will be re-evaluated fail-closed before transmission.
              </p>
            </div>

            {/* Candidate Details Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Candidate ID:</span>
                <span className="font-mono font-bold text-slate-800">{selectedCandidate.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Topic:</span>
                <span className="font-bold text-slate-800 text-right max-w-xs truncate">{selectedCandidate.topic}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Quality Score:</span>
                <span className="font-bold text-indigo-700">
                  {selectedCandidate.qualityScore !== undefined ? `${Math.round(selectedCandidate.qualityScore * 10)} / 100` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Target Channel:</span>
                <span className="font-mono font-bold text-slate-800">
                  {targetChannel.trim() || defaultChannel}
                </span>
              </div>
            </div>

            {/* Admin Secret Verification */}
            <div className="space-y-1">
              <label htmlFor="modal-admin-secret-token" className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Lock className="h-3 w-3 text-slate-400" />
                Confirm Admin Secret Token:
              </label>
              <input
                id="modal-admin-secret-token"
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Enter ADMIN_SECRET..."
                className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                id="btn-confirm-live-publish"
                onClick={handleExecutePublish}
                disabled={isPublishing || !adminToken.trim()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50 shadow-xs"
              >
                {isPublishing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isPublishing ? 'Evaluating Safeguards & Publishing...' : 'Confirm & Publish 1 Post'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg cursor-pointer transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
