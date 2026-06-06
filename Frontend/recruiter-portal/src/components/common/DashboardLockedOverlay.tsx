import { Lock } from 'lucide-react';

export default function DashboardLockedOverlay() {
  return (
    <div className="absolute inset-0 backdrop-blur-sm bg-white/40 rounded-3xl z-20 flex items-center justify-center">
      <div className="animate-fade-in-scale bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 max-w-xs text-center">
        <div className="bg-indigo-50 rounded-2xl p-4">
          <Lock size={40} className="text-indigo-500" />
        </div>
        <h3 className="text-gray-800 font-semibold text-lg">No Data Available</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          Start by creating a project and adding candidates to see your recruitment metrics here.
        </p>
      </div>
    </div>
  );
}
