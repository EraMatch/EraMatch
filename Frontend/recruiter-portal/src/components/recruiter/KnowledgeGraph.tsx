import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, Search, ZoomIn, ZoomOut, Maximize2, Minimize2,
  RotateCcw, Grid3x3, CircleDot, GitBranch, Award, Briefcase,
  Building2, GraduationCap, Code, Video, FileText, AlertTriangle,
  CheckCircle2, XCircle, Shield, Filter, Eye
} from 'lucide-react';
import { api } from '../../services/api';

interface KnowledgeGraphProps {
  candidateId: number;
  candidateName: string;
  onBack: () => void;
}

type NodeType =
  | 'candidate'
  | 'skill'
  | 'experience'
  | 'role'
  | 'company'
  | 'assessment'
  | 'interview'
  | 'github'
  | 'integrity'
  | 'jd-requirement'
  | 'education'
  | 'project'
  | 'evidence';

type LayoutType = 'force' | 'hierarchical' | 'radial' | 'cluster';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: any;
  x: number;
  y: number;
  verified?: boolean;
  level?: string;
  score?: number;
  hasIntegrityFlag?: boolean;
  flagSeverity?: 'low' | 'medium' | 'high';
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'evidence' | 'related' | 'required' | 'verified' | 'flagged';
}

