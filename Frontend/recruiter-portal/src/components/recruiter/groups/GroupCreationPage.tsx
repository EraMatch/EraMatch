import { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, X, User, MapPin, Briefcase, ArrowUpDown, Users, Sliders, ChevronLeft, ExternalLink, Brain, TrendingUp, AlertCircle, Zap, BarChart3 } from 'lucide-react';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { AdvancedFilterDrawer } from '../candidates/AdvancedFilterDrawer';
import { api } from '../../../services/api';
import type { ApplicationScoreBreakdown } from '../../../services/types';

interface Candidate {
  id: string;
  applicationId?: string;
  name: string;
  email: string;
  experience: number;
  location: string;
  skills: string[];
  match: number;
  pre_score_final?: number | null;
  semantic_fit_score?: number | null;
  skills_experience_score?: number | null;
  optional_profile_boost?: number | null;
  jd_quality_score?: number | null;
  jd_quality_status?: string | null;
  score_explanation?: string[];
  keyword_match_score?: number | null;  // Keyword match score (0-100) from JD keywords vs parsed CV
  starred: boolean;
  // Detailed fields
  companies?: string[];
  job_titles?: string[];
  universities?: string[];
  degrees?: string[];
  // Group fields
  groupId?: string;
  groupName?: string;
}

interface GroupCreationPageProps {
  positionTitle: string;
  positionId: string;
  onCancel: () => void;
  onCreate: (groupData: {
    name: string;
    candidateIds: string[];
    aiRankingUsed: boolean;
    nlpQuery?: string;
  }) => void;
}

interface IntentConstraints {
  minYears: number | null;
  mustHaveSkills: string[];
}

