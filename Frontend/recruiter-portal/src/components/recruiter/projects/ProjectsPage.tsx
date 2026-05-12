import { Plus, Filter, ArrowUpDown, Search, Loader2 } from 'lucide-react';
import { ProjectCard } from '../../common/ProjectCard';
import LoadingSpinner from '../../common/LoadingSpinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Checkbox } from '../../ui/checkbox';
import { Slider } from '../../ui/slider';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminProjectModal } from '../../admin/AdminProjectModal';
import { useProjects } from '../../../hooks/projects/useProjects';
import { usePositions } from '../../../hooks/positions/usePositions';
import { useCreateProject, useUpdateProject, useDeleteProject } from '../../../hooks/projects/useProjectMutations';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { api } from '../../../services/api';

interface Project {
  id: number | string;
  title: string;
  roles: number;
  applicants: number | string;
  isOpen: boolean;
  description?: string;
  status?: string;
}

type SortOption =
  | 'default'
  | 'a-z'
  | 'z-a'
  | 'opening-asc'
  | 'opening-desc'
  | 'closing-asc'
  | 'closing-desc'
  | 'applicants-asc'
  | 'applicants-desc'
  | 'roles-asc'
  | 'roles-desc';

interface ProjectsPageProps {
  onViewProject: (projectId: string | number) => void;
  onViewPosition?: (positionId: string | number) => void;
  onCreateAssessment?: () => void;
}