export function KnowledgeGraph({ candidateId, candidateName, onBack }: KnowledgeGraphProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [layout, setLayout] = useState<LayoutType>('radial');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showLegend, setShowLegend] = useState(true);
  const [filterNodeTypes, setFilterNodeTypes] = useState<Set<NodeType>>(new Set());
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], edges: GraphEdge[] }>({ nodes: [], edges: [] });

  // Simulate loading animation
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsLoading(false), 300);
          return 100;
        }
        return prev + 10;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Fetch graph data from API
  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        const data = await api.recruiter.getKnowledgeGraphData(candidateId);
        setGraphData(data);
      } catch (error) {
        console.error('Failed to fetch knowledge graph data:', error);
      }
    };
    fetchGraphData();
  }, [candidateId]);

  // Calculate node positions based on layout
  const calculateLayout = (layoutType: LayoutType): GraphNode[] => {
    const nodes = [...graphData.nodes];
    const centerX = 500;
    const centerY = 400;

    if (layoutType === 'radial') {
      // Organize by type in concentric circles
      const nodesByType: { [key: string]: GraphNode[] } = {};
      nodes.forEach(node => {
        if (!nodesByType[node.type]) nodesByType[node.type] = [];
        nodesByType[node.type].push(node);
      });

      // Candidate at center
      const candidateNode = nodes.find(n => n.type === 'candidate');
      if (candidateNode) {
        candidateNode.x = centerX;
        candidateNode.y = centerY;
      }

      // Define rings and node types per ring
      const rings = [
        { radius: 150, types: ['role', 'education'] },
        { radius: 280, types: ['company', 'project'] },
        { radius: 400, types: ['skill', 'assessment', 'interview', 'github'] },
        { radius: 520, types: ['evidence', 'integrity', 'jd-requirement'] }
      ];

      rings.forEach(ring => {
        let totalNodesInRing = 0;
        ring.types.forEach(type => {
          totalNodesInRing += nodesByType[type]?.length || 0;
        });

        let nodeIndex = 0;
        ring.types.forEach(type => {
          const typeNodes = nodesByType[type] || [];
          typeNodes.forEach(node => {
            const angle = (nodeIndex / totalNodesInRing) * Math.PI * 2 - Math.PI / 2;
            node.x = centerX + Math.cos(angle) * ring.radius;
            node.y = centerY + Math.sin(angle) * ring.radius;
            nodeIndex++;
          });
        });
      });
    } else if (layoutType === 'hierarchical') {
      // Top-down hierarchy
      const levels = [
        { y: 100, types: ['candidate'] },
        { y: 220, types: ['role', 'education'] },
        { y: 340, types: ['company', 'project'] },
        { y: 460, types: ['skill', 'assessment', 'interview', 'github'] },
        { y: 580, types: ['evidence', 'integrity', 'jd-requirement'] }
      ];

      levels.forEach(level => {
        const levelNodes = nodes.filter(n => level.types.includes(n.type));
        const spacing = 800 / (levelNodes.length + 1);
        levelNodes.forEach((node, i) => {
          node.x = 100 + spacing * (i + 1);
          node.y = level.y;
        });
      });
    } else if (layoutType === 'cluster') {
      // Group by type in clusters
      const clusters = [
        { x: 300, y: 200, types: ['role', 'company'] },
        { x: 700, y: 200, types: ['education'] },
        { x: 150, y: 400, types: ['skill'] },
        { x: 500, y: 400, types: ['assessment', 'interview'] },
        { x: 850, y: 400, types: ['github', 'evidence'] },
        { x: 500, y: 600, types: ['integrity', 'jd-requirement'] }
      ];

      // Candidate at center
      const candidateNode = nodes.find(n => n.type === 'candidate');
      if (candidateNode) {
        candidateNode.x = 500;
        candidateNode.y = 350;
      }

      clusters.forEach(cluster => {
        const clusterNodes = nodes.filter(n => cluster.types.includes(n.type));
        const radius = 60;
        clusterNodes.forEach((node, i) => {
          const angle = (i / clusterNodes.length) * Math.PI * 2;
          node.x = cluster.x + Math.cos(angle) * radius;
          node.y = cluster.y + Math.sin(angle) * radius;
        });
      });
    } else {
      // Force-directed (simplified - static positions for demo)
      // In production, would use D3 force simulation
      nodes.forEach((node, i) => {
        if (node.type === 'candidate') {
          node.x = centerX;
          node.y = centerY;
        } else {
          const angle = (i / nodes.length) * Math.PI * 2;
          const radius = 200 + Math.random() * 150;
          node.x = centerX + Math.cos(angle) * radius;
          node.y = centerY + Math.sin(angle) * radius;
        }
      });
    }

    return nodes;
  };

  const [positionedNodes, setPositionedNodes] = useState<GraphNode[]>([]);

  useEffect(() => {
    setPositionedNodes(calculateLayout(layout));
  }, [layout]);

  // Get node color based on type
  const getNodeColor = (type: NodeType, verified?: boolean, hasFlag?: boolean) => {
    if (hasFlag) return { bg: '#fef2f2', border: '#ef4444', text: '#ef4444' };

    const colors = {
      candidate: { bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: '#6366f1', text: '#ffffff' },
      skill: verified
        ? { bg: '#dcfce7', border: '#10b981', text: '#10b981' }
        : { bg: '#fef3c7', border: '#f59e0b', text: '#f59e0b' },
      project: { bg: '#dbeafe', border: '#3b82f6', text: '#3b82f6' },
      role: { bg: '#e0e7ff', border: '#6366f1', text: '#6366f1' },
      company: { bg: '#f3e8ff', border: '#8b5cf6', text: '#8b5cf6' },
      education: { bg: '#fce7f3', border: '#ec4899', text: '#ec4899' },
      assessment: { bg: '#e0f2fe', border: '#0ea5e9', text: '#0ea5e9' },
      interview: { bg: '#ede9fe', border: '#a855f7', text: '#a855f7' },
      github: { bg: '#f1f5f9', border: '#64748b', text: '#64748b' },
      integrity: { bg: '#fee2e2', border: '#ef4444', text: '#ef4444' },
      'jd-requirement': { bg: '#fef9c3', border: '#eab308', text: '#eab308' },
      evidence: { bg: '#ddd6fe', border: '#7c3aed', text: '#7c3aed' }
    };

    return colors[type];
  };

  // Get node icon
  const getNodeIcon = (type: NodeType) => {
    const icons = {
      candidate: CircleDot,
      skill: Award,
      project: Code,
      role: Briefcase,
      company: Building2,
      education: GraduationCap,
      assessment: FileText,
      interview: Video,
      github: GitBranch,
      integrity: AlertTriangle,
      'jd-requirement': Filter,
      evidence: Shield
    };
    return icons[type];
  };

  // Get edges connected to a node
  const getConnectedEdges = (nodeId: string) => {
    return graphData.edges.filter(e => e.source === nodeId || e.target === nodeId);
  };

  // Handle node click
  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);

    // Navigate to module detail or suspect review for certain node types
    if (node.type === 'assessment' || node.type === 'interview') {
      console.log('Open module detail for:', node);
    } else if (node.type === 'integrity') {
      console.log('Open suspect review for:', node);
    }
  };

  // Auto-fit
  const handleAutoFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Search filter
  const filteredNodes = positionedNodes.filter(node => {
    const matchesSearch = !searchQuery ||
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(node.data).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterNodeTypes.size === 0 || filterNodeTypes.has(node.type);

    return matchesSearch && matchesFilter;
  });

  const filteredEdges = graphData.edges.filter(edge => {
    const sourceVisible = filteredNodes.some(n => n.id === edge.source);
    const targetVisible = filteredNodes.some(n => n.id === edge.target);
    return sourceVisible && targetVisible;
  });

  // Get highlighted edges when hovering
  const highlightedEdges = hoveredNode
    ? getConnectedEdges(hoveredNode.id).map(e => e.id)
    : [];

  // Pan and zoom handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.target.closest('.node')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newZoom = Math.min(Math.max(0.3, zoom + delta), 3);
    setZoom(newZoom);
  };

  // Toggle node type filter
  const toggleNodeTypeFilter = (type: NodeType) => {
    const newFilter = new Set(filterNodeTypes);
    if (newFilter.has(type)) {
      newFilter.delete(type);
    } else {
      newFilter.add(type);
    }
    setFilterNodeTypes(newFilter);
  };

  const allNodeTypes: NodeType[] = ['skill', 'project', 'role', 'company', 'education', 'assessment', 'interview', 'github', 'integrity', 'jd-requirement', 'evidence'];

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-[#f9fafb]">
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center">
          <div className="mb-6">
            <div className="w-[80px] h-[80px] rounded-full border-4 border-[#e5e7eb] border-t-[#6366f1] animate-spin" />
          </div>
          <div className="text-[#111827] text-[18px] mb-2">
            Building Knowledge Graph
          </div>
          <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-4">
            Tracing data provenance & validating evidence...
          </div>
          <div className="w-[300px] h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6366f1] transition-all duration-200"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="mt-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
            {loadingProgress}% complete
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#6b7280] hover:text-[#111827] transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Back to Profile</span>
          </button>

          <div className="flex items-center gap-3 flex-1 justify-center">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes, skills, evidence..."
                className="w-[350px] h-[36px] pl-[36px] pr-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <Search size={16} className="absolute left-[12px] top-1/2 -translate-y-1/2 text-[#6b7280]" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Layout Switcher */}
            <div className="flex items-center gap-1 bg-[#f9fafb] rounded-[8px] p-1">
              <button
                onClick={() => setLayout('radial')}
                className={`px-3 py-1.5 rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${layout === 'radial' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-[#6b7280] hover:text-[#111827]'
                  }`}
              >
                Radial
              </button>
              <button
                onClick={() => setLayout('hierarchical')}
                className={`px-3 py-1.5 rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${layout === 'hierarchical' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-[#6b7280] hover:text-[#111827]'
                  }`}
              >
                Hierarchy
              </button>
              <button
                onClick={() => setLayout('cluster')}
                className={`px-3 py-1.5 rounded-[6px] font-['Arimo',sans-serif] text-[13px] transition-colors ${layout === 'cluster' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-[#6b7280] hover:text-[#111827]'
                  }`}
              >
                Cluster
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setZoom(Math.min(3, zoom + 0.2))}
                className="w-[36px] h-[36px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
              >
                <ZoomIn size={16} className="text-[#6b7280]" />
              </button>
              <button
                onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}
                className="w-[36px] h-[36px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
              >
                <ZoomOut size={16} className="text-[#6b7280]" />
              </button>
              <button
                onClick={handleAutoFit}
                className="w-[36px] h-[36px] flex items-center justify-center rounded-[6px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
              >
                <RotateCcw size={16} className="text-[#6b7280]" />
              </button>
            </div>

            {/* Toggle Legend */}
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="h-[36px] px-4 flex items-center gap-2 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
            >
              <Eye size={16} className="text-[#6b7280]" />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                {showLegend ? 'Hide' : 'Show'} Legend
              </span>
            </button>
          </div>
        </div>

        {/* Node Type Filters */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Filter by type:</span>
          {allNodeTypes.map(type => {
            const Icon = getNodeIcon(type);
            const colors = getNodeColor(type);
            const isActive = filterNodeTypes.size === 0 || filterNodeTypes.has(type);

            return (
              <button
                key={type}
                onClick={() => toggleNodeTypeFilter(type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border transition-all ${isActive
                  ? 'border-current shadow-sm'
                  : 'border-[#e5e7eb] opacity-40 hover:opacity-60'
                  }`}
                style={{
                  borderColor: isActive ? colors.border : undefined,
                  backgroundColor: isActive ? colors.bg : '#f9fafb'
                }}
              >
                <Icon size={14} style={{ color: colors.text }} />
                <span className="font-['Arimo',sans-serif] text-[12px]" style={{ color: colors.text }}>
                  {type.replace('-', ' ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 relative bg-white overflow-hidden">
        <div
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div
            className="relative w-full h-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.2s ease-out'
            }}
          >
            {/* SVG for edges */}
            <svg className="absolute inset-0 w-[1000px] h-[800px] pointer-events-none" style={{ overflow: 'visible' }}>
              {filteredEdges.map(edge => {
                const sourceNode = filteredNodes.find(n => n.id === edge.source);
                const targetNode = filteredNodes.find(n => n.id === edge.target);

                if (!sourceNode || !targetNode) return null;

                const isHighlighted = highlightedEdges.includes(edge.id);
                const isFlagged = edge.type === 'flagged';
                const isVerified = edge.type === 'verified';
                const isRequired = edge.type === 'required';

                let strokeColor = '#e5e7eb';
                let strokeWidth = 2;
                let strokeDasharray = 'none';

                if (isFlagged) {
                  strokeColor = '#ef4444';
                  strokeWidth = 2;
                  strokeDasharray = '5,5';
                } else if (isVerified) {
                  strokeColor = '#10b981';
                  strokeWidth = 2;
                } else if (isRequired) {
                  strokeColor = '#eab308';
                  strokeWidth = 2;
                  strokeDasharray = '8,4';
                } else if (isHighlighted) {
                  strokeColor = '#6366f1';
                  strokeWidth = 3;
                }

                return (
                  <g key={edge.id}>
                    <line
                      x1={sourceNode.x}
                      y1={sourceNode.y}
                      x2={targetNode.x}
                      y2={targetNode.y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      opacity={isHighlighted ? 1 : 0.3}
                    />
                    {edge.label && isHighlighted && (
                      <text
                        x={(sourceNode.x + targetNode.x) / 2}
                        y={(sourceNode.y + targetNode.y) / 2}
                        fill="#6b7280"
                        fontSize="11"
                        fontFamily="Arimo, sans-serif"
                        textAnchor="middle"
                        dy="-5"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {filteredNodes.map(node => {
              const colors = getNodeColor(node.type, node.verified, node.hasIntegrityFlag);
              const Icon = getNodeIcon(node.type);
              const isCandidate = node.type === 'candidate';
              const size = isCandidate ? 100 : node.type === 'skill' ? 80 : 70;
              const isSelected = selectedNode?.id === node.id;
              const isHovered = hoveredNode?.id === node.id;

              return (
                <div
                  key={node.id}
                  className={`node absolute rounded-[12px] flex flex-col items-center justify-center cursor-pointer transition-all ${isSelected || isHovered ? 'shadow-2xl scale-110 z-30' : 'shadow-lg hover:shadow-xl z-10'
                    }`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: size,
                    height: size,
                    transform: 'translate(-50%, -50%)',
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                  }}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <Icon size={isCandidate ? 24 : 18} style={{ color: colors.text }} className="mb-1" />
                  <div
                    className="font-['Arimo',sans-serif] text-[10px] text-center px-1 leading-tight"
                    style={{ color: colors.text }}
                  >
                    {node.label.length > 15 ? node.label.substring(0, 13) + '...' : node.label}
                  </div>

                  {/* Verification badge */}
                  {node.verified && (
                    <CheckCircle2
                      size={14}
                      className="absolute -top-1 -right-1 text-[#10b981] bg-white rounded-full"
                    />
                  )}

                  {/* Integrity flag */}
                  {node.hasIntegrityFlag && (
                    <AlertTriangle
                      size={14}
                      className="absolute -top-1 -right-1 text-[#ef4444] bg-white rounded-full"
                    />
                  )}

                  {/* Score badge */}
                  {node.score !== undefined && (
                    <div
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] bg-white shadow-md"
                      style={{ color: colors.text, borderColor: colors.border, borderWidth: 1 }}
                    >
                      {node.score}
                    </div>
                  )}

                  {/* Level badge */}
                  {node.level && !node.score && (
                    <div
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] bg-white shadow-md"
                      style={{ color: colors.text, borderColor: colors.border, borderWidth: 1 }}
                    >
                      {node.level}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats overlay */}
        <div className="absolute top-4 left-4 bg-white rounded-[12px] border border-[#e5e7eb] p-4 shadow-lg">
          <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-2">Graph Statistics</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Nodes:</span>
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">{filteredNodes.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Edges:</span>
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">{filteredEdges.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Verified:</span>
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#10b981]">
                {filteredNodes.filter(n => n.verified).length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Flags:</span>
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#ef4444]">
                {filteredNodes.filter(n => n.hasIntegrityFlag).length}
              </span>
            </div>
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-6 left-6 bg-white rounded-[12px] border border-[#e5e7eb] p-4 shadow-lg max-w-[280px]">
            <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-3">Legend</div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {allNodeTypes.map(type => {
                const Icon = getNodeIcon(type);
                const colors = getNodeColor(type);
                return (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="w-[24px] h-[24px] rounded-[6px] flex items-center justify-center flex-shrink-0"
                      style={{ background: colors.bg, border: `2px solid ${colors.border}` }}
                    >
                      <Icon size={12} style={{ color: colors.text }} />
                    </div>
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] capitalize">
                      {type.replace('-', ' ')}
                    </span>
                  </div>
                );
              })}

              <div className="border-t border-[#e5e7eb] my-2 pt-2">
                <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">Indicators</div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-[#10b981]" />
                  <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">Verified</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-[#ef4444]" />
                  <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">Integrity Flag</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Node Details */}
      {selectedNode && (
        <div className="absolute top-0 right-0 bottom-0 w-[400px] bg-white border-l border-[#e5e7eb] overflow-auto flex-shrink-0 shadow-2xl z-40">
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = getNodeIcon(selectedNode.type);
                  const colors = getNodeColor(selectedNode.type, selectedNode.verified, selectedNode.hasIntegrityFlag);
                  return (
                    <div
                      className="w-[48px] h-[48px] rounded-[10px] flex items-center justify-center"
                      style={{ background: colors.bg, border: `2px solid ${colors.border}` }}
                    >
                      <Icon size={24} style={{ color: colors.text }} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-[#111827] mb-1">{selectedNode.label}</h3>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] capitalize">
                    {selectedNode.type.replace('-', ' ')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-[#6b7280] hover:text-[#111827] transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Verification Status */}
            {selectedNode.verified !== undefined && (
              <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-[8px] ${selectedNode.verified
                ? 'bg-[#dcfce7] border border-[#10b981]'
                : 'bg-[#fef3c7] border border-[#f59e0b]'
                }`}>
                {selectedNode.verified ? (
                  <>
                    <CheckCircle2 size={16} className="text-[#10b981]" />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#10b981]">Verified</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} className="text-[#f59e0b]" />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#f59e0b]">Unverified</span>
                  </>
                )}
              </div>
            )}

            {/* Integrity Flag */}
            {selectedNode.hasIntegrityFlag && (
              <div className="mb-4 px-3 py-2 bg-[#fef2f2] border border-[#ef4444] rounded-[8px]">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className="text-[#ef4444]" />
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#ef4444]">
                    Integrity Flag ({selectedNode.flagSeverity})
                  </span>
                </div>
                <button className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1] hover:underline">
                  View in Suspect Review →
                </button>
              </div>
            )}

            {/* Score */}
            {selectedNode.score !== undefined && (
              <div className="mb-4">
                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">Score</div>
                <div className="flex items-center gap-3">
                  <div className="text-[28px] text-[#111827]">{selectedNode.score}</div>
                  <div className="flex-1 h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6366f1] rounded-full transition-all"
                      style={{ width: `${selectedNode.score}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Level */}
            {selectedNode.level && (
              <div className="mb-4">
                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Proficiency Level</div>
                <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  {selectedNode.level}
                </div>
              </div>
            )}

            {/* Additional Data */}
            <div className="space-y-3 mb-6">
              {Object.entries(selectedNode.data).map(([key, value]) => (
                <div key={key}>
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>

            {/* Connected Nodes */}
            <div>
              <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-3">
                Connected Nodes ({getConnectedEdges(selectedNode.id).length})
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {getConnectedEdges(selectedNode.id).map(edge => {
                  const isSource = edge.source === selectedNode.id;
                  const connectedId = isSource ? edge.target : edge.source;
                  const connectedNode = graphData.nodes.find(n => n.id === connectedId);

                  if (!connectedNode) return null;

                  const Icon = getNodeIcon(connectedNode.type);
                  const colors = getNodeColor(connectedNode.type, connectedNode.verified, connectedNode.hasIntegrityFlag);

                  return (
                    <button
                      key={edge.id}
                      onClick={() => setSelectedNode(connectedNode)}
                      className="w-full flex items-center gap-3 p-2 rounded-[8px] border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors text-left"
                    >
                      <div
                        className="w-[32px] h-[32px] rounded-[6px] flex items-center justify-center flex-shrink-0"
                        style={{ background: colors.bg, border: `2px solid ${colors.border}` }}
                      >
                        <Icon size={16} style={{ color: colors.text }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] truncate">
                          {connectedNode.label}
                        </div>
                        <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] capitalize">
                          {edge.label || edge.type} • {connectedNode.type.replace('-', ' ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            {(selectedNode.type === 'assessment' || selectedNode.type === 'interview') && (
              <div className="mt-6 pt-6 border-t border-[#e5e7eb]">
                <button className="w-full h-[40px] px-4 rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white font-['Arimo',sans-serif] text-[14px] transition-colors">
                  Open Module Detail
                </button>
              </div>
            )}

            {selectedNode.type === 'integrity' && (
              <div className="mt-6 pt-6 border-t border-[#e5e7eb]">
                <button className="w-full h-[40px] px-4 rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] text-white font-['Arimo',sans-serif] text-[14px] transition-colors">
                  Open Suspect Review
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
