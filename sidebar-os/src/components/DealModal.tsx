/**
 * Deal Modal - Deep Dive View
 * Full analysis with verdict, metrics, and actions
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Deal } from './investmentTypes';
import SignalScoreRing from './SignalScoreRing';

interface DealModalProps {
    deal: Deal;
    onClose: () => void;
    onInvest: () => void;
    onPass: () => void;
    onSave: () => void;
}

export const DealModal: React.FC<DealModalProps> = ({
    deal,
    onClose,
    onInvest,
    onPass,
    onSave
}) => {
    const verdict = deal.verdict;
    const terms = deal.terms;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-2xl max-h-[80vh] overflow-auto
                   bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-2xl"
            >
                {/* Header */}
                <div className="sticky top-0 bg-[#0d0d0d] border-b border-white/10 p-4 z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Logo */}
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 
                              flex items-center justify-center text-xl font-bold text-white/60">
                                {deal.logo_url ? (
                                    <img src={deal.logo_url} alt="" className="w-full h-full rounded-xl object-cover" />
                                ) : (
                                    deal.company_name[0]
                                )}
                            </div>

                            <div>
                                <h2 className="text-xl font-semibold text-white">{deal.company_name}</h2>
                                <p className="text-sm text-white/60">{verdict?.one_line_pitch || deal.email_subject}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {verdict && <SignalScoreRing score={verdict.signal_score} size={56} />}

                            {terms?.deadline && (
                                <div className="text-right">
                                    <div className="text-xs text-white/40">Invest by</div>
                                    <div className="text-red-400 font-medium">{terms.deadline}</div>
                                </div>
                            )}

                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column - Facts */}
                    <div className="space-y-4">
                        <h3 className="font-mono text-xs text-white/40 uppercase tracking-wider">// TERMS</h3>

                        <div className="space-y-2 bg-white/5 rounded-lg p-4">
                            {terms?.min_check && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/50">Min_Ticket:</span>
                                    <span className="text-white font-medium">${terms.min_check.toLocaleString()}</span>
                                </div>
                            )}
                            {terms?.valuation && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/50">Valuation:</span>
                                    <span className="text-white font-medium">{terms.valuation}</span>
                                </div>
                            )}
                            {terms?.lead_investor && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/50">Lead:</span>
                                    <span className="text-white font-medium">{terms.lead_investor}</span>
                                </div>
                            )}
                            {deal.stage && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/50">Stage:</span>
                                    <span className="text-white font-medium">{deal.stage}</span>
                                </div>
                            )}
                        </div>

                        {/* Metrics */}
                        {verdict?.metrics && verdict.metrics.length > 0 && (
                            <>
                                <h3 className="font-mono text-xs text-white/40 uppercase tracking-wider mt-6">// METRICS</h3>
                                <div className="space-y-2">
                                    {verdict.metrics.map((m, i) => (
                                        <div key={i} className="flex justify-between text-sm bg-white/5 rounded-lg p-3">
                                            <span className="text-white/50">{m.label}:</span>
                                            <span className={`font-medium ${m.sentiment === 'positive' ? 'text-emerald-400' :
                                                    m.sentiment === 'negative' ? 'text-red-400' : 'text-white'
                                                }`}>
                                                {m.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Right Column - Verdict */}
                    <div className="space-y-4">
                        {verdict && (
                            <>
                                <h3 className="font-mono text-xs text-white/40 uppercase tracking-wider">// VERDICT</h3>
                                <p className="text-white/80 text-sm leading-relaxed bg-white/5 rounded-lg p-4">
                                    {verdict.executive_summary}
                                </p>

                                {/* Bull case */}
                                {verdict.bull_case.length > 0 && (
                                    <div>
                                        <h4 className="text-emerald-400 text-xs font-medium mb-2">✨ ALPHA</h4>
                                        <ul className="space-y-1">
                                            {verdict.bull_case.map((point, i) => (
                                                <li key={i} className="text-sm text-white/70 flex gap-2">
                                                    <span className="text-emerald-400">•</span>
                                                    {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Bear case */}
                                {verdict.bear_case.length > 0 && (
                                    <div>
                                        <h4 className="text-red-400 text-xs font-medium mb-2">⚠ RED FLAGS</h4>
                                        <ul className="space-y-1">
                                            {verdict.bear_case.map((risk, i) => (
                                                <li key={i} className="text-sm text-white/70 flex gap-2">
                                                    <span className="text-red-400">•</span>
                                                    {risk}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Competitors */}
                                {verdict.competitors.length > 0 && (
                                    <div>
                                        <h4 className="text-yellow-400 text-xs font-medium mb-2">🎯 COMPETITORS</h4>
                                        <ul className="space-y-1">
                                            {verdict.competitors.map((c, i) => (
                                                <li key={i} className="text-sm text-white/70">
                                                    <span className="font-medium">{c.name}</span>: {c.differentiation}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="sticky bottom-0 bg-[#0d0d0d] border-t border-white/10 p-4 flex gap-3 justify-end">
                    <button
                        onClick={onPass}
                        className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
                    >
                        Pass
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition"
                    >
                        Save for Later
                    </button>
                    <button
                        onClick={onInvest}
                        className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition"
                    >
                        Invest
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default DealModal;
