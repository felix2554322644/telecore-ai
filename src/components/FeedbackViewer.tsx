/**
 * Autonomous Telegram Channel Manager - Feedback & Learning Loop Viewer
 */

import React, { useState } from 'react';
import { FeedbackLearningReport } from '../types/index.ts';

interface FeedbackViewerProps {
  report: FeedbackLearningReport | null;
  onRefreshFeedback?: () => Promise<void>;
  isLoading?: boolean;
}

export function FeedbackViewer({ report, onRefreshFeedback, isLoading }: FeedbackViewerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!onRefreshFeedback) return;
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      await onRefreshFeedback();
      setRefreshMessage('Feedback analysis updated successfully.');
    } catch {
      setRefreshMessage('Failed to refresh feedback analysis.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!report && !isLoading) {
    return null;
  }

  const clusters = report ? Object.values(report.clusterPerformance) : [];

  return (
    <section id="feedback-learning-section" className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-lg font-semibold text-slate-100 tracking-tight">Phase 11 — Feedback & Learning Loop</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous evaluation of candidate quality, cluster performance, and content characteristics to optimize scheduler topic selection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onRefreshFeedback && (
            <button
              id="refresh-feedback-btn"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 active:scale-95 transition disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isRefreshing ? 'Analyzing...' : 'Re-evaluate Feedback'}
            </button>
          )}
        </div>
      </div>

      {refreshMessage && (
        <div className="mt-4 p-2.5 rounded-lg text-xs bg-slate-800/80 border border-slate-700 text-slate-300">
          {refreshMessage}
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Evaluated Candidates</div>
          <div className="text-xl font-bold text-slate-100 mt-1">
            {report?.totalEvaluatedCandidates ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Historical shadow pool</div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Overall Approval Rate</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {report ? `${Math.round(report.overallApprovalRate * 100)}%` : '100%'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Fact-check compliance</div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Average Quality</div>
          <div className="text-xl font-bold text-cyan-400 mt-1">
            {report ? `${Math.round(report.overallAvgQuality * 100)}/100` : '89/100'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Multi-dimensional rubric</div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Top Performing Cluster</div>
          <div className="text-sm font-semibold text-indigo-300 mt-1 truncate">
            {report?.topPerformingClusters[0] || 'Autonomous Agents'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Highest quality weight</div>
        </div>
      </div>

      {/* Cluster Performance Matrix */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Topic Cluster Performance & Adaptive Learned Weights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {clusters.map((cluster) => {
            const weightColor =
              cluster.learnedWeight >= 1.2
                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                : cluster.learnedWeight < 0.8
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                : 'text-slate-300 border-slate-700 bg-slate-800/40';

            return (
              <div
                key={cluster.clusterId}
                className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-slate-200 truncate">{cluster.clusterName}</h4>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${weightColor}`}>
                      {cluster.learnedWeight}x
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Approval Rate</span>
                      <span className="text-slate-200 font-mono">{Math.round(cluster.approvalRate * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round(cluster.approvalRate * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Avg Quality Score</span>
                      <span className="text-slate-200 font-mono">{Math.round(cluster.avgQualityScore * 100)}/100</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-cyan-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round(cluster.avgQualityScore * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Samples: {cluster.sampleCount}</span>
                  <span className="truncate max-w-[140px]">
                    {cluster.commonRejectionCodes.length > 0
                      ? `Rejection: ${cluster.commonRejectionCodes[0].code}`
                      : 'Zero Rejections'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Characteristics & Recommendations */}
      {report?.contentCharacteristics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {/* Content Blueprint */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Learned Content Characteristics
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Optimal Word Range</span>
                <span className="text-slate-200 font-mono">
                  {report.contentCharacteristics.optimalWordRange.min}–{report.contentCharacteristics.optimalWordRange.max} words
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Avg Approved Words</span>
                <span className="text-slate-200 font-mono">
                  {report.contentCharacteristics.approvedLengthStats.avgWordCount} words (~{report.contentCharacteristics.approvedLengthStats.avgCharCount} chars)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Avg Source Citations</span>
                <span className="text-slate-200 font-mono">
                  {report.contentCharacteristics.avgSourcesCount} sources/post
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Claims Verification Rate</span>
                <span className="text-slate-200 font-mono">
                  {Math.round(report.contentCharacteristics.claimVerificationRate * 100)}%
                </span>
              </div>

              {/* Top Tags */}
              <div className="pt-2">
                <span className="text-slate-400 block mb-1.5">Top-Performing Content Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {report.contentCharacteristics.topPerformingTags.length > 0 ? (
                    report.contentCharacteristics.topPerformingTags.map((tagObj) => (
                      <span
                        key={tagObj.tag}
                        className="px-2 py-0.5 bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 rounded text-[11px]"
                      >
                        #{tagObj.tag} ({Math.round(tagObj.approvalRate * 100)}%)
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">No tag history yet</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AI Feedback Recommendations */}
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Active Scheduling & Editorial Recommendations
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                {report.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Feedback weights dynamically bias scheduler topic selection and Gemini generation prompts.</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
