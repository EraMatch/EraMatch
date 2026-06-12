import React from 'react';
import { Bot } from 'lucide-react';

export type AgentState =
    | 'disconnected'
    | 'connecting'
    | 'pre-connect-buffering'
    | 'initializing'
    | 'idle'
    | 'listening'
    | 'thinking'
    | 'speaking'
    | 'failed'
    | undefined;

interface AIAgentOrbProps {
    agentState: AgentState;
}

export function AIAgentOrb({ agentState }: AIAgentOrbProps) {
    const currentState = agentState || 'idle';

    return (
        <div className="relative flex items-center justify-center w-36 h-36 md:w-40 md:h-40">
            <style>{`
                @keyframes pulse-ring {
                    0% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.4); opacity: 0; }
                    100% { transform: scale(1); opacity: 0; }
                }
                @keyframes breathe {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .orb-speaking .ring-1 {
                    animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                .orb-speaking .ring-2 {
                    animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    animation-delay: 1s;
                }
                .orb-listening {
                    animation: breathe 3s ease-in-out infinite;
                }
                .orb-thinking-border {
                    animation: spin-slow 4s linear infinite;
                }
            `}</style>

            {currentState === 'speaking' && (
                <div className="absolute inset-0 flex items-center justify-center orb-speaking">
                    <div className="absolute w-full h-full rounded-full bg-indigo-500/30 ring-1" />
                    <div className="absolute w-full h-full rounded-full bg-indigo-500/20 ring-2" />
                </div>
            )}

            {currentState === 'listening' && (
                <div className="absolute inset-[-12px] rounded-full border-4 border-emerald-500/30 orb-listening" />
            )}

            {currentState === 'thinking' && (
                <div className="absolute inset-[-12px] rounded-full border-4 border-dashed border-gray-300 orb-thinking-border" />
            )}

            <div
                className={`relative z-10 flex items-center justify-center w-full h-full rounded-full transition-all duration-700 shadow-xl
                    ${currentState === 'speaking' ? 'bg-gradient-to-tr from-indigo-600 to-indigo-400 shadow-indigo-500/50 scale-105' :
                      currentState === 'listening' ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 shadow-emerald-500/40 orb-listening' :
                      currentState === 'thinking' || currentState === 'failed' ? 'bg-gradient-to-tr from-gray-400 to-gray-300 shadow-gray-400/20' :
                      'bg-gradient-to-tr from-gray-300 to-gray-200 shadow-gray-300/20'}
                `}
            >
                <Bot className="w-14 h-14 md:w-16 md:h-16 text-white drop-shadow-md" strokeWidth={1.5} />
            </div>
        </div>
    );
}
