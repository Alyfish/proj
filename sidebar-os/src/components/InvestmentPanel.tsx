/**
 * Investment Panel - Deal Stream Grid
 * Main view for browsing investment opportunities
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Deal, DealSummary } from './investmentTypes';
import DealCard from './DealCard';
import DealModal from './DealModal';

const API_BASE = 'http://localhost:3003';

interface InvestmentPanelProps {
    onClose: () => void;
}

export const InvestmentPanel: React.FC<InvestmentPanelProps> = ({ onClose }) => {
    const [deals, setDeals] = useState<DealSummary[]>([]);
    const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'saved'>('pending');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDeals();
    }, [filter]);

    const loadDeals = async () => {
        setLoading(true);
        try {
            const status = filter === 'all' ? '' : filter;
            const res = await fetch(`${API_BASE}/opportunities?status=${status}`);
            const data = await res.json();
            setDeals(data);
        } catch (err) {
            console.error('Failed to load deals:', err);
        }
        setLoading(false);
    };

    const openDeal = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/opportunities/${id}`);
            const deal = await res.json();
            setSelectedDeal(deal);
        } catch (err) {
            console.error('Failed to load deal:', err);
        }
    };

    const updateStatus = async (id: string, status: string) => {
        try {
            await fetch(`${API_BASE}/opportunities/${id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            setSelectedDeal(null);
            loadDeals();
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">💰</span>
                    <h2 className="text-lg font-semibold text-white">Deal Flow</h2>
                </div>

                <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
                >
                    ✕
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 p-4 border-b border-white/5">
                {(['pending', 'saved', 'all'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f
                                ? 'bg-white/15 text-white'
                                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Deal grid */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="text-white/40">Loading...</div>
                    </div>
                ) : deals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                        <div className="text-4xl mb-2">📭</div>
                        <div className="text-white/60">No opportunities yet</div>
                        <div className="text-white/40 text-sm mt-1">
                            Check back later or trigger an email scan
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {deals.map((deal) => (
                            <DealCard
                                key={deal.id}
                                deal={deal}
                                onClick={() => openDeal(deal.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Deal Modal */}
            <AnimatePresence>
                {selectedDeal && (
                    <DealModal
                        deal={selectedDeal}
                        onClose={() => setSelectedDeal(null)}
                        onInvest={() => updateStatus(selectedDeal.id, 'invested')}
                        onPass={() => updateStatus(selectedDeal.id, 'passed')}
                        onSave={() => updateStatus(selectedDeal.id, 'saved')}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default InvestmentPanel;
