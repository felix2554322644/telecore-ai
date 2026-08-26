import {
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  Tag,
  ShieldCheck,
  RefreshCw,
  Award,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import React, { useState } from 'react';
import { ShadowCandidate } from '../types/index.ts';

interface CandidatesViewerProps {
  candidates: ShadowCandidate[];
  stats?: {
    total: number;
    approved: number;
    rejected: number;
    avgQualityScore?: number;
    avgConfidenceScore?: number;
  };
  onRefresh: () => void;
}

export const CandidatesViewer: React.FC<CandidatesViewerProps> = ({
  candidates,
  stats,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<ShadowCandidate | null>(null);

  const filteredCandidates = candidates.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  return (
    <section className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Autonomous Shadow Candidates & Quality Selection
          </h2>
          <p className="text-xs text-slate-500">
            Fact-checked candidate posts with quality scoring, similarity filtering, and rejection diagnostics. Real Telegram publishing is strictly disabled.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats && (
            <div className="flex items-center gap-1 text-xs flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                Total: {stats.total}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                Approved: {stats.approved}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-medium">
                Rejected: {stats.rejected}
              </span>
              {stats.avgQualityScore !== undefined && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-medium flex items-center gap-1">
                  <Award className="h-3 w-3" />
                  Avg Quality: {Math.round(stats.avgQualityScore * 100)}%
                </span>
              )}
            </div>
          )}
          <button
            onClick={onRefresh}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1 rounded bg-slate-100 border border-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'approved', 'rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition cursor-pointer ${
              filter === tab
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab} {tab === 'all' ? `(${candidates.length})` : `(${candidates.filter((c) => c.status === tab).length})`}
          </button>
        ))}
      </div>

      {filteredCandidates.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
          <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-xs font-semibold text-slate-800">No Candidates Recorded Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Candidates are generated automatically when the scheduled cron triggers or when test pipeline events are dispatched.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCandidates.map((cand) => (
            <div
              key={cand.id}
              onClick={() => setSelectedCandidate(cand)}
              className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-3 ${
                cand.status === 'approved'
                  ? 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40'
                  : 'border-rose-200 bg-rose-50/20 hover:bg-rose-50/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                        cand.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {cand.status === 'approved' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {cand.status}
                    </span>

                    {cand.rejectionCode && (
                      <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-rose-100/80 text-rose-700 border border-rose-200">
                        {cand.rejectionCode}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(cand.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-slate-900 line-clamp-1">{cand.topic}</h3>
                <p className="text-xs text-slate-600 line-clamp-3 font-mono bg-white/80 p-2 rounded border border-slate-200">
                  {cand.draftText}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                {cand.suggestedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cand.suggestedTags.map((t, idx) => (
                      <span key={idx} className="inline-flex items-center gap-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        <Tag className="h-2.5 w-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 pt-1">
                  {cand.qualityScore !== undefined ? (
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Award className="h-3 w-3 text-indigo-500" />
                      Quality: {Math.round(cand.qualityScore * 100)}%
                    </span>
                  ) : (
                    <span></span>
                  )}
                  {cand.confidenceScore !== undefined && (
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" />
                      Confidence: {Math.round(cand.confidenceScore * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      selectedCandidate.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {selectedCandidate.status}
                  </span>
                  {selectedCandidate.rejectionCode && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                      {selectedCandidate.rejectionCode}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{selectedCandidate.topic}</h3>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedCandidate.id}</p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quality Score Breakdown Card */}
            {selectedCandidate.qualityBreakdown && (
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                  <span className="flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-indigo-600" />
                    Quality Assessment Breakdown
                  </span>
                  {selectedCandidate.qualityScore !== undefined && (
                    <span className="text-sm font-bold text-indigo-700">
                      Overall: {Math.round(selectedCandidate.qualityScore * 100)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-white border border-indigo-50">
                    <span className="text-slate-500 block">Factual Accuracy:</span>
                    <span className="font-semibold text-slate-800">
                      {Math.round(selectedCandidate.qualityBreakdown.factualAccuracy * 100)}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-indigo-50">
                    <span className="text-slate-500 block">Technical Depth:</span>
                    <span className="font-semibold text-slate-800">
                      {Math.round(selectedCandidate.qualityBreakdown.technicalDepth * 100)}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-indigo-50">
                    <span className="text-slate-500 block">Actionable Utility:</span>
                    <span className="font-semibold text-slate-800">
                      {Math.round(selectedCandidate.qualityBreakdown.actionableUtility * 100)}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-indigo-50">
                    <span className="text-slate-500 block">Clarity & Tone:</span>
                    <span className="font-semibold text-slate-800">
                      {Math.round(selectedCandidate.qualityBreakdown.clarityTone * 100)}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white border border-indigo-50">
                    <span className="text-slate-500 block">Source Grounding:</span>
                    <span className="font-semibold text-slate-800">
                      {Math.round(selectedCandidate.qualityBreakdown.sourceGrounding * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Generated Post Content (Shadow Draft):</label>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap">
                {selectedCandidate.draftText}
              </div>
            </div>

            {selectedCandidate.claimsVerified && selectedCandidate.claimsVerified.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Fact-Check Claim Verification:</label>
                <div className="space-y-1">
                  {selectedCandidate.claimsVerified.map((c, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-slate-50 border border-slate-100 flex items-start gap-2">
                      {c.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-slate-800">{c.claim}</p>
                        {c.citation && <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{c.citation}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCandidate.rejectionReason && (
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Rejection Diagnostics
                </div>
                <p>{selectedCandidate.rejectionReason}</p>
              </div>
            )}

            {selectedCandidate.metadata?.similarityMatch && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Copy className="h-4 w-4 text-amber-600" />
                  Duplicate / Similarity Match Details
                </div>
                <p className="font-mono text-[11px]">
                  Matched candidate: {JSON.stringify(selectedCandidate.metadata.similarityMatch)}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

