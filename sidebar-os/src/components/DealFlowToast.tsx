/**
 * Deal Flow Toast - Floating notification for new opportunities
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DealSummary } from './investmentTypes';

interface DealFlowToastProps {
    deals: DealSummary[];
    onDismiss: () => void;
    onViewAll: () => void;
}

export const DealFlowToast: React.FC<DealFlowToastProps> = ({
    deals,
    onDismiss,
    onViewAll
}) => {
    if (deals.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.9 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000]
                   px-4 py-3 rounded-full bg-black/50 backdrop-blur-xl
                   border border-white/10 flex items-center gap-4
                   shadow-2xl cursor-pointer"
                onClick={onViewAll}
            >
                {/* Icon */}
                <span className="text-emerald-400 text-lg">⚡</span>

                {/* Text */}
                <div className="flex items-center gap-2">
                    <span className="text-white/80 font-medium">Deal Flow</span>
                    <span className="text-white/40">•</span>
                    <span className="text-white/60">{deals.length} Opportunit{deals.length === 1 ? 'y' : 'ies'}</span>
                </div>

                {/* Deal pills */}
                <div className="flex gap-2">
                    {deals.slice(0, 2).map((deal) => (
                        <span
                            key={deal.id}
                            className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs"
                        >
                            {deal.company_name} {deal.signal_score !== undefined && `(${deal.signal_score})`}
                        </span>
                    ))}
                    {deals.length > 2 && (
                        <span className="px-2 py-1 rounded-full bg-white/10 text-white/60 text-xs">
                            +{deals.length - 2}
                        </span>
                    )}
                </div>

                {/* Dismiss button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss();
                    }}
                    className="ml-2 text-white/40 hover:text-white/70 transition-colors"
                >
                    ✕
                </button>
            </motion.div>
        </AnimatePresence>
    );
};

export default DealFlowToast;
