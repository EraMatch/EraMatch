import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card } from '../ui/card';
import { Loader2, Users } from 'lucide-react';
import { useRecruiterWorkload } from '../../hooks/admin/useAdminDashboard';

interface RecruiterWorkloadChartProps {
  onDataUpdate?: (data: any) => void;
}

export function RecruiterWorkloadChart({ onDataUpdate }: RecruiterWorkloadChartProps) {
  const [viewMode, setViewMode] = useState<'combined' | 'separated'>('combined');

  const { data: workloadData, isLoading } = useRecruiterWorkload();

  const chartData: any[] = workloadData?.allRecruiters
    ? workloadData.allRecruiters
        .sort((a: any, b: any) => {
          // Sort by type first (HR first), then by positions count descending
          if (a.type !== b.type) return a.type === 'HR' ? -1 : 1;
          return b.positionsCount - a.positionsCount;
        })
        .map((recruiter: any, index: number) => ({
          name: recruiter.name.split(' ')[0], // Use first name for chart readability
          fullName: recruiter.name,
          positionsCount: recruiter.positionsCount,
          type: recruiter.type,
          color: recruiter.type === 'HR' ? '#6366F1' : '#10B981',
          index
        }))
    : [];

  const summary: any = workloadData?.summary ?? {};

  if (isLoading) {
    return (
      <Card className="p-6 rounded-3xl shadow-sm">
        <div className="flex items-center justify-center h-80">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </Card>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="p-6 rounded-3xl shadow-sm">
        <div className="flex flex-col items-center justify-center h-80 text-gray-500">
          <Users className="w-12 h-12 mb-3 text-gray-300" />
          <p>No recruiter workload data available</p>
        </div>
      </Card>
    );
  }

  // Separate data by type
  const hrData = chartData.filter(d => d.type === 'HR');
  const techData = chartData.filter(d => d.type === 'Technical');

  const getLoadColor = (count: number, avgLoad: number) => {
    if (count === 0) return '#D1D5DB'; // Gray for no load
    if (count > avgLoad * 1.3) return '#EF4444'; // Red for overload
    if (count > avgLoad * 0.7) return '#F59E0B'; // Amber for medium
    return '#10B981'; // Green for balanced
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-gray-900 font-medium">{data.fullName}</p>
          <p className="text-gray-600 text-sm">
            {data.type} • <span className="font-semibold">{data.positionsCount}</span> positions
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6 rounded-3xl shadow-sm">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-gray-900 text-lg font-semibold mb-1">Recruiter Workload Distribution</h3>
        <p className="text-gray-500 text-sm">Positions assigned across all recruiters</p>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setViewMode('combined')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'combined'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Combined View
        </button>
        <button
          onClick={() => setViewMode('separated')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'separated'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Separated View
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm mb-1">HR Team Load</p>
          <p className="text-2xl font-bold text-indigo-600">{summary?.hrTotalLoad || 0}</p>
          <p className="text-xs text-gray-600 mt-1">
            {summary?.hrCount || 0} recruiters • Avg: {summary?.avgHRLoad?.toFixed(1) || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4">
          <p className="text-gray-600 text-sm mb-1">Technical Team Load</p>
          <p className="text-2xl font-bold text-emerald-600">{summary?.technicalTotalLoad || 0}</p>
          <p className="text-xs text-gray-600 mt-1">
            {summary?.technicalCount || 0} recruiters • Avg: {summary?.avgTechnicalLoad?.toFixed(1) || 0}
          </p>
        </div>
      </div>

      {/* Charts */}
      {viewMode === 'combined' && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 12, fill: '#6B7280' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7280' }}
                label={{ value: 'Positions Assigned', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => <span style={{ color: '#6B7280' }}>{value}</span>}
              />
              <Bar dataKey="positionsCount" fill="#6366F1" name="Positions" radius={[8, 8, 0, 0]}>
                {chartData.map((entry: any, index: number) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getLoadColor(
                      entry.positionsCount,
                      entry.type === 'HR' ? summary?.avgHRLoad : summary?.avgTechnicalLoad
                    )}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {viewMode === 'separated' && (
        <div className="space-y-6">
          {/* HR Team */}
          {hrData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h4 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                HR Recruiters ({hrData.length})
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={hrData}
                  margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="positionsCount" fill="#6366F1" name="Positions" radius={[8, 8, 0, 0]}>
                    {hrData.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getLoadColor(entry.positionsCount, summary?.avgHRLoad)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Technical Team */}
          {techData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h4 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                Technical Recruiters ({techData.length})
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={techData}
                  margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="positionsCount" fill="#10B981" name="Positions" radius={[8, 8, 0, 0]}>
                    {techData.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getLoadColor(entry.positionsCount, summary?.avgTechnicalLoad)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Color Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600 font-semibold mb-3">Load Status Legend</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gray-300"></div>
            <span className="text-xs text-gray-600">No Load</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500"></div>
            <span className="text-xs text-gray-600">Balanced</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500"></div>
            <span className="text-xs text-gray-600">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span className="text-xs text-gray-600">Overload</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
