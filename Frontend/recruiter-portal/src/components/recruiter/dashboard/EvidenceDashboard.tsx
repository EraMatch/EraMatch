import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';

interface LogEntry {
  timestamp: number;
  step: string;
  data: any;
}

interface Violation {
  type: string;
  description: string;
  severity: string;
  timestamp: number;
}

interface ProctoringSession {
  session_id: string;
  tab_switch_count: number;
  max_tab_switches: number;
  is_terminated: boolean;
  cheating_event_count: number;
  trust_score: number;
  violation_count: number;
  liveness_stats: any;
  has_reference_face: boolean;
  uptime_seconds: number;
  violations?: Violation[];
}

export const EvidenceDashboard = () => {
  const [sessions, setSessions] = useState<ProctoringSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group violations by category for a specific session
  const getViolationsByCategory = (session: ProctoringSession) => {
    const groups: Record<string, Violation[]> = {
      Browser: [],
      Gaze: [],
      Environment: [],
      Voice: [],
      Other: []
    };

    const violations = session.violations || [];
    
    violations.forEach(v => {
      if (v.type === 'tab_switch' || v.type === 'window_blur') {
        groups.Browser.push(v);
      } else if (v.type.includes('gaze') || v.type === 'missing_person') {
        groups.Gaze.push(v);
      } else if (v.type === 'audio_spike' || v.type === 'voice_switch') {
        groups.Voice.push(v);
      } else if (v.type === 'person_count' || v.type === 'prohibited_object' || v.description?.includes('phone') || v.description?.includes('book')) {
        groups.Environment.push(v);
      } else {
        groups.Other.push(v);
      }
    });

    return groups;
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      // Fetch active proctoring sessions from the backend
      // Assuming GET /api/v1/proctoring/sessions or similar
      const res = await fetch('http://localhost:8000/api/v1/proctoring/sessions'); // Adjust as needed
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && sessions.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#edf0f8]">
        <p className="text-gray-500 font-medium">Loading Evidence Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proctoring Evidence Dashboard</h1>
          <p className="text-gray-500 mt-1">Review live and completed candidate sessions and their cheating violations grouped by category.</p>
        </div>
        <button 
          onClick={fetchSessions}
          className="px-4 py-2 bg-[#6941C6] text-white rounded-md font-medium hover:bg-[#53389E] transition-colors"
        >
          Refresh Data
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No active proctoring sessions found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sessions.map(session => {
            const groups = getViolationsByCategory(session);
            
            return (
              <div key={session.session_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 px-6 py-4 bg-gray-50 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Session ID: {session.session_id}</h2>
                    <p className="text-sm text-gray-500">Uptime: {session.uptime_seconds}s | Status: {session.is_terminated ? <span className="text-red-600 font-medium">Terminated</span> : <span className="text-green-600 font-medium">Active</span>}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${session.trust_score < 50 ? 'text-red-600' : session.trust_score < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {session.trust_score}/100
                    </div>
                    <div className="text-sm font-medium text-gray-500">Trust Score</div>
                  </div>
                </div>
                
                <div className="p-6">
                  {session.violation_count === 0 ? (
                    <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      No violations detected in this session yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {/* Browser Violations */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-semibold text-gray-900 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                            Browser
                          </h3>
                          <span className="bg-gray-100 text-gray-600 text-xs py-1 px-2 rounded-full font-medium">{groups.Browser.length}</span>
                        </div>
                        {groups.Browser.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No events</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {groups.Browser.map((v, i) => (
                              <li key={i} className="text-gray-700 bg-gray-50 p-2 rounded">
                                {v.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Gaze Violations */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-semibold text-gray-900 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                            Gaze
                          </h3>
                          <span className="bg-gray-100 text-gray-600 text-xs py-1 px-2 rounded-full font-medium">{groups.Gaze.length}</span>
                        </div>
                        {groups.Gaze.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No events</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {groups.Gaze.map((v, i) => (
                              <li key={i} className="text-gray-700 bg-gray-50 p-2 rounded">
                                {v.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Environment Violations */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-semibold text-gray-900 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                            Environment
                          </h3>
                          <span className="bg-gray-100 text-gray-600 text-xs py-1 px-2 rounded-full font-medium">{groups.Environment.length}</span>
                        </div>
                        {groups.Environment.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No events</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {groups.Environment.map((v, i) => (
                              <li key={i} className="text-gray-700 bg-gray-50 p-2 rounded">
                                {v.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Voice Violations */}
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-semibold text-gray-900 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
                            Voice
                          </h3>
                          <span className="bg-gray-100 text-gray-600 text-xs py-1 px-2 rounded-full font-medium">{groups.Voice.length}</span>
                        </div>
                        {groups.Voice.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">No events</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {groups.Voice.map((v, i) => (
                              <li key={i} className="text-gray-700 bg-gray-50 p-2 rounded">
                                {v.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
