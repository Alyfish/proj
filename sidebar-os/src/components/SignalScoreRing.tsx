/**
 * Signal Score Ring - Circular progress indicator
 * Sentex Glass styling
 */

import React from 'react';

interface SignalScoreRingProps {
    score: number;
    size?: number;
}

export const SignalScoreRing: React.FC<SignalScoreRingProps> = ({
    score,
    size = 48
}) => {
    // Calculate color based on score
    const getColor = (s: number) => {
        if (s >= 80) return '#4ADE80'; // Green
        if (s >= 60) return '#FACC15'; // Yellow
        return '#F87171'; // Red
    };

    const color = getColor(score);
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const offset = circumference - progress;

    return (
        <div
            className="relative flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            {/* Background ring */}
            <svg
                className="absolute"
                width={size}
                height={size}
                style={{ transform: 'rotate(-90deg)' }}
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="4"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>

            {/* Score text */}
            <span
                className="text-sm font-bold"
                style={{ color }}
            >
                {score}
            </span>
        </div>
    );
};

export default SignalScoreRing;
