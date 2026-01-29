import { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Search, Filter, X, Check, Plus, Brain, Users, Target, Zap, TrendingUp, Code, MessageCircle, ChevronDown, Settings, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../services/api';

interface Skill {
  id: string;
  name: string;
  category: 'technical' | 'interpersonal';
  proficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number;
  source: 'resume' | 'assessment' | 'interview' | 'manual';
}

interface Candidate {
  id: number;
  name: string;
  email: string;
  position: string;
  skills: Skill[];
  overallScore?: number;
}

interface SkillFilter {
  skillName: string;
  category?: 'technical' | 'interpersonal';
  minProficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  minYearsExperience?: number;
  required: boolean;
}

interface Cluster {
  id: string;
  name: string;
  description: string;
  filters: SkillFilter[];
  candidateIds: number[];
  color: string;
}

interface SkillClusteringWorkflowProps {
  candidates: Candidate[];
  groupName: string;
  onComplete: (clusters: Cluster[]) => void;
  onBack: () => void;
}

export function SkillClusteringWorkflow({
  candidates,
  groupName,
  onComplete,
  onBack
}: SkillClusteringWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<'detection' | 'filtering' | 'preview'>('detection');
  const [detectedSkills, setDetectedSkills] = useState<Map<number, Skill[]>>(new Map());
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [selectedSkillCategory, setSelectedSkillCategory] = useState<'all' | 'technical' | 'interpersonal'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);

  const handleDetectSkills = async () => {
    setIsDetecting(true);

    try {
      const candidateIds = candidates.map(c => c.id);
      const skillsData = await api.recruiter.getCandidateSkills(candidateIds);

      const skillsMap = new Map<number, Skill[]>();
      const uniqueSkills: Skill[] = [];
      const skillNames = new Set<string>();

      Object.entries(skillsData).forEach(([candidateId, skills]) => {
        const id = parseInt(candidateId);
        skillsMap.set(id, skills as Skill[]);

        (skills as Skill[]).forEach(skill => {
          if (!skillNames.has(skill.name)) {
            skillNames.add(skill.name);
            uniqueSkills.push(skill);
          }
        });
      });

      setDetectedSkills(skillsMap);
      setAllSkills(uniqueSkills);
    } catch (error) {
      console.error('Failed to detect skills:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleContinueToFiltering = () => {
    setCurrentStep('filtering');
    // Create a default cluster
    if (clusters.length === 0) {
      const defaultCluster: Cluster = {
        id: 'cluster-1',
        name: 'Senior React Developers',
        description: 'Candidates with strong React and TypeScript skills',
        filters: [],
        candidateIds: [],
        color: '#8b5cf6'
      };
      setClusters([defaultCluster]);
      setActiveCluster(defaultCluster.id);
    }
  };

  const handleAddCluster = () => {
    const newCluster: Cluster = {
      id: `cluster-${clusters.length + 1}`,
      name: `Cluster ${clusters.length + 1}`,
      description: '',
      filters: [],
      candidateIds: [],
      color: ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'][clusters.length % 5]
    };
    setClusters([...clusters, newCluster]);
    setActiveCluster(newCluster.id);
  };

  const handleAddFilter = (clusterId: string) => {
    setClusters(clusters.map(cluster => {
      if (cluster.id === clusterId) {
        return {
          ...cluster,
          filters: [...cluster.filters, {
            skillName: '',
            required: false
          }]
        };
      }
      return cluster;
    }));
  };

  const handleUpdateFilter = (clusterId: string, filterIndex: number, updates: Partial<SkillFilter>) => {
    setClusters(clusters.map(cluster => {
      if (cluster.id === clusterId) {
        const newFilters = [...cluster.filters];
        newFilters[filterIndex] = { ...newFilters[filterIndex], ...updates };
        return { ...cluster, filters: newFilters };
      }
      return cluster;
    }));
  };

  const handleRemoveFilter = (clusterId: string, filterIndex: number) => {
    setClusters(clusters.map(cluster => {
      if (cluster.id === clusterId) {
        return {
          ...cluster,
          filters: cluster.filters.filter((_, idx) => idx !== filterIndex)
        };
      }
      return cluster;
    }));
  };

  const handleApplyFilters = () => {
    // Apply filters to match candidates
    const updatedClusters = clusters.map(cluster => {
      const matchedCandidates = candidates.filter(candidate => {
        const candidateSkills = detectedSkills.get(candidate.id) || [];

        // Check if candidate matches all required filters
        return cluster.filters.every(filter => {
          if (!filter.skillName) return true;

          const hasSkill = candidateSkills.some(skill => {
            if (skill.name !== filter.skillName) return false;
            if (filter.category && skill.category !== filter.category) return false;
            if (filter.minYearsExperience && (skill.yearsOfExperience || 0) < filter.minYearsExperience) return false;

            // Check proficiency
            if (filter.minProficiency) {
              const proficiencyLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
              const skillLevel = proficiencyLevels.indexOf(skill.proficiency || 'beginner');
              const minLevel = proficiencyLevels.indexOf(filter.minProficiency);
              if (skillLevel < minLevel) return false;
            }

            return true;
          });

          return filter.required ? hasSkill : true;
        });
      });

      return {
        ...cluster,
        candidateIds: matchedCandidates.map(c => c.id)
      };
    });

    setClusters(updatedClusters);
    setCurrentStep('preview');
  };

  const handleAIAssist = () => {
    // Simulate AI assistance
    if (activeCluster && aiPrompt) {
      const cluster = clusters.find(c => c.id === activeCluster);
      if (cluster) {
        // Mock AI-generated filters
        const aiFilters: SkillFilter[] = [
          { skillName: 'React', category: 'technical', minProficiency: 'advanced', minYearsExperience: 3, required: true },
          { skillName: 'TypeScript', category: 'technical', minProficiency: 'intermediate', required: true },
          { skillName: 'Leadership', category: 'interpersonal', minProficiency: 'advanced', required: false },
        ];

        setClusters(clusters.map(c => {
          if (c.id === activeCluster) {
            return { ...c, filters: [...c.filters, ...aiFilters] };
          }
          return c;
        }));

        setShowAIAssistant(false);
        setAiPrompt('');
      }
    }
  };

  const filteredSkills = allSkills.filter(skill => {
    if (selectedSkillCategory !== 'all' && skill.category !== selectedSkillCategory) return false;
    if (searchQuery && !skill.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const proficiencyColors = {
    beginner: 'bg-[#94a3b8] text-white',
    intermediate: 'bg-[#3b82f6] text-white',
    advanced: 'bg-[#8b5cf6] text-white',
    expert: 'bg-[#10b981] text-white'
  };

  const steps = [
    { id: 'detection', label: 'Skill Detection', icon: Brain },
    { id: 'filtering', label: 'Manual Filtering', icon: Filter },
    { id: 'preview', label: 'Preview Clusters', icon: Users }
  ];

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="w-[36px] h-[36px] rounded-[8px] bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>
              <div>
                <h2 className="text-white text-[20px] mb-1">Skill-Based Clustering</h2>
                <p className="text-white/80 text-[14px]">{groupName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isActive = step.id === currentStep;
                const isCompleted = steps.findIndex(s => s.id === currentStep) > idx;

                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-[8px] ${isActive ? 'bg-white/20' : isCompleted ? 'bg-white/10' : 'bg-white/5'
                      }`}>
                      <Icon size={16} className="text-white" />
                      <span className="text-white text-[14px]">{step.label}</span>
                      {isCompleted && <Check size={14} className="text-white" />}
                    </div>
                    {idx < steps.length - 1 && (
                      <ChevronRight size={16} className="text-white/60" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Step 1: Skill Detection */}
          {currentStep === 'detection' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="bg-white rounded-[16px] p-8 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#1e293b] mb-2">
                      Automated Skill Detection
                    </h3>
                    <p className="text-[14px] text-[#64748b]">
                      We'll analyze resumes, assessments, and interview data to detect and categorize skills for {candidates.length} candidates
                    </p>
                  </div>
                  <button
                    onClick={handleDetectSkills}
                    disabled={isDetecting || detectedSkills.size > 0}
                    className="px-6 py-3 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isDetecting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Detecting Skills...
                      </>
                    ) : detectedSkills.size > 0 ? (
                      <>
                        <Check size={16} />
                        Skills Detected
                      </>
                    ) : (
                      <>
                        <Brain size={16} />
                        Start Detection
                      </>
                    )}
                  </button>
                </div>

                {detectedSkills.size > 0 && (
                  <>
                    {/* Skill Overview */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-gradient-to-br from-[#8b5cf6] to-[#6366f1] rounded-[12px] p-6 text-white">
                        <div className="flex items-center gap-3 mb-2">
                          <Code size={20} />
                          <span className="text-[14px] opacity-90">Technical Skills</span>
                        </div>
                        <p className="text-[32px] font-semibold">
                          {allSkills.filter(s => s.category === 'technical').length}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-[#10b981] to-[#059669] rounded-[12px] p-6 text-white">
                        <div className="flex items-center gap-3 mb-2">
                          <MessageCircle size={20} />
                          <span className="text-[14px] opacity-90">Interpersonal Skills</span>
                        </div>
                        <p className="text-[32px] font-semibold">
                          {allSkills.filter(s => s.category === 'interpersonal').length}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-[#f59e0b] to-[#d97706] rounded-[12px] p-6 text-white">
                        <div className="flex items-center gap-3 mb-2">
                          <Users size={20} />
                          <span className="text-[14px] opacity-90">Candidates Analyzed</span>
                        </div>
                        <p className="text-[32px] font-semibold">{detectedSkills.size}</p>
                      </div>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                        <input
                          type="text"
                          placeholder="Search skills..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-[#e2e8f0] rounded-[8px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                        />
                      </div>
                      <div className="flex gap-2">
                        {['all', 'technical', 'interpersonal'].map(category => (
                          <button
                            key={category}
                            onClick={() => setSelectedSkillCategory(category as any)}
                            className={`px-4 py-2 rounded-[8px] text-[14px] font-medium transition-colors ${selectedSkillCategory === category
                              ? 'bg-[#8b5cf6] text-white'
                              : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                              }`}
                          >
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Skills List */}
                    <div className="space-y-3">
                      {filteredSkills.map(skill => {
                        const candidatesWithSkill = Array.from(detectedSkills.entries()).filter(([_, skills]) =>
                          skills.some(s => s.name === skill.name)
                        );

                        return (
                          <div
                            key={skill.id}
                            className="border border-[#e2e8f0] rounded-[8px] p-4 hover:border-[#8b5cf6] transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-[32px] h-[32px] rounded-[8px] flex items-center justify-center ${skill.category === 'technical'
                                  ? 'bg-[#ddd6fe] text-[#8b5cf6]'
                                  : 'bg-[#d1fae5] text-[#10b981]'
                                  }`}>
                                  {skill.category === 'technical' ? <Code size={16} /> : <MessageCircle size={16} />}
                                </div>
                                <div>
                                  <h4 className="text-[14px] font-semibold text-[#1e293b]">{skill.name}</h4>
                                  <p className="text-[12px] text-[#64748b] capitalize">{skill.category}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {skill.proficiency && (
                                  <span className={`px-3 py-1 rounded-full text-[12px] font-medium ${proficiencyColors[skill.proficiency]}`}>
                                    {skill.proficiency}
                                  </span>
                                )}
                                <div className="text-right">
                                  <p className="text-[14px] font-semibold text-[#1e293b]">
                                    {candidatesWithSkill.length} / {candidates.length}
                                  </p>
                                  <p className="text-[12px] text-[#64748b]">candidates</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              {detectedSkills.size > 0 && (
                <div className="flex justify-end gap-3">
                  <button
                    onClick={onBack}
                    className="px-6 py-3 rounded-[8px] border border-[#e2e8f0] text-[14px] font-medium text-[#64748b] hover:bg-[#f9fafb] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContinueToFiltering}
                    className="px-6 py-3 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    Continue to Filtering
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 2: Manual Filtering */}
          {currentStep === 'filtering' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-12 gap-6"
            >
              {/* Clusters Sidebar */}
              <div className="col-span-3">
                <div className="bg-white rounded-[16px] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[16px] font-semibold text-[#1e293b]">Clusters</h3>
                    <button
                      onClick={handleAddCluster}
                      className="w-[32px] h-[32px] rounded-[8px] bg-[#8b5cf6] text-white flex items-center justify-center hover:bg-[#7c3aed] transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {clusters.map(cluster => (
                      <button
                        key={cluster.id}
                        onClick={() => setActiveCluster(cluster.id)}
                        className={`w-full text-left p-3 rounded-[8px] transition-colors ${activeCluster === cluster.id
                          ? 'bg-[#f3f4f6] border border-[#8b5cf6]'
                          : 'hover:bg-[#f9fafb] border border-transparent'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-[12px] h-[12px] rounded-full"
                            style={{ backgroundColor: cluster.color }}
                          />
                          <span className="text-[14px] font-medium text-[#1e293b]">{cluster.name}</span>
                        </div>
                        <p className="text-[12px] text-[#64748b]">
                          {cluster.filters.length} filters
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cluster Configuration */}
              <div className="col-span-9">
                {activeCluster && (
                  <div className="bg-white rounded-[16px] p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={clusters.find(c => c.id === activeCluster)?.name || ''}
                          onChange={(e) => {
                            setClusters(clusters.map(c =>
                              c.id === activeCluster ? { ...c, name: e.target.value } : c
                            ));
                          }}
                          className="text-[20px] font-semibold text-[#1e293b] mb-2 w-full border-none focus:outline-none"
                          placeholder="Cluster Name"
                        />
                        <input
                          type="text"
                          value={clusters.find(c => c.id === activeCluster)?.description || ''}
                          onChange={(e) => {
                            setClusters(clusters.map(c =>
                              c.id === activeCluster ? { ...c, description: e.target.value } : c
                            ));
                          }}
                          className="text-[14px] text-[#64748b] w-full border-none focus:outline-none"
                          placeholder="Add a description..."
                        />
                      </div>
                      <button
                        onClick={() => setShowAIAssistant(true)}
                        className="px-4 py-2 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <Sparkles size={16} />
                        AI Assist
                      </button>
                    </div>

                    {/* Filters */}
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[16px] font-semibold text-[#1e293b]">Skill Filters</h4>
                        <button
                          onClick={() => handleAddFilter(activeCluster)}
                          className="px-3 py-2 rounded-[8px] border border-[#e2e8f0] text-[14px] text-[#64748b] hover:bg-[#f9fafb] transition-colors flex items-center gap-2"
                        >
                          <Plus size={14} />
                          Add Filter
                        </button>
                      </div>

                      {clusters.find(c => c.id === activeCluster)?.filters.map((filter, idx) => (
                        <div
                          key={idx}
                          className="border border-[#e2e8f0] rounded-[8px] p-4"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-1 grid grid-cols-2 gap-4">
                              {/* Skill Name */}
                              <div>
                                <label className="block text-[12px] text-[#64748b] mb-2">Skill Name</label>
                                <select
                                  value={filter.skillName}
                                  onChange={(e) => handleUpdateFilter(activeCluster, idx, { skillName: e.target.value })}
                                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                                >
                                  <option value="">Select skill...</option>
                                  {allSkills.map(skill => (
                                    <option key={skill.id} value={skill.name}>{skill.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Category */}
                              <div>
                                <label className="block text-[12px] text-[#64748b] mb-2">Category</label>
                                <select
                                  value={filter.category || ''}
                                  onChange={(e) => handleUpdateFilter(activeCluster, idx, { category: e.target.value as any })}
                                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                                >
                                  <option value="">Any</option>
                                  <option value="technical">Technical</option>
                                  <option value="interpersonal">Interpersonal</option>
                                </select>
                              </div>

                              {/* Min Proficiency */}
                              <div>
                                <label className="block text-[12px] text-[#64748b] mb-2">Min Proficiency</label>
                                <select
                                  value={filter.minProficiency || ''}
                                  onChange={(e) => handleUpdateFilter(activeCluster, idx, { minProficiency: e.target.value as any })}
                                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                                >
                                  <option value="">Any</option>
                                  <option value="beginner">Beginner</option>
                                  <option value="intermediate">Intermediate</option>
                                  <option value="advanced">Advanced</option>
                                  <option value="expert">Expert</option>
                                </select>
                              </div>

                              {/* Min Years Experience */}
                              <div>
                                <label className="block text-[12px] text-[#64748b] mb-2">Min Years Experience</label>
                                <input
                                  type="number"
                                  value={filter.minYearsExperience || ''}
                                  onChange={(e) => handleUpdateFilter(activeCluster, idx, { minYearsExperience: parseInt(e.target.value) || undefined })}
                                  className="w-full px-3 py-2 border border-[#e2e8f0] rounded-[8px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
                                  placeholder="0"
                                  min="0"
                                />
                              </div>
                            </div>

                            {/* Required Toggle & Delete */}
                            <div className="flex flex-col items-end gap-2">
                              <button
                                onClick={() => handleRemoveFilter(activeCluster, idx)}
                                className="w-[32px] h-[32px] rounded-[8px] hover:bg-[#fef2f2] text-[#ef4444] flex items-center justify-center transition-colors"
                              >
                                <X size={16} />
                              </button>
                              <button
                                onClick={() => handleUpdateFilter(activeCluster, idx, { required: !filter.required })}
                                className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${filter.required
                                  ? 'bg-[#10b981] text-white'
                                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                                  }`}
                              >
                                {filter.required ? 'Required' : 'Optional'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {clusters.find(c => c.id === activeCluster)?.filters.length === 0 && (
                        <div className="text-center py-8 text-[#94a3b8] text-[14px]">
                          No filters added yet. Click "Add Filter" to start clustering candidates.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Preview Clusters */}
          {currentStep === 'preview' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="bg-white rounded-[16px] p-8 mb-6">
                <h3 className="text-[18px] font-semibold text-[#1e293b] mb-6">
                  Cluster Preview
                </h3>

                <div className="space-y-6">
                  {clusters.map(cluster => {
                    const matchedCandidates = candidates.filter(c => cluster.candidateIds.includes(c.id));

                    return (
                      <div key={cluster.id} className="border border-[#e2e8f0] rounded-[12px] p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-[16px] h-[16px] rounded-full"
                              style={{ backgroundColor: cluster.color }}
                            />
                            <div>
                              <h4 className="text-[16px] font-semibold text-[#1e293b]">{cluster.name}</h4>
                              <p className="text-[14px] text-[#64748b]">{cluster.description}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[24px] font-semibold text-[#1e293b]">{matchedCandidates.length}</p>
                            <p className="text-[12px] text-[#64748b]">candidates</p>
                          </div>
                        </div>

                        {/* Filters Summary */}
                        <div className="mb-4">
                          <p className="text-[12px] text-[#64748b] mb-2">Applied Filters:</p>
                          <div className="flex flex-wrap gap-2">
                            {cluster.filters.map((filter, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-1 rounded-full bg-[#f1f5f9] text-[#64748b] text-[12px] flex items-center gap-2"
                              >
                                <span className="font-medium">{filter.skillName}</span>
                                {filter.minProficiency && (
                                  <span className="opacity-75">• {filter.minProficiency}+</span>
                                )}
                                {filter.required && (
                                  <span className="text-[#10b981]">• Required</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Matched Candidates */}
                        <div className="grid grid-cols-2 gap-3">
                          {matchedCandidates.map(candidate => (
                            <div
                              key={candidate.id}
                              className="border border-[#e2e8f0] rounded-[8px] p-3 hover:border-[#8b5cf6] transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-[14px] font-medium text-[#1e293b]">{candidate.name}</h5>
                                {candidate.overallScore && (
                                  <span className="px-2 py-1 rounded-full bg-[#ddd6fe] text-[#8b5cf6] text-[12px] font-semibold">
                                    {candidate.overallScore}%
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-[#64748b] mb-2">{candidate.email}</p>
                              <div className="flex flex-wrap gap-1">
                                {detectedSkills.get(candidate.id)?.slice(0, 3).map(skill => (
                                  <span
                                    key={skill.id}
                                    className="px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b] text-[11px]"
                                  >
                                    {skill.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep('filtering')}
                  className="px-6 py-3 rounded-[8px] border border-[#e2e8f0] text-[14px] font-medium text-[#64748b] hover:bg-[#f9fafb] transition-colors flex items-center gap-2"
                >
                  <ChevronLeft size={16} />
                  Back to Filtering
                </button>
                <button
                  onClick={() => onComplete(clusters)}
                  className="px-6 py-3 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Check size={16} />
                  Complete Clustering
                </button>
              </div>
            </motion.div>
          )}

          {/* Action Buttons for Filtering Step */}
          {currentStep === 'filtering' && (
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setCurrentStep('detection')}
                className="px-6 py-3 rounded-[8px] border border-[#e2e8f0] text-[14px] font-medium text-[#64748b] hover:bg-[#f9fafb] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleApplyFilters}
                className="px-6 py-3 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all flex items-center gap-2"
              >
                Apply Filters & Preview
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Modal */}
      <AnimatePresence>
        {showAIAssistant && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[16px] w-full max-w-[600px] p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-[18px] font-semibold text-[#1e293b] mb-2">AI-Assisted Filtering</h3>
                  <p className="text-[14px] text-[#64748b]">
                    Describe what you're looking for and AI will suggest relevant filters
                  </p>
                </div>
                <button
                  onClick={() => setShowAIAssistant(false)}
                  className="w-[32px] h-[32px] rounded-[8px] hover:bg-[#f1f5f9] flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="E.g., 'Find candidates with strong React and TypeScript skills, at least 3 years experience, and good communication skills'"
                className="w-full h-[120px] p-4 border border-[#e2e8f0] rounded-[8px] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] mb-6"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAIAssistant(false)}
                  className="px-6 py-3 rounded-[8px] border border-[#e2e8f0] text-[14px] font-medium text-[#64748b] hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAIAssist}
                  className="px-6 py-3 rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[14px] font-medium hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Generate Filters
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