export function GroupCreationPage({
  positionTitle,
  positionId,
  onCancel,
  onCreate
}: GroupCreationPageProps) {
  // Candidate data state
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillsFilter, setSkillsFilter] = useState<string[]>([]);

  // Position JD context (fetched from backend, forwarded to AI service)
  const [positionJD, setPositionJD] = useState<{
    job_title: string;
    job_description: string | null;
    required_skills: string[];
    experience_level: string | null;
    years_of_experience: number;
  } | null>(null);

  // Fetch candidates from API
  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setLoading(true);
        // Fetch candidates for this specific position
        const response = await api.recruiter.getPositionDetails(positionId);
        console.log('GroupCreationPage response:', response);

        // Store JD context for AI Rank
        if (response) {
          const r = response as any;
          setPositionJD({
            job_title: r.job_title || '',
            job_description: r.job_description || null,
            required_skills: Array.isArray(r.required_skills) ? r.required_skills : [],
            experience_level: r.experience_level || null,
            years_of_experience: r.years_of_experience || 0,
          });
        }

        // Extract candidates from response details
        if (response && (response as any).candidates) {
          console.log('All candidates:', (response as any).candidates);
          // Filter out candidates who are already in a group, UNLESS it's "Main Pipeline"
          const availableCandidates = ((response as any).candidates as any[]).map(c => ({
            ...c,
            id: c.id
          })).filter(c => {
            const isMainPipeline = c.groupName === "Main Pipeline";
            const available = (!c.groupId && !c.groupName) || isMainPipeline;

            if (!available) console.log('Filtered out:', c.name, c.groupId, c.groupName);
            return available;
          });
          console.log('Available candidates:', availableCandidates);
          setAllCandidates(availableCandidates);
        } else {
          console.log('No candidates in response');
        }
      } catch (error) {
        console.error('Failed to fetch group candidates:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [positionId]);

  // Filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any>({});
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // AI Features
  const [aiRankingEnabled, setAiRankingEnabled] = useState(false);
  const [nlpQuery, setNlpQuery] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isJdRankProcessing, setIsJdRankProcessing] = useState(false);
  const [aiSelectionInfo, setAiSelectionInfo] = useState('');
  // AI Sort — LLM-powered ranking (NLP query-based)
  const [aiSortReasoning, setAiSortReasoning] = useState<Record<string, string>>({});
  const [aiSortIntent, setAiSortIntent] = useState<{
    skills: string[]; min_years: number | null; location: string | null;
    seniority: string | null; summary: string;
  } | null>(null);
  const [aiSortRankedIds, setAiSortRankedIds] = useState<string[]>([]);
  const [aiSortError, setAiSortError] = useState<string | null>(null);
  // AI Rank (JD-based LLM ranking)
  const [jdRankRankedIds, setJdRankRankedIds] = useState<string[]>([]);
  const [jdRankReasoning, setJdRankReasoning] = useState<Record<string, string>>({});
  const [jdRankFitSummary, setJdRankFitSummary] = useState<string | null>(null);
  const [jdRankError, setJdRankError] = useState<string | null>(null);
  // AI Rank Insights panel
  const [showRankInsights, setShowRankInsights] = useState(false);

  // View Why modal
  const [viewWhyOpen, setViewWhyOpen] = useState(false);
  const [viewWhyCandidate, setViewWhyCandidate] = useState<Candidate | null>(null);
  const [viewWhyLoading, setViewWhyLoading] = useState(false);
  const [viewWhyBreakdown, setViewWhyBreakdown] = useState<ApplicationScoreBreakdown | null>(null);
  const [viewWhyError, setViewWhyError] = useState<string | null>(null);

  // Selection
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [customBulkNumber, setCustomBulkNumber] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Group Details
  const [groupName, setGroupName] = useState('');
  const [groupNameAiSuggested, setGroupNameAiSuggested] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const clampScore = (value: number) => Math.max(0, Math.min(100, value));

  const normalize = (value: string) => value.toLowerCase().trim();

  const buildSkillLexicon = (source: Candidate[]) => {
    const set = new Set<string>();
    for (const c of source) {
      for (const s of c.skills || []) {
        const cleaned = normalize(String(s));
        if (cleaned) set.add(cleaned);
      }
    }
    return Array.from(set);
  };

  const tokenizeQuery = (query: string): string[] => {
    const stopWords = new Set([
      'the', 'a', 'an', 'for', 'with', 'and', 'or', 'to', 'of', 'in', 'on',
      'candidate', 'candidates', 'want', 'need', 'looking', 'group', 'role', 'position'
    ]);
    return query
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !stopWords.has(t));
  };

  const extractIntentConstraints = (query: string, source: Candidate[]): IntentConstraints => {
    if (!query.trim()) {
      return { minYears: null, mustHaveSkills: [] };
    }

    const lexicon = buildSkillLexicon(source);
    const lower = normalize(query);

    const minYearsMatch = lower.match(/(?:at\s*least|min(?:imum)?|>=?)\s*(\d{1,2})\s*(?:\+)?\s*(?:years|yrs|year)/i)
      || lower.match(/(\d{1,2})\s*(?:\+)?\s*(?:years|yrs|year)/i);
    const minYears = minYearsMatch ? Number(minYearsMatch[1]) : null;

    const mustSkillSet = new Set<string>();

    // Detect explicit MUST/REQUIRED phrases and capture nearby text.
    const explicitSegments = [
      ...lower.matchAll(/(?:must have|required|required skills|need|needs)\s*[:\-]?\s*([^.;\n]+)/g),
    ];

    for (const seg of explicitSegments) {
      const area = seg[1] || '';
      for (const skill of lexicon) {
        if (area.includes(skill)) mustSkillSet.add(skill);
      }
    }

    // Also catch quoted phrases that map to skills.
    const quotedSegments = [...lower.matchAll(/"([^"]+)"|'([^']+)'/g)]
      .map(m => (m[1] || m[2] || '').trim())
      .filter(Boolean);

    for (const quoted of quotedSegments) {
      for (const skill of lexicon) {
        if (quoted.includes(skill) || skill.includes(quoted)) mustSkillSet.add(skill);
      }
    }

    // Fallback: if explicit list not found, use top matching lexicon skills from query.
    if (mustSkillSet.size === 0) {
      const matchedSkills = lexicon.filter(skill => lower.includes(skill));
      matchedSkills.slice(0, 6).forEach(skill => mustSkillSet.add(skill));
    }

    return {
      minYears,
      mustHaveSkills: Array.from(mustSkillSet),
    };
  };

  const meetsHardConstraints = (candidate: Candidate, constraints: IntentConstraints) => {
    const meetsYears = constraints.minYears == null || Number(candidate.experience || 0) >= constraints.minYears;
    const candidateSkills = (candidate.skills || []).map(s => normalize(String(s)));
    const meetsSkills = constraints.mustHaveSkills.every(requiredSkill =>
      candidateSkills.some(cs => cs.includes(requiredSkill) || requiredSkill.includes(cs))
    );
    return meetsYears && meetsSkills;
  };

  const getSemanticScore = (candidate: Candidate, query: string): number => {
    if (!query.trim()) return 0;

    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return 0;

    const fields = {
      skills: (candidate.skills || []).join(' ').toLowerCase(),
      titles: (candidate.job_titles || []).join(' ').toLowerCase(),
      companies: (candidate.companies || []).join(' ').toLowerCase(),
      location: (candidate.location || '').toLowerCase(),
      education: [ ...(candidate.universities || []), ...(candidate.degrees || []) ].join(' ').toLowerCase(),
      profile: `${candidate.name} ${candidate.email}`.toLowerCase(),
    };

    const scoreField = (text: string, weight: number) => {
      if (!text) return 0;
      let hits = 0;
      for (const token of tokens) {
        if (text.includes(token)) hits += 1;
      }
      return (hits / tokens.length) * weight;
    };

    const minYearsMatch = query.match(/(\d{1,2})\s*\+?\s*(years|yrs|year)/i);
    const yearsTarget = minYearsMatch ? Number(minYearsMatch[1]) : null;
    const experienceScore = yearsTarget == null
      ? 0
      : (candidate.experience >= yearsTarget ? 10 : Math.max(0, (candidate.experience / Math.max(yearsTarget, 1)) * 10));

    const weighted =
      scoreField(fields.skills, 40) +
      scoreField(fields.titles, 20) +
      scoreField(fields.companies, 12) +
      scoreField(fields.location, 10) +
      scoreField(fields.education, 8) +
      scoreField(fields.profile, 10) +
      experienceScore;

    return clampScore(weighted);
  };

  const getAiBaseScore = (candidate: Candidate) => {
    if (candidate.pre_score_final == null) return null;
    return clampScore(Number(candidate.pre_score_final));
  };

  /** 4-dimensional composite score for AI Rank mode. */
  const getMultiDimScore = (candidate: Candidate, query: string) => {
    const cvFit = clampScore(Number(candidate.pre_score_final ?? candidate.match ?? 0));
    const semantic = query.trim() ? getSemanticScore(candidate, query) : cvFit * 0.5;
    const exp = Number(candidate.experience ?? 0);
    const expTier = exp >= 12 ? 100 : exp >= 8 ? 88 : exp >= 5 ? 72 : exp >= 3 ? 55 : exp >= 1 ? 35 : 12;
    const skillPts = Math.min(25, (candidate.skills?.length ?? 0) * 5);
    const titlePts = (candidate.job_titles?.length ?? 0) >= 1 ? 25 : 0;
    const compPts  = (candidate.companies?.length ?? 0) >= 1 ? 25 : 0;
    const eduPts   = (candidate.universities?.length ?? 0) >= 1 ? 25 : 0;
    const completeness = skillPts + titlePts + compPts + eduPts;
    const composite = clampScore(cvFit * 0.40 + semantic * 0.30 + expTier * 0.20 + completeness * 0.10);
    return { cvFit, semantic, expTier, completeness, composite };
  };

  const getDisplayScore = (candidate: Candidate) => {
    if (aiRankingEnabled) return getMultiDimScore(candidate, nlpQuery).composite;
    return clampScore(Number(candidate.match || 0));
  };

  const rankCandidates = (source: Candidate[], useAi: boolean, query: string) => {
    if (!useAi) {
      return [...source].sort((a, b) => clampScore(Number(b.match || 0)) - clampScore(Number(a.match || 0)));
    }
    return [...source].sort((a, b) => {
      const scoreA = getMultiDimScore(a, query).composite;
      const scoreB = getMultiDimScore(b, query).composite;
      const aHard = meetsHardConstraints(a, intentConstraints);
      const bHard = meetsHardConstraints(b, intentConstraints);
      if (aHard !== bHard) return aHard ? -1 : 1;
      return scoreB - scoreA;
    });
  };

  // Apply manual filters from advanced drawer
  const filteredCandidates = useMemo(() => {
    let filtered = [...allCandidates];
    const f = advancedFilters;

    // 1. Identity
    if (f.fullName) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(f.fullName.toLowerCase()));
    }
    if (f.location) {
      filtered = filtered.filter(c => c.location && c.location.toLowerCase().includes(f.location.toLowerCase()));
    }

    // 2. Education
    if (f.school) {
      filtered = filtered.filter(c => c.universities?.some(u => u.toLowerCase().includes(f.school.toLowerCase())));
    }
    if (f.degree && f.degree.length > 0) {
      filtered = filtered.filter(c => c.degrees?.some(d => f.degree.some((fd: string) => d.toLowerCase().includes(fd.toLowerCase()))));
    }

    // 3. Work Experience
    if (f.company) {
      filtered = filtered.filter(c => c.companies?.some(comp => comp.toLowerCase().includes(f.company.toLowerCase())));
    }
    if (f.jobTitle) {
      filtered = filtered.filter(c => c.job_titles?.some(t => t.toLowerCase().includes(f.jobTitle.toLowerCase())));
    }
    if (f.yearsMin > 0 || f.yearsMax < 20) {
      filtered = filtered.filter(c => c.experience >= f.yearsMin && c.experience <= f.yearsMax);
    }

    // 4. Skills
    if (f.techStack && f.techStack.length > 0) {
      // Assume AND logic for now (must have all selected skills)
      filtered = filtered.filter(c => f.techStack.every((s: string) => c.skills.some(cs => cs.toLowerCase().includes(s.toLowerCase()))));
    }

    // 5. Match Score (Optional, reusing assessment score slider if desired, or adding new one)
    // For now, we don't have a specific Match Score filter in the drawer, but we could use the AI Ranking.

    return filtered;
  }, [allCandidates, advancedFilters]);

  const intentConstraints = useMemo(
    () => extractIntentConstraints(nlpQuery, filteredCandidates.length > 0 ? filteredCandidates : allCandidates),
    [nlpQuery, filteredCandidates, allCandidates],
  );

  // Apply AI ranking — priority: AI Sort (NLP) > JD Rank (LLM) > local formula
  const displayCandidates = useMemo(() => {
    // AI Sort (NLP query) takes highest priority when available
    if (aiRankingEnabled && aiSortRankedIds.length > 0) {
      const idxMap = new Map(aiSortRankedIds.map((id, i) => [id, i]));
      return [...filteredCandidates].sort((a, b) => {
        const ia = idxMap.has(a.id) ? idxMap.get(a.id)! : 9999;
        const ib = idxMap.has(b.id) ? idxMap.get(b.id)! : 9999;
        return ia - ib;
      });
    }
    // JD Rank (LLM, JD-based) is second priority
    if (aiRankingEnabled && jdRankRankedIds.length > 0) {
      const idxMap = new Map(jdRankRankedIds.map((id, i) => [id, i]));
      return [...filteredCandidates].sort((a, b) => {
        const ia = idxMap.has(a.id) ? idxMap.get(a.id)! : 9999;
        const ib = idxMap.has(b.id) ? idxMap.get(b.id)! : 9999;
        return ia - ib;
      });
    }
    // Local formula fallback
    return rankCandidates(filteredCandidates, aiRankingEnabled, nlpQuery);
  }, [filteredCandidates, aiRankingEnabled, nlpQuery, aiSortRankedIds, jdRankRankedIds]);

  const AI_SERVICE_URL = 'http://localhost:8001';

  /** Called when AI Rank toggle is switched ON — triggers JD-based LLM ranking. */
  const handleAiRankToggle = async (enabled: boolean) => {
    setAiRankingEnabled(enabled);
    if (!enabled) {
      // Reset all AI rank state on toggle-off
      setShowRankInsights(false);
      setJdRankRankedIds([]);
      setJdRankReasoning({});
      setJdRankFitSummary(null);
      setJdRankError(null);
      setAiSortRankedIds([]);
      setAiSortReasoning({});
      setAiSortIntent(null);
      setAiSelectionInfo('');
      return;
    }

    // No JD available — skip LLM, stay on local formula
    if (!positionJD?.job_description) {
      setJdRankError('No job description found for this position — using local scoring instead.');
      setShowRankInsights(true);
      return;
    }

    setIsJdRankProcessing(true);
    setJdRankError(null);
    setJdRankFitSummary(null);
    setJdRankRankedIds([]);
    setJdRankReasoning({});
    setShowRankInsights(true);

    try {
      const payload = {
        job_title: positionJD.job_title,
        job_description: positionJD.job_description,
        required_skills: positionJD.required_skills,
        experience_level: positionJD.experience_level,
        years_of_experience: positionJD.years_of_experience || undefined,
        candidates: filteredCandidates.map(c => ({
          id: c.id,
          name: c.name,
          skills: c.skills || [],
          experience: c.experience || 0,
          titles: c.job_titles || [],
          companies: c.companies || [],
          degrees: c.degrees || [],
          universities: c.universities || [],
          location: c.location || '',
        })),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${AI_SERVICE_URL}/llm/jd-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`AI service error ${res.status}`);
      const data = await res.json();

      setJdRankRankedIds(data.ranked_ids || []);
      setJdRankReasoning(data.reasoning || {});
      setJdRankFitSummary(data.fit_summary || null);

      // Check if LLM returned fallback
      const isFallback = data.model === 'fallback';
      if (isFallback) {
        setJdRankError('AI service returned fallback — using local scoring. Reasoning unavailable.');
      }

      const topN = Math.min(50, Math.max(10, Math.ceil((data.ranked_ids?.length ?? 0) * 0.4)));
      const autoSelected = (data.ranked_ids || []).slice(0, topN);
      setSelectedCandidates(new Set(autoSelected));
      setAiSelectionInfo(`🎯 JD-ranked ${data.ranked_ids?.length ?? 0} candidates — top ${autoSelected.length} auto-selected.`);
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'JD ranking timed out — using local scoring as fallback.'
        : 'AI service unavailable — using local scoring as fallback.';
      setJdRankError(msg);
      // Fallback: keep local formula (jdRankRankedIds stays empty)
    } finally {
      setIsJdRankProcessing(false);
    }
  };

  const handleAiEnhance = async () => {
    if (!nlpQuery.trim()) return;
    setIsAiProcessing(true);
    setAiSortReasoning({});
    setAiSortIntent(null);
    setAiSortRankedIds([]);
    setAiSortError(null);
    setAiRankingEnabled(true);
    setAiSelectionInfo('');
    setShowRankInsights(true);
    try {
      const payload = filteredCandidates.map(c => ({
        id: c.id, name: c.name,
        skills: c.skills || [], experience: c.experience || 0,
        titles: c.job_titles || [], location: c.location || '', degrees: c.degrees || [],
      }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${AI_SERVICE_URL}/llm/smart-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlpQuery, candidates: payload }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`AI service error ${res.status}`);
      const data = await res.json();
      setAiSortReasoning(data.reasoning || {});
      setAiSortIntent(data.intent || null);
      setAiSortRankedIds(data.ranked_ids || []);
      const topN = Math.min(50, Math.max(10, Math.ceil((data.ranked_ids?.length ?? 0) * 0.4)));
      const autoSelected = (data.ranked_ids || []).slice(0, topN);
      setSelectedCandidates(new Set(autoSelected));
      setAiSelectionInfo(`✨ AI ranked ${data.ranked_ids?.length ?? 0} candidates — top ${autoSelected.length} auto-selected.`);
      // Auto-suggest group name from LLM intent summary
      const suggestedName = data.intent?.summary;
      if (suggestedName && suggestedName.trim() && !groupName.trim()) {
        setGroupName(suggestedName.trim());
        setGroupNameAiSuggested(true);
      }
    } catch {
      setAiSortError('AI service unavailable — using local multi-dim ranking as fallback.');
      const ranked = rankCandidates(filteredCandidates, true, nlpQuery);
      const autoSelected = ranked.slice(0, Math.min(50, Math.max(10, ranked.length)));
      setSelectedCandidates(new Set(autoSelected.map(c => c.id)));
      setAiSelectionInfo(`Local multi-dim ranking — auto-selected top ${autoSelected.length}.`);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const openViewWhy = async (candidate: Candidate) => {
    setViewWhyCandidate(candidate);
    setViewWhyOpen(true);
    setViewWhyError(null);
    setViewWhyBreakdown(null);

    if (!candidate.applicationId) {
      setViewWhyError('No application context found for this candidate.');
      return;
    }

    try {
      setViewWhyLoading(true);
      const breakdown = await api.recruiter.getApplicationScoreBreakdown(String(candidate.applicationId));
      setViewWhyBreakdown(breakdown);
    } catch (error) {
      setViewWhyError('Unable to load detailed score breakdown.');
    } finally {
      setViewWhyLoading(false);
    }
  };

  const toggleSkillFilter = (skill: string) => {
    setSkillsFilter(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const allIds = displayCandidates.map(c => c.id);
    const allSelected = allIds.every(id => selectedCandidates.has(id));

    if (allSelected) {
      // Deselect all visible
      setSelectedCandidates(prev => {
        const newSet = new Set(prev);
        allIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all visible
      setSelectedCandidates(prev => {
        const newSet = new Set(prev);
        allIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  const selectTopN = (n: number) => {
    const topIds = displayCandidates.slice(0, n).map(c => c.id);
    setSelectedCandidates(new Set(topIds));
  };

  const handleCustomBulkSelect = () => {
    const n = parseInt(customBulkNumber);
    if (!isNaN(n) && n > 0) {
      selectTopN(n);
      setShowCustomInput(false);
      setCustomBulkNumber('');
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedCandidates.size === 0 || isCreating) return;

    try {
      setIsCreating(true);
      await onCreate({
        name: groupName,
        candidateIds: Array.from(selectedCandidates),
        aiRankingUsed: aiRankingEnabled,
        nlpQuery: nlpQuery || undefined
      });
    } catch (error) {
      console.error('Error creating group:', error);
      setIsCreating(false);
    }
  };

  const getMatchColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ffa366';
  };

  const formatScore = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : 'N/A';
  };

  const getZeroReason = (
    metricKey: 'semantic_fit_score' | 'skills_experience_score' | 'jd_quality_score',
    value: number,
    breakdown: ApplicationScoreBreakdown | null,
  ) => {
    if (!Number.isFinite(value) || value > 0) return null;

    if (!breakdown) {
      return 'No backend score-breakdown payload returned for this application.';
    }

    if (!breakdown.prescore_version) {
      return 'This application does not include a PreScore V2 version in stored analysis.';
    }

    if (metricKey === 'semantic_fit_score') {
      return 'Backend semantic-fit component was computed as 0.0 (often due to weak JD-to-CV semantic evidence in stored analysis).';
    }

    if (metricKey === 'skills_experience_score') {
      return 'Backend skills+experience component was computed as 0.0 (required skill/experience evidence not found in parsed CV data).';
    }

    return 'JD quality component was computed as 0.0 by backend JD critic output for this position/application context.';
  };

  return (
    <div className="h-full w-full bg-[#edf0f8] flex flex-col">
      {/* Top Section - Discovery Engine */}
      <div className="bg-white border-b border-[#e5e7eb] px-8 py-6">
        {/* Back Button */}
        <button
          onClick={onCancel}
          className="flex items-center gap-2 mb-4 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
        >
          <ChevronLeft size={16} />
          Back to Position Dashboard
        </button>

        <div className="mb-6">
          <h2 className="text-[#111827] mb-1">
            Create Candidate Group
          </h2>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            for {positionTitle}
          </p>
        </div>

        {/* Unified Search & Filter Toolbar */}
        <div className="mb-6 flex items-center gap-4">
          {/* Search Bar - Flex Grow */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              value={nlpQuery}
              onChange={(e) => setNlpQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiEnhance()}
              placeholder="Describe your ideal candidate group (e.g. 'Senior Python backend 5+ years, fintech exp') — press Enter or AI Sort"
              className="w-full h-[48px] pl-[40px] pr-[140px] rounded-[10px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent shadow-sm transition-all"
            />
            {/* AI Sort Button inside Input */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <button
                onClick={handleAiEnhance}
                disabled={!nlpQuery.trim() || isAiProcessing}
                className="h-[36px] px-[16px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] disabled:from-[#f3f4f6] disabled:to-[#f3f4f6] disabled:text-[#9ca3af] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[13px] text-white flex items-center gap-1.5 transition-all font-medium shadow-sm"
              >
                {isAiProcessing ? (
                  <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Ranking...</span></>
                ) : (
                  <><Zap size={13} /><span>AI Sort</span></>
                )}
              </button>
            </div>
          </div>

          {/* AI Rank Toggle */}
          <div className={`flex items-center gap-3 h-[48px] px-[16px] rounded-[10px] border shadow-sm transition-all ${aiRankingEnabled ? 'bg-gradient-to-r from-[#eef2ff] to-[#f5f3ff] border-[#a5b4fc]' : 'bg-white border-[#e5e7eb]'}`}>
            {isJdRankProcessing ? (
              <div className="w-4 h-4 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Brain size={15} className={aiRankingEnabled ? 'text-[#6366f1]' : 'text-[#9ca3af]'} />
            )}
            <span className={`font-['Arimo',sans-serif] text-[13px] font-medium ${aiRankingEnabled ? 'text-[#4f46e5]' : 'text-[#374151]'}`}>
              {isJdRankProcessing ? 'Ranking...' : 'AI Rank'}
            </span>
            <Switch
              checked={aiRankingEnabled}
              onCheckedChange={handleAiRankToggle}
              disabled={isJdRankProcessing}
            />
            {aiRankingEnabled && !isJdRankProcessing && (
              <button
                onClick={() => setShowRankInsights(p => !p)}
                title="Toggle Insights Panel"
                className={`ml-1 p-1 rounded-[4px] transition-colors ${showRankInsights ? 'bg-[#6366f1] text-white' : 'hover:bg-[#e0e7ff] text-[#6366f1]'}`}
              >
                <BarChart3 size={13} />
              </button>
            )}
          </div>

          {/* Advanced Filter Button */}
          <button
            onClick={() => setShowAdvancedFilters(true)}
            className={`h-[48px] px-[20px] rounded-[10px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] flex items-center gap-2 transition-all shadow-sm ${activeFilterCount > 0 ? 'border-[#6366f1] text-[#6366f1] bg-[#eef2ff]' : ''}`}
          >
            <Sliders size={18} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#6366f1] text-white rounded-full min-w-[20px] h-[20px] px-1 flex items-center justify-center text-[11px] font-medium">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* JD Rank Fit Summary Banner */}
        {jdRankFitSummary && aiRankingEnabled && !aiSortIntent && (
          <div className="mb-4 px-[16px] py-[10px] rounded-[10px] bg-gradient-to-r from-[#f0fdf4] to-[#ecfdf5] border border-[#86efac] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Brain size={15} className="text-[#16a34a]" />
              <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#15803d]">JD Fit Criteria:</span>
            </div>
            <span className="font-['Arimo',sans-serif] text-[12px] text-[#166534]">{jdRankFitSummary}</span>
            {positionJD?.required_skills?.slice(0, 5).map((s, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] font-['Arimo',sans-serif] text-[11px]">{s}</span>
            ))}
          </div>
        )}

        {/* LLM Intent Banner (AI Sort) */}
        {aiSortIntent && nlpQuery && (
          <div className="mb-4 px-[16px] py-[10px] rounded-[10px] bg-gradient-to-r from-[#eef2ff] to-[#f5f3ff] border border-[#a5b4fc] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Brain size={15} className="text-[#6366f1]" />
              <span className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#4f46e5]">AI Detected:</span>
            </div>
            {aiSortIntent.seniority && (
              <span className="px-2 py-0.5 rounded-full bg-[#6366f1] text-white font-['Arimo',sans-serif] text-[11px] font-medium capitalize">{aiSortIntent.seniority}</span>
            )}
            {aiSortIntent.min_years != null && (
              <span className="px-2 py-0.5 rounded-full bg-[#ddd6fe] text-[#4f46e5] font-['Arimo',sans-serif] text-[11px]">{aiSortIntent.min_years}+ yrs</span>
            )}
            {aiSortIntent.location && (
              <span className="px-2 py-0.5 rounded-full bg-[#ddd6fe] text-[#4f46e5] font-['Arimo',sans-serif] text-[11px]"><MapPin size={9} className="inline mr-0.5" />{aiSortIntent.location}</span>
            )}
            {aiSortIntent.skills.slice(0, 5).map((s, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-[#e0e7ff] text-[#3730a3] font-['Arimo',sans-serif] text-[11px]">{s}</span>
            ))}
          </div>
        )}

        {/* JD Rank Error / Fallback Notice */}
        {jdRankError && aiRankingEnabled && (
          <div className="mb-4 px-[16px] py-[10px] rounded-[10px] bg-[#fffbeb] border border-[#fde68a] flex items-center gap-2">
            <AlertCircle size={15} className="text-[#d97706] shrink-0" />
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#92400e]">{jdRankError}</p>
          </div>
        )}

        {/* AI Sort Error / Fallback Notice */}
        {aiSortError && (
          <div className="mb-4 px-[16px] py-[10px] rounded-[10px] bg-[#fffbeb] border border-[#fde68a] flex items-center gap-2">
            <AlertCircle size={15} className="text-[#d97706] shrink-0" />
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#92400e]">{aiSortError}</p>
          </div>
        )}

        {/* AI Selection Info */}
        {aiSelectionInfo && (
          <div className="mb-4 px-[16px] py-[10px] rounded-[10px] bg-[#eff6ff] border border-[#bfdbfe] flex items-center gap-2">
            <TrendingUp size={15} className="text-[#1d4ed8]" />
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] font-medium">{aiSelectionInfo}</p>
          </div>
        )}

        {/* Middle Section - Candidate Grid */}
      </div>

      {/* Middle Section - Candidate Grid */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {/* Bulk Selection Toolbar */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                Quick Select:
              </span>
              <button
                onClick={() => selectTopN(10)}
                className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
              >
                Top 10
              </button>
              <button
                onClick={() => selectTopN(50)}
                className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
              >
                Top 50
              </button>
              {showCustomInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={customBulkNumber}
                    onChange={(e) => setCustomBulkNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomBulkSelect()}
                    placeholder="N"
                    className="w-[60px] h-[32px] px-[8px] rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    autoFocus
                  />
                  <button
                    onClick={handleCustomBulkSelect}
                    className="h-[32px] px-[12px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[12px] text-white transition-colors"
                  >
                    Select
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomBulkNumber('');
                    }}
                    className="h-[32px] px-[8px] rounded-[6px] hover:bg-[#f3f4f6] transition-colors"
                  >
                    <X size={14} className="text-[#6b7280]" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="h-[32px] px-[12px] rounded-[6px] bg-[#f3f4f6] hover:bg-[#e5e7eb] font-['Arimo',sans-serif] text-[12px] text-[#374151] transition-colors"
                >
                  Custom N
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                {selectedCandidates.size} selected
              </span>
              {selectedCandidates.size > 0 && (
                <button
                  onClick={() => setSelectedCandidates(new Set())}
                  className="h-[32px] px-[12px] rounded-[6px] border border-[#e5e7eb] hover:bg-[#fef2f2] hover:border-[#ef4444] font-['Arimo',sans-serif] text-[12px] text-[#ef4444] transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4 flex items-center justify-between">
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Showing {displayCandidates.length} candidates
          </p>
          <div className="flex items-center gap-2">
            {aiRankingEnabled && (
              <div className="flex items-center gap-2 px-[12px] py-[6px] rounded-[6px] bg-gradient-to-r from-[#eef2ff] to-[#f5f3ff] border border-[#a5b4fc]">
                {isJdRankProcessing ? (
                  <div className="w-3 h-3 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Brain size={13} className="text-[#6366f1]" />
                )}
                <span className="font-['Arimo',sans-serif] text-[12px] text-[#4f46e5] font-medium">
                  {isJdRankProcessing ? 'Ranking...' : aiSortRankedIds.length > 0 ? 'AI Sorted' : jdRankRankedIds.length > 0 ? 'JD Ranked' : 'Local Scored'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* AI Rank Insights Panel */}
        {aiRankingEnabled && showRankInsights && displayCandidates.length > 0 && (() => {
          const scores = displayCandidates.map(c => getMultiDimScore(c, nlpQuery).composite);
          const bands = [scores.filter(s => s >= 85).length, scores.filter(s => s >= 65 && s < 85).length, scores.filter(s => s >= 45 && s < 65).length, scores.filter(s => s < 45).length];
          const allSkills = displayCandidates.flatMap(c => c.skills || []);
          const skillFreq = new Map<string, number>();
          allSkills.forEach(s => skillFreq.set(s.toLowerCase(), (skillFreq.get(s.toLowerCase()) || 0) + 1));
          const querySkills = (aiSortIntent?.skills || intentConstraints.mustHaveSkills).map(s => s.toLowerCase());
          const gaps = querySkills.filter(s => (skillFreq.get(s) || 0) < displayCandidates.length * 0.3);
          const recommended = bands[0] + Math.floor(bands[1] * 0.6);
          return (
            <div className="mb-4 bg-gradient-to-br from-[#f8f7ff] to-[#eef2ff] rounded-[12px] border border-[#c7d2fe] p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={15} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[13px] font-semibold text-[#4f46e5]">AI Rank Insights</span>
                <button onClick={() => setShowRankInsights(false)} className="ml-auto text-[#9ca3af] hover:text-[#374151]"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">Score Distribution</p>
                  <div className="space-y-1.5">
                    {[['85-100', bands[0], '#10b981'], ['65-84', bands[1], '#6366f1'], ['45-64', bands[2], '#f59e0b'], ['<45', bands[3], '#ef4444']].map(([label, count, color]) => (
                      <div key={String(label)} className="flex items-center gap-2">
                        <div className="w-[80px] h-[6px] rounded-full bg-[#e5e7eb] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${displayCandidates.length > 0 ? (Number(count)/displayCandidates.length*100) : 0}%`, backgroundColor: String(color) }} />
                        </div>
                        <span className="font-['Arimo',sans-serif] text-[11px] text-[#374151]">{label} ({count})</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">Skill Gaps vs Query</p>
                  {gaps.length > 0 ? gaps.slice(0, 4).map(g => (
                    <div key={g} className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
                      <span className="font-['Arimo',sans-serif] text-[11px] text-[#374151]">{g}</span>
                    </div>
                  )) : <p className="font-['Arimo',sans-serif] text-[11px] text-[#10b981]">No major gaps detected</p>}
                </div>
                <div className="flex flex-col items-center justify-center bg-white rounded-[10px] border border-[#e0e7ff] p-3">
                  <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-1">Recommended Group Size</p>
                  <p className="font-['Arimo',sans-serif] text-[28px] font-bold text-[#6366f1]">{recommended}</p>
                  <p className="font-['Arimo',sans-serif] text-[10px] text-[#9ca3af]">based on score distribution</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Candidates Table */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
              <tr>
                <th className="w-[50px] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={displayCandidates.length > 0 && displayCandidates.every(c => selectedCandidates.has(c.id))}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#6366f1] focus:ring-[#6366f1]"
                  />
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    Candidate
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <Briefcase size={14} />
                    Experience
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    Location
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  Skills
                </th>
                <th className="text-left px-4 py-3 font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                  {aiRankingEnabled ? (
                    <div className="flex items-center gap-1.5">
                      <Brain size={13} className="text-[#6366f1]" />
                      <span className="text-[#4f46e5]">AI Score</span>
                      <span className="flex gap-[3px] ml-1">
                        <span className="w-2 h-2 rounded-sm bg-[#6366f1]" title="CV Fit (40%)" />
                        <span className="w-2 h-2 rounded-sm bg-[#8b5cf6]" title="Semantic (30%)" />
                        <span className="w-2 h-2 rounded-sm bg-[#06b6d4]" title="Exp Tier (20%)" />
                        <span className="w-2 h-2 rounded-sm bg-[#10b981]" title="Completeness (10%)" />
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2"><ArrowUpDown size={14} />Match Score</div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayCandidates.map((candidate, index) => (
                <tr
                  key={candidate.id}
                  className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${selectedCandidates.has(candidate.id) ? 'bg-[#eef2ff]' : ''
                    }`}
                  onClick={() => toggleCandidateSelection(candidate.id)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.has(candidate.id)}
                      onChange={() => toggleCandidateSelection(candidate.id)}
                      className="w-4 h-4 rounded border-[#d1d5db] text-[#6366f1] focus:ring-[#6366f1]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/recruiter/candidates/${candidate.id}`, '_blank');
                          }}
                          className="font-['Arimo',sans-serif] text-[13px] text-[#111827] hover:text-[#6366f1] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          {candidate.name}
                          <ExternalLink size={12} className="text-[#9ca3af]" />
                        </span>
                      </div>
                      <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                        {candidate.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {candidate.experience} years
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {candidate.location}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-[8px] py-[2px] rounded-[4px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#374151]"
                        >
                          {skill}
                        </span>
                      ))}
                      {candidate.skills.length > 3 && (
                        <span className="px-[8px] py-[2px] rounded-[4px] bg-[#f3f4f6] font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                          +{candidate.skills.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const displayScore = getDisplayScore(candidate);
                      const dims = aiRankingEnabled ? getMultiDimScore(candidate, nlpQuery) : null;
                      // Prefer AI Sort reasoning, fall back to JD Rank reasoning
                      const aiSortReason = aiSortReasoning[candidate.id];
                      const jdReason = jdRankReasoning[candidate.id];
                      const reasoning = aiSortReason || jdReason;
                      const isJdReason = !aiSortReason && !!jdReason;
                      return (
                        <div className="space-y-1.5">
                          {dims ? (
                            <>
                              {/* 4-segment composite bar */}
                              <div className="flex h-[6px] rounded-full overflow-hidden w-[100px] gap-[1px]">
                                <div style={{ width: `${dims.cvFit * 0.40}%`, backgroundColor: '#6366f1' }} className="h-full rounded-l-full" title={`CV Fit: ${dims.cvFit.toFixed(0)}`} />
                                <div style={{ width: `${dims.semantic * 0.30}%`, backgroundColor: '#8b5cf6' }} className="h-full" title={`Semantic: ${dims.semantic.toFixed(0)}`} />
                                <div style={{ width: `${dims.expTier * 0.20}%`, backgroundColor: '#06b6d4' }} className="h-full" title={`Exp Tier: ${dims.expTier.toFixed(0)}`} />
                                <div style={{ width: `${dims.completeness * 0.10}%`, backgroundColor: '#10b981' }} className="h-full rounded-r-full" title={`Completeness: ${dims.completeness.toFixed(0)}`} />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-['Arimo',sans-serif] text-[13px] font-semibold" style={{ color: getMatchColor(dims.composite) }}>{dims.composite.toFixed(1)}%</span>
                                <span className="font-['Arimo',sans-serif] text-[10px] text-[#9ca3af]">
                                  {jdRankRankedIds.length > 0 && !aiSortRankedIds.length ? 'JD Fit' : 'AI Score'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-[60px] h-[8px] rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className="h-full transition-all" style={{ width: `${displayScore}%`, backgroundColor: getMatchColor(displayScore) }} />
                              </div>
                              <span className="font-['Arimo',sans-serif] text-[13px]" style={{ color: getMatchColor(displayScore) }}>{displayScore.toFixed(1)}%</span>
                              <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">CV Match</span>
                            </div>
                          )}
                          {/* LLM Reasoning badge (AI Sort = purple, JD Rank = green) */}
                          {reasoning && reasoning !== 'AI ranking unavailable — showing original order.' && reasoning !== 'JD ranking unavailable — showing original order.' && (
                            <p
                              className={`font-['Arimo',sans-serif] text-[10px] leading-snug max-w-[200px] ${isJdReason ? 'text-[#16a34a]' : 'text-[#6366f1]'}`}
                              title={reasoning}
                            >
                              {isJdReason ? '📋' : '🤖'} {reasoning.length > 60 ? reasoning.slice(0, 58) + '…' : reasoning}
                            </p>
                          )}
                          {/* Keyword Match Score badge */}
                          {candidate.keyword_match_score != null && candidate.keyword_match_score > 0 && (
                            <div className="flex items-center gap-1" title={`Keyword Match Score: ${candidate.keyword_match_score.toFixed(1)}%`}>
                              <span className="text-[10px]">🏷️</span>
                              <div className="w-[40px] h-[4px] rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className="h-full rounded-full bg-[#0d9488]" style={{ width: `${candidate.keyword_match_score}%` }} />
                              </div>
                              <span className="font-['Arimo',sans-serif] text-[10px] text-[#0d9488] font-medium">{candidate.keyword_match_score.toFixed(0)}%</span>
                            </div>
                          )}
                          {candidate.applicationId && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); openViewWhy(candidate); }} className="font-['Arimo',sans-serif] text-[10px] text-[#6366f1] hover:underline">
                              View why
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="w-10 h-10 border-4 border-[#e0e7ff] border-t-[#6366f1] rounded-full animate-spin mb-4" />
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Finding the best matches...
            </p>
          </div>
        ) : displayCandidates.length === 0 && (
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-12 text-center">
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              No candidates match your current filters
            </p>
          </div>
        )}
      </div>

      {/* Bottom Section - Sticky Footer */}
      <div className="bg-white border-t border-[#e5e7eb] px-8 py-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <label className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Group Name</label>
              {groupNameAiSuggested && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#eef2ff] to-[#f5f3ff] border border-[#a5b4fc] font-['Arimo',sans-serif] text-[10px] text-[#6366f1] font-medium">
                  <Sparkles size={9} /> AI suggested
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={groupName}
                onChange={(e) => { setGroupName(e.target.value); setGroupNameAiSuggested(false); }}
                placeholder="e.g., Senior Backend Engineers - Q1 2025"
                className={`w-full h-[44px] px-[16px] ${groupNameAiSuggested ? 'pr-[36px]' : ''} rounded-[8px] border font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all ${groupNameAiSuggested ? 'border-[#a5b4fc] bg-[#fafaff]' : 'border-[#e5e7eb]'}`}
              />
              {groupNameAiSuggested && (
                <button
                  type="button"
                  onClick={() => { setGroupName(''); setGroupNameAiSuggested(false); }}
                  title="Clear AI suggestion"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <div className="text-right">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Selected Candidates
              </div>
              <div className="text-[#111827]">
                {selectedCandidates.size}
              </div>
            </div>
            <button
              onClick={onCancel}
              className="h-[44px] px-[24px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedCandidates.size === 0 || isCreating}
              className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#d1d5db] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors flex items-center gap-2"
            >
              <Users size={16} />
              Create Group
              {isCreating && <div className="ml-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filter Drawer */}
      {showAdvancedFilters && (
        <AdvancedFilterDrawer
          onClose={() => setShowAdvancedFilters(false)}
          hidePostProcessFilters={true}
          onApply={(filters) => {
            setAdvancedFilters(filters);
            setShowAdvancedFilters(false);
            // Count active filters
            let count = 0;
            if (filters.fullName) count++;
            if (filters.email) count++;
            if (filters.location) count++;
            if (filters.school) count++;
            if (filters.company) count++;
            if (filters.techStack?.length > 0) count++;
            if (filters.seniority?.length > 0) count++;
            if (filters.degree?.length > 0) count++;
            setActiveFilterCount(count);
          }}
          activeFilters={advancedFilters}
        />
      )}

      {viewWhyOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-[760px] rounded-[12px] border border-[#e5e7eb] bg-white shadow-2xl">
            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
              <div>
                <h3 className="text-[#111827]">Why This Candidate Was Ranked</h3>
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  {viewWhyCandidate?.name || 'Candidate'}
                </p>
              </div>
              <button
                onClick={() => setViewWhyOpen(false)}
                className="h-[32px] w-[32px] rounded-[8px] hover:bg-[#f3f4f6]"
              >
                <X size={16} className="mx-auto text-[#6b7280]" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {viewWhyLoading ? (
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Loading score explanation...</p>
              ) : viewWhyError ? (
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#ef4444]">{viewWhyError}</p>
              ) : (
                <>
                  {(() => {
                    const candidate = viewWhyCandidate;
                    const baseScore = candidate ? (getAiBaseScore(candidate) ?? clampScore(Number(candidate.match || 0))) : 0;
                    const semanticQueryScore = (candidate && nlpQuery.trim()) ? getSemanticScore(candidate, nlpQuery) : 0;
                    const baseContribution = baseScore * 0.45;
                    const semanticContribution = semanticQueryScore * 0.55;
                    const finalAiScore = clampScore(baseContribution + semanticContribution);
                    const cvMatchScore = clampScore(Number(candidate?.match || viewWhyBreakdown?.match_score || 0));
                    const aiModeActive = Boolean(aiRankingEnabled && nlpQuery.trim());
                    const displayedScore = candidate ? getDisplayScore(candidate) : 0;

                    const backendSemantic = Number(viewWhyBreakdown?.semantic_fit_score ?? candidate?.semantic_fit_score ?? 0);
                    const backendSkillsExp = Number(viewWhyBreakdown?.skills_experience_score ?? candidate?.skills_experience_score ?? 0);
                    const backendJdQuality = Number(viewWhyBreakdown?.jd_quality_score ?? candidate?.jd_quality_score ?? 0);
                    const dims = candidate ? getMultiDimScore(candidate, nlpQuery) : null;
                    const llmReasoning = candidate ? aiSortReasoning[candidate.id] : null;

                    const semanticZeroReason = getZeroReason('semantic_fit_score', backendSemantic, viewWhyBreakdown);
                    const skillsExpZeroReason = getZeroReason('skills_experience_score', backendSkillsExp, viewWhyBreakdown);
                    const jdQualityZeroReason = getZeroReason('jd_quality_score', backendJdQuality, viewWhyBreakdown);

                    return (
                      <>
                  <div className={`rounded-[8px] border p-3 ${aiModeActive ? 'border-[#a5b4fc] bg-gradient-to-r from-[#eef2ff] to-[#f5f3ff]' : 'border-[#dbeafe] bg-[#eff6ff]'}`}>
                    <div className="flex items-center gap-2">
                      <Brain size={14} className={aiModeActive ? 'text-[#6366f1]' : 'text-[#1e3a8a]'} />
                      <p className={`font-['Arimo',sans-serif] text-[13px] font-semibold ${aiModeActive ? 'text-[#4f46e5]' : 'text-[#1e3a8a]'}`}>
                        {aiModeActive ? 'AI Rank ON — 4-Dimensional Scoring' : 'AI Rank OFF — CV Match Mode'}
                      </p>
                    </div>
                    {llmReasoning && llmReasoning !== 'AI ranking unavailable — showing original order.' && (
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1] mt-2 italic">🤖 {llmReasoning}</p>
                    )}
                  </div>

                  {/* 4-dim sub-score cards */}
                  {dims && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'CV Fit', value: dims.cvFit, color: '#6366f1', weight: '40%', desc: 'Pre-Score V2 or legacy CV match' },
                        { label: 'Semantic', value: dims.semantic, color: '#8b5cf6', weight: '30%', desc: 'Query relevance matching' },
                        { label: 'Exp Tier', value: dims.expTier, color: '#06b6d4', weight: '20%', desc: 'Years of experience tier' },
                        { label: 'Completeness', value: dims.completeness, color: '#10b981', weight: '10%', desc: 'Profile data richness' },
                      ].map(({ label, value, color, weight, desc }) => (
                        <div key={label} className="bg-[#f9fafb] rounded-[8px] p-3 border border-[#e5e7eb]">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">{label}</p>
                            <span className="font-['Arimo',sans-serif] text-[10px] text-[#9ca3af]">{weight}</span>
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[20px] font-bold" style={{ color }}>{value.toFixed(0)}</p>
                          <div className="w-full h-[4px] rounded-full bg-[#e5e7eb] mt-1.5">
                            <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
                          </div>
                          <p className="font-['Arimo',sans-serif] text-[10px] text-[#9ca3af] mt-1">{desc}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Composite score summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#f9fafb] rounded-[8px] p-3">
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Composite Score</p>
                      <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(displayedScore)}</p>
                    </div>
                    <div className="bg-[#f9fafb] rounded-[8px] p-3">
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">CV Match (Legacy)</p>
                      <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(cvMatchScore)}</p>
                    </div>
                    <div className="bg-[#f9fafb] rounded-[8px] p-3">
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Pre-Score V2</p>
                      <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">{formatScore(viewWhyBreakdown?.pre_score_final ?? viewWhyCandidate?.pre_score_final ?? 0)}</p>
                    </div>
                    <div className="bg-[#f9fafb] rounded-[8px] p-3">
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Semantic Match (Query)</p>
                      <p className="font-['Arimo',sans-serif] text-[18px] text-[#111827]">
                        {candidate && aiModeActive ? formatScore(semanticQueryScore) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {aiModeActive ? (
                    <div className="rounded-[8px] border border-[#dbeafe] bg-[#eff6ff] p-3">
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e3a8a] font-semibold mb-1">How AI Score Is Calculated</p>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af]">
                        AI Score = 0.45 × Base Score + 0.55 × Semantic Match
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] mt-1">
                        = 0.45 × {formatScore(baseScore)} + 0.55 × {formatScore(semanticQueryScore)}
                        = {formatScore(baseContribution)} + {formatScore(semanticContribution)}
                        = {formatScore(finalAiScore)}
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#1d4ed8] mt-2">
                        Base Score is Pre-Score V2 when present; otherwise CV Match fallback is used.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[8px] border border-[#dbeafe] bg-[#eff6ff] p-3">
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e3a8a] font-semibold mb-1">Why You See 92.0 Here</p>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af]">
                        AI Rank is currently OFF, so the table uses CV Match directly.
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#1e40af] mt-1">
                        Displayed Score = CV Match = {formatScore(cvMatchScore)}
                      </p>
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#1d4ed8] mt-2">
                        When AI Rank is ON, score becomes a weighted blend with query semantic match.
                      </p>
                    </div>
                  )}

                  <div className="rounded-[8px] border border-[#e5e7eb] bg-white p-3">
                    <p className="font-['Arimo',sans-serif] text-[13px] text-[#111827] font-semibold mb-2">Why Some Backend Components Are 0.0</p>
                    {!viewWhyBreakdown?.prescore_version && cvMatchScore > 0 && (
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-2">
                        This application has legacy CV Match data but no PreScore V2 payload; that is why CV Match can be high while PreScore components stay 0.0.
                      </p>
                    )}
                    <div className="space-y-2">
                      <div>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">Semantic Fit: {formatScore(backendSemantic)}</p>
                        {semanticZeroReason && <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{semanticZeroReason}</p>}
                      </div>
                      <div>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">Skills + Experience: {formatScore(backendSkillsExp)}</p>
                        {skillsExpZeroReason && <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{skillsExpZeroReason}</p>}
                      </div>
                      <div>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">JD Quality: {formatScore(backendJdQuality)}</p>
                        {jdQualityZeroReason && <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{jdQualityZeroReason}</p>}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(viewWhyBreakdown?.score_explanation) && viewWhyBreakdown!.score_explanation.length > 0 ? (
                    <div>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-2">Top Reasons</p>
                      <ul className="space-y-1">
                        {viewWhyBreakdown!.score_explanation.map((line, idx) => (
                          <li key={idx} className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">• {line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">No detailed explanation is available for this application yet.</p>
                  )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}