export function ProjectsPage({ onViewProject, onViewPosition, onCreateAssessment }: ProjectsPageProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const queryClient = useQueryClient();

  const { data: rawProjects = [], isLoading: projectsLoading, isError: projectsError } = useProjects();
  const { data: positions = [], isLoading: positionsLoading } = usePositions();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();

  const projects: Project[] = (rawProjects as any[]).map((p: any) => ({
    id: p.id,
    title: p.projectName,
    roles: p.positionsCount,
    applicants: p.applicantsCount,
    isOpen: p.status?.toLowerCase() === 'active',
    description: p.description || '',
    status: p.status,
  }));

  const isLoading = projectsLoading || positionsLoading;

  if (projectsError) toast.error('Failed to load projects');

  const fetchProjects = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
  };

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectIsOpen, setEditProjectIsOpen] = useState(false);

  const userStr = localStorage.getItem('user');
  const userObj = userStr ? JSON.parse(userStr) : null;
  const userRole = userObj?.role || 'recruiter';

  // Search, Filter, Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterIsOpen, setFilterIsOpen] = useState(true);
  const [filterIsClosed, setFilterIsClosed] = useState(true);
  const [filterApplicantsRange, setFilterApplicantsRange] = useState<number[]>([0, 1000]);
  const [filterRolesRange, setFilterRolesRange] = useState<number[]>([0, 100]);
  const [sortOption, setSortOption] = useState<SortOption>('default');

  // Helper function to parse applicants
  const parseApplicants = (applicants: number | string): number => {
    if (typeof applicants === 'number') return applicants;
    return parseInt(applicants) || 0;
  };

  // Filter projects
  const filteredProjects = projects.filter(project => {
    // Search filter
    if (searchQuery && !project.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Status filter
    if (!filterIsOpen && project.isOpen) return false;
    if (!filterIsClosed && !project.isOpen) return false;

    // Applicants filter
    const applicantsCount = parseApplicants(project.applicants);
    if (applicantsCount < filterApplicantsRange[0] || applicantsCount > filterApplicantsRange[1]) {
      return false;
    }

    // Roles filter
    if (project.roles < filterRolesRange[0] || project.roles > filterRolesRange[1]) {
      return false;
    }

    return true;
  });

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch (sortOption) {
      case 'default':
        // Open projects first
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;
        return 0;

      case 'a-z':
        return a.title.localeCompare(b.title);

      case 'z-a':
        return b.title.localeCompare(a.title);

      case 'opening-asc':
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;
        return 0;

      case 'opening-desc':
        if (!a.isOpen && b.isOpen) return -1;
        if (a.isOpen && !b.isOpen) return 1;
        return 0;

      case 'closing-asc':
        if (!a.isOpen && b.isOpen) return -1;
        if (a.isOpen && !b.isOpen) return 1;
        return 0;

      case 'closing-desc':
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;
        return 0;

      case 'applicants-asc':
        return parseApplicants(a.applicants) - parseApplicants(b.applicants);

      case 'applicants-desc':
        return parseApplicants(b.applicants) - parseApplicants(a.applicants);

      case 'roles-asc':
        return a.roles - b.roles;

      case 'roles-desc':
        return b.roles - a.roles;

      default:
        return 0;
    }
  });

  // Search Results for the "Jump to" dropdown
  const searchResults = searchQuery.length >= 2 ? [
    ...projects
      .filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(p => ({ id: p.id, title: p.title, type: 'project' as const })),
    ...positions
      .filter(p => p.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(p => ({ id: p.id, title: p.jobTitle, type: 'position' as const }))
  ].slice(0, 8) : [];

  const handleAddProject = () => {
    setEditingProject(null);
    setIsAddDialogOpen(true);
  };

  const handleEditClick = async (project: Project) => {
    try {
      const details = await queryClient.ensureQueryData({
        queryKey: queryKeys.projects.detail(String(project.id)),
        queryFn: () => api.recruiter.getProjectDetails(String(project.id)),
      }) as any;
      if (!details) return;

      setEditingProject(project);
      setEditProjectName(details.projectName);
      setEditProjectDescription(details.description || '');
      // Map 'active' status to boolean
      setEditProjectIsOpen(details.status?.toLowerCase() === 'active');
      setIsEditDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load project details');
    }
  };

  const handleSaveChanges = async () => {
    if (editingProject && editProjectName.trim()) {
      updateProjectMutation.mutate(
        {
          id: editingProject.id,
          data: {
            projectName: editProjectName,
            description: editProjectDescription,
            status: editProjectIsOpen ? 'active' : 'closed',
          },
        },
        {
          onSuccess: () => toast.success('Project updated successfully'),
          onError: () => toast.error('Failed to update project'),
        }
      );
      setIsEditDialogOpen(false);
      setEditingProject(null);
    }
  };

  const handleViewProject = (project: Project) => {
    onViewProject(project.id);
  };

  return (
    <>
      <div className="h-full w-full">
        <div className="box-border content-stretch flex flex-col gap-[32px] items-start pb-0 pt-[32px] px-[32px]">
          {/* Header with Title and Toolbar */}
          <div className="flex items-center justify-between w-full mb-6">
            {/* Projects Title */}
            <div>
              <h1 className="font-['Arimo',sans-serif] text-[32px] text-[#111827] mb-2">Projects</h1>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Manage your recruitment projects and assessments
              </p>
            </div>

            {/* Toolbar */}
            <div className="h-[42px] flex items-center gap-[16px] relative">
              {/* Add Button */}
              {userRole !== 'technical' && (
                <button
                  onClick={handleAddProject}
                  className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center hover:bg-[#ede9ff] transition-colors"
                >
                  <Plus size={20} className="text-black" strokeWidth={1.67} />
                </button>
              )}

              {/* Search Input with Jump to dropdown */}
              <div className="relative w-[241.5px] h-[42px]">
                <input
                  type="text"
                  placeholder="Search projects or positions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  className="w-full h-full bg-white rounded-[10px] border border-[#edf0f8] pl-[40px] pr-[16px] py-[8px] font-['Arimo',sans-serif] text-[16px] text-black placeholder:text-[#aaaaaa] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent"
                />
                <Search size={20} className="absolute left-[12px] top-[11px] text-[#aaaaaa]" strokeWidth={1.67} />
                
                {/* Search Results Dropdown */}
                {isSearchFocused && searchResults.length > 0 && (
                  <div className="absolute top-[48px] left-0 right-0 bg-white rounded-[10px] shadow-lg border border-[#edf0f8] z-50 overflow-hidden">
                    <div className="py-2">
                      <p className="px-4 py-1 text-[12px] font-bold text-[#9ca3af] uppercase tracking-wider">
                        Jump to
                      </p>
                      {searchResults.map((result) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          onClick={() => {
                            if (result.type === 'project') {
                              onViewProject(result.id);
                            } else if (onViewPosition) {
                              onViewPosition(result.id);
                            }
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-[#f3f4f6] flex flex-col transition-colors"
                        >
                          <span className="text-[14px] font-medium text-black">
                            {result.title}
                          </span>
                          <span className="text-[12px] text-[#6b7280] capitalize">
                            {result.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Button with Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center hover:bg-[#ede9ff] transition-colors">
                    <Filter size={20} className="text-black" strokeWidth={1.67} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[280px] bg-white p-4">
                  <div className="flex flex-col gap-4">
                    {/* Status Checkboxes */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="filter-open"
                        checked={filterIsOpen}
                        onCheckedChange={(checked: boolean | 'indeterminate') => setFilterIsOpen(checked === true)}
                        className="data-[state=checked]:bg-[#10b981] data-[state=checked]:border-[#10b981]"
                      />
                      <label htmlFor="filter-open" className="text-[14px] font-['Arimo',sans-serif] text-black cursor-pointer">
                        Is opened
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="filter-closed"
                        checked={filterIsClosed}
                        onCheckedChange={(checked: boolean | 'indeterminate') => setFilterIsClosed(checked === true)}
                        className="data-[state=checked]:bg-[#10b981] data-[state=checked]:border-[#10b981]"
                      />
                      <label htmlFor="filter-closed" className="text-[14px] font-['Arimo',sans-serif] text-black cursor-pointer">
                        Is closed
                      </label>
                    </div>

                    {/* Applicants Slider */}
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                          Applicants
                        </label>
                        <span className="text-[12px] font-['Arimo',sans-serif] text-[#6b7280]">
                          {filterApplicantsRange[0]}-{filterApplicantsRange[1]}
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={1000}
                        step={10}
                        value={filterApplicantsRange}
                        onValueChange={setFilterApplicantsRange}
                        className="w-full [&_[data-slot=slider-range]]:bg-[#10b981] [&_[data-slot=slider-thumb]]:border-[#10b981]"
                      />
                    </div>

                    {/* Roles Slider */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                          Roles
                        </label>
                        <span className="text-[12px] font-['Arimo',sans-serif] text-[#6b7280]">
                          {filterRolesRange[0]}-{filterRolesRange[1]}
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={filterRolesRange}
                        onValueChange={setFilterRolesRange}
                        className="w-full [&_[data-slot=slider-range]]:bg-[#10b981] [&_[data-slot=slider-thumb]]:border-[#10b981]"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Sort Button with Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center hover:bg-[#ede9ff] transition-colors">
                    <ArrowUpDown size={20} className="text-black" strokeWidth={1.67} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[220px] bg-white p-2">
                  <div className="flex flex-col gap-1">
                    {[
                      { value: 'default', label: 'Default' },
                      { value: 'a-z', label: 'A-Z' },
                      { value: 'z-a', label: 'Z-A' },
                      { value: 'opening-asc', label: 'Opening (Ascending)' },
                      { value: 'opening-desc', label: 'Opening (Descending)' },
                      { value: 'closing-asc', label: 'Closing (Ascending)' },
                      { value: 'closing-desc', label: 'Closing (Descending)' },
                      { value: 'applicants-asc', label: 'Applicants (Ascending)' },
                      { value: 'applicants-desc', label: 'Applicants (Descending)' },
                      { value: 'roles-asc', label: 'Roles (Ascending)' },
                      { value: 'roles-desc', label: 'Roles (Descending)' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSortOption(option.value as SortOption)}
                        className={`text-left px-3 py-2 rounded-md text-[14px] font-['Arimo',sans-serif] transition-colors ${sortOption === option.value
                          ? 'bg-[#ede9ff] text-[#4834ab]'
                          : 'text-black hover:bg-[#f3f4f6]'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Projects List */}
          <div className="content-stretch flex flex-col gap-[16px] items-start w-full">
            {isLoading ? (
              <LoadingSpinner message="Fetching your projects..." fullScreen={false} />
            ) : filteredProjects.length === 0 ? (
              <div className="w-full h-[200px] flex items-center justify-center">
                <p className="text-[#9ca3af] font-['Arimo',sans-serif] text-[16px]">
                  {searchQuery ? 'No projects match your search' : 'No projects found'}
                </p>
              </div>
            ) : (
              sortedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  title={project.title}
                  roles={project.roles}
                  applicants={project.applicants}
                  isOpen={project.isOpen}
                  status={project.status}
                  showOpenBadge
                  onView={() => handleViewProject(project)}
                  onEdit={() => handleEditClick(project)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Project Modal */}
      <AdminProjectModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={() => {
          fetchProjects();
          setIsAddDialogOpen(false);
        }}
        project={editingProject ? { id: editingProject.id, projectName: editingProject.title, description: editingProject.description } as any : undefined}
      />

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-['Arimo',sans-serif]">Edit Project</DialogTitle>
            <DialogDescription className="text-[14px] text-[#6b7280] font-['Arimo',sans-serif]">
              Update the project name and opening status.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                Project Name
              </label>
              <input
                type="text"
                placeholder="Enter project name"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
                className="w-full h-[42px] bg-white rounded-[8px] border border-[#e5e7eb] px-[12px] py-[8px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                Project Description
              </label>
              <textarea
                placeholder="Enter project description"
                value={editProjectDescription}
                onChange={(e) => setEditProjectDescription(e.target.value)}
                rows={3}
                className="w-full bg-white rounded-[8px] border border-[#e5e7eb] px-[12px] py-[8px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent resize-none"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                Currently Open
              </label>
              <Switch
                checked={editProjectIsOpen}
                onCheckedChange={setEditProjectIsOpen}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingProject(null);
              }}
              className="text-[#6b7280] hover:bg-[#f3f4f6] font-['Arimo',sans-serif]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveChanges}
              className="bg-[#4834ab] hover:bg-[#3d2b91] text-white font-['Arimo',sans-serif]"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}