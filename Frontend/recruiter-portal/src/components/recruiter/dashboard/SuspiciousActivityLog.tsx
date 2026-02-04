import { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SuspiciousRecord {
    id: number;
    candidateName: string;
    position: string;
    group: string;
    issueType: string;
    confidenceScore: number;
    detectedAt: string;
    status: 'Pending' | 'Resolved' | 'Dismissed';
}

interface SuspiciousActivityLogProps {
    onBack?: () => void;
}

export function SuspiciousActivityLog({ onBack }: SuspiciousActivityLogProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortField, setSortField] = useState<keyof SuspiciousRecord>('detectedAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

    // Mock data - would normally come from API
    const [records, setRecords] = useState<SuspiciousRecord[]>([
        {
            id: 1,
            candidateName: "Michael Chen",
            position: "Senior React Developer",
            group: "Group A",
            issueType: "Tab Switching / Focus Loss",
            confidenceScore: 85,
            detectedAt: "2024-02-03T14:30:00",
            status: 'Pending'
        },
        {
            id: 2,
            candidateName: "Sarah Jones",
            position: "Product Manager",
            group: "PM Group 1",
            issueType: "Multiple Voices Detected",
            confidenceScore: 92,
            detectedAt: "2024-02-02T10:15:00",
            status: 'Pending'
        },
        {
            id: 3,
            candidateName: "David Kim",
            position: "Data Scientist",
            group: "DS Screen",
            issueType: "Unusual Typing Patterns",
            confidenceScore: 65,
            detectedAt: "2024-02-01T16:45:00",
            status: 'Resolved'
        },
        {
            id: 4,
            candidateName: "Emily Wong",
            position: "UX Designer",
            group: "Design 2024",
            issueType: "Background Object Detected",
            confidenceScore: 45,
            detectedAt: "2024-01-30T09:20:00",
            status: 'Dismissed'
        },
        {
            id: 5,
            candidateName: "James Wilson",
            position: "Backend Engineer",
            group: "BE Group 2",
            issueType: "Unidentified Person Detected",
            confidenceScore: 95,
            detectedAt: new Date().toISOString(), // Today
            status: 'Pending'
        }
    ]);

    const filteredRecords = records.filter(record => {
        // Search Filter
        const matchesSearch =
            record.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            record.issueType.toLowerCase().includes(searchQuery.toLowerCase()) ||
            record.position.toLowerCase().includes(searchQuery.toLowerCase());

        // Severity Filter
        let matchesSeverity = true;
        if (severityFilter === 'high') matchesSeverity = record.confidenceScore >= 90;
        else if (severityFilter === 'medium') matchesSeverity = record.confidenceScore >= 70 && record.confidenceScore < 90;
        else if (severityFilter === 'low') matchesSeverity = record.confidenceScore < 70;

        // Date Filter
        let matchesDate = true;
        if (dateFilter !== 'all') {
            const date = new Date(record.detectedAt);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (dateFilter === 'today') {
                matchesDate = date.toDateString() === now.toDateString();
            } else if (dateFilter === 'week') {
                matchesDate = diffDays <= 7;
            } else if (dateFilter === 'month') {
                matchesDate = diffDays <= 30;
            }
        }

        return matchesSearch && matchesSeverity && matchesDate;
    });

    const sortedRecords = [...filteredRecords].sort((a, b) => {
        if (a[sortField] < b[sortField]) return sortDirection === 'asc' ? -1 : 1;
        if (a[sortField] > b[sortField]) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (field: keyof SuspiciousRecord) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new field
        }
    };

    const getSeverityColor = (score: number) => {
        if (score >= 90) return 'text-red-600 bg-red-50 border-red-200';
        if (score >= 70) return 'text-orange-600 bg-orange-50 border-orange-200';
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    };

    return (
        <div className="min-h-screen flex flex-col">
            <div className="px-8 py-6 w-full">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-[#111827] text-[32px] mb-2 font-['Arimo',sans-serif]">Suspicious Activity Log</h1>
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        Review potential integrity violations across all assessments
                    </p>
                </div>

                <div className="max-w-[1400px] mx-auto">
                    {/* Search and Filters */}
                    <div className="mb-6 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                                <input
                                    type="text"
                                    placeholder="Search by candidate, issue type, or position..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-[44px] pl-12 pr-4 rounded-[10px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`flex items-center gap-2 h-[44px] px-[16px] rounded-[10px] border transition-colors ${showFilters
                                    ? 'bg-[#f5f3ff] border-[#6366f1] text-[#6366f1]'
                                    : 'bg-white border-[#e5e7eb] hover:bg-[#f9fafb]'
                                    }`}
                            >
                                <Filter size={18} />
                                <span className="font-['Arimo',sans-serif] text-[14px]">Filters</span>
                                <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {showFilters && (
                            <div className="p-4 bg-white rounded-[10px] border border-[#e5e7eb] grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div>
                                    <label className="block text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5">Severity Level</label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none transition-shadow"
                                            value={severityFilter}
                                            onChange={(e) => setSeverityFilter(e.target.value as any)}
                                        >
                                            <option value="all">All Severities</option>
                                            <option value="high">High (&gt;90%)</option>
                                            <option value="medium">Medium (70-90%)</option>
                                            <option value="low">Low (&lt;70%)</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5">Date Detected</label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none transition-shadow"
                                            value={dateFilter}
                                            onChange={(e) => setDateFilter(e.target.value as any)}
                                        >
                                            <option value="all">All Time</option>
                                            <option value="today">Today</option>
                                            <option value="week">Last 7 Days</option>
                                            <option value="month">Last 30 Days</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden shadow-sm">
                        <table className="w-full">
                            <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                <tr>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('candidateName')}
                                    >
                                        Candidate
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('issueType')}
                                    >
                                        Issue Detected
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('confidenceScore')}
                                    >
                                        Severity
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('position')}
                                    >
                                        Context
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('detectedAt')}
                                    >
                                        Detected At
                                    </th>
                                    <th className="text-right p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRecords.map((record) => (
                                    <tr
                                        key={record.id}
                                        onClick={() => navigate(`/recruiter/suspect-review?id=${record.id}`)}
                                        className="border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                                    >
                                        <td className="p-4">
                                            <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                                                {record.candidateName}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={16} className="text-amber-500" />
                                                <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                                                    {record.issueType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] font-medium border ${getSeverityColor(record.confidenceScore)}`}>
                                                {record.confidenceScore}% Confidence
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div>
                                                <div className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">{record.position}</div>
                                                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{record.group}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 text-[#6b7280]">
                                                <Clock size={14} />
                                                <span className="font-['Arimo',sans-serif] text-[13px]">
                                                    {new Date(record.detectedAt).toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                className="text-[#6366f1] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-auto font-['Arimo',sans-serif] text-[13px] font-medium"
                                            >
                                                Review <ChevronRight size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {sortedRecords.length === 0 && (
                            <div className="text-center py-12">
                                <CheckCircle size={48} className="text-[#d1d5db] mx-auto mb-4" />
                                <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
                                    No suspicious activity detected
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
