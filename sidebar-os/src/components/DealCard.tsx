/**
 * Deal Card - Sentex Glass Card for Investment Opportunities
 */

import React from 'react';
import { DealSummary } from './investmentTypes';
import SignalScoreRing from './SignalScoreRing';

interface DealCardProps {
    deal: DealSummary;
    onClick: () => void;
}

export const DealCard: React.FC<DealCardProps> = ({ deal, onClick }) => {
    const getActionColor = (action?: string) => {
        switch (action) {
            case 'MUST READ': return 'bg-emerald-500/20 text-emerald-300';
            case 'INTERESTING': return 'bg-yellow-500/20 text-yellow-300';
            case 'PASS': return 'bg-red-500/20 text-red-300';
            default: return 'bg-white/10 text-white/60';
        }
    };

    const formatAmount = (amount?: number) => {
        if (!amount) return null;
        if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}k`;
        return `$${amount}`;
    };

    return (
        <div
            onClick={onClick}
            className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-[40px] 
                 overflow-hidden cursor-pointer transition-all duration-200
                 hover:border-white/20 hover:bg-black/40 hover:scale-[1.02]"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    {/* Logo placeholder or initial */}
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/10 to-white/5 
                          flex items-center justify-center text-lg font-bold text-white/60">
                        {deal.logo_url ? (
                            <img src={deal.logo_url} alt="" className="w-full h-full rounded-lg object-cover" />
                        ) : (
                            deal.company_name[0]
                        )}
                    </div>
                    <div>
                        <h3 className="font-medium text-white">{deal.company_name}</h3>
                        <span className="text-xs text-white/50">{deal.stage || 'Startup'}</span>
                    </div>
                </div>

                {/* Signal Score */}
                {deal.signal_score !== undefined && (
                    <SignalScoreRing score={deal.signal_score} size={44} />
                )}
            </div>

            {/* Body - Action badge */}
            <div className="p-4">
                {deal.action && (
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getActionColor(deal.action)}`}>
                        {deal.action}
                    </span>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 bg-white/5">
                <div className="flex gap-2">
                    {deal.stage && (
                        <span className="px-2 py-1 rounded bg-white/10 text-[10px] text-white/60">
                            {deal.stage}
                        </span>
                    )}
                    {deal.min_check && (
                        <span className="px-2 py-1 rounded bg-white/10 text-[10px] text-white/60">
                            min: {formatAmount(deal.min_check)}
                        </span>
                    )}
                </div>

                {deal.deadline && (
                    <span className="text-[10px] text-red-400">
                        Closes: {deal.deadline}
                    </span>
                )}
            </div>
        </div>
    );
};

export default DealCard;
