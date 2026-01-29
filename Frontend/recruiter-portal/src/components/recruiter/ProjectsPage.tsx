import { Plus, Filter, ArrowUpDown, Search, Loader2 } from 'lucide-react';
import { ProjectCard } from '../common/ProjectCard';
import { ProjectDetailView } from './ProjectDetailView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ... existing imports ...

interface Project {
  id: number | string;
  title: string;
  roles: number;
  applicants: number | string;
  isOpen: boolean;
  description?: string;
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
  onViewProject: (projectTitle: string) => void;
  initialProjectTitle?: string;
  onBackToDashboard?: () => void;
  onCreateAssessment?: () => void;
  pendingAssessment?: any;
  onAssessmentConsumed?: () => void;
  onViewDashboard?: (projectTitle: string, positionTitle: string) => void;
  onViewGroup?: (groupId: string) => void;
  returnToGroupsTab?: boolean;
  initialPosition?: string; // Position to show when loading a project
  onPositionSelect?: (positionTitle: string) => void; // Callback when position changes
}

export function ProjectsPage({ onViewProject, initialProjectTitle, onBackToDashboard, onCreateAssessment, pendingAssessment, onAssessmentConsumed, onViewDashboard, onViewGroup, returnToGroupsTab = false, initialPosition = '', onPositionSelect }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const [activeProjects, closedProjects] = await Promise.all([
          api.recruiter.getProjects(),
          api.recruiter.getClosedProjects()
        ]);

        const mappedActive = activeProjects.map(p => ({
          id: p.id,
          title: p.projectName,
          roles: p.positionsCount,
          applicants: p.applicantsCount,
          isOpen: true,
          description: ''
        }));

        const mappedClosed = closedProjects.map(p => ({
          id: p.id,
          title: p.projectName,
          roles: p.positionsCount,
          applicants: p.totalCandidates,
          isOpen: false,
          description: ''
        }));

        setProjects([...mappedActive, ...mappedClosed]);
      } catch (error) {
        toast.error('Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  // Initialize viewingProject based on initialProjectTitle
  const initialProject = initialProjectTitle
    ? projects.find(p => p.title === initialProjectTitle) || null
    : null;

  const [viewingProject, setViewingProject] = useState<Project | null>(initialProject);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectIsOpen, setEditProjectIsOpen] = useState(false);

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

  const handleAddProject = () => {
    if (newProjectName.trim()) {
      const newProject: Project = {
        id: Date.now(),
        title: newProjectName,
        roles: 0,
        applicants: 0,
        isOpen: true,
        description: newProjectDescription
      };
      setProjects([...projects, newProject]);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsAddDialogOpen(false);
    }
  };

  const handleEditClick = (project: Project) => {
    setEditingProject(project);
    setEditProjectName(project.title);
    setEditProjectDescription(project.description || '');
    setEditProjectIsOpen(project.isOpen);
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = () => {
    if (editingProject && editProjectName.trim()) {
      setProjects(projects.map(p =>
        p.id === editingProject.id
          ? { ...p, title: editProjectName, description: editProjectDescription, isOpen: editProjectIsOpen }
          : p
      ));
      setIsEditDialogOpen(false);
      setEditingProject(null);
    }
  };

  const handleViewProject = (project: Project) => {
    setViewingProject(project);
  };

  const handleBackToProjects = () => {
    setViewingProject(null);
  };

  const handleBack = () => {
    // If we came from dashboard (initialProjectTitle is set and onBackToDashboard exists), go back to dashboard
    if (initialProjectTitle && onBackToDashboard) {
      onBackToDashboard();
    } else {
      // Otherwise, just go back to projects list
      setViewingProject(null);
    }
  };

  // If viewing a project, show the detail view
  if (viewingProject) {
    return (
      <ProjectDetailView
        projectTitle={viewingProject.title}
        projectDescription={viewingProject.description}
        onBack={handleBack}
        backLabel="Back"
        onCreateAssessment={onCreateAssessment || (() => { })}
        pendingAssessment={pendingAssessment}
        onAssessmentConsumed={onAssessmentConsumed}
        onViewDashboard={onViewDashboard}
        onViewGroup={onViewGroup}
        returnToGroupsTab={returnToGroupsTab}
        initialPosition={initialPosition}
        onPositionSelect={onPositionSelect}
      />
    );
  }

  return (
    <>
      <div className="h-full w-full">
        <div className="box-border content-stretch flex flex-col gap-[32px] items-start pb-0 pt-[32px] px-[32px]">
          {/* Header with Title and Toolbar */}
          <div className="content-stretch flex h-[42px] items-center justify-between w-full">
            {/* Projects Title */}
            <div className="h-[40px]">
              <p className="font-['Arimo',sans-serif] leading-[40px] text-[36px] text-black">
                Projects
              </p>
            </div>

            {/* Toolbar */}
            <div className="h-[42px] flex items-center gap-[16px] relative">
              {/* Add Button */}
              <button
                onClick={() => setIsAddDialogOpen(true)}
                className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center hover:bg-[#ede9ff] transition-colors"
              >
                <Plus size={20} className="text-black" strokeWidth={1.67} />
              </button>

              {/* Search Input */}
              <div className="relative w-[241.5px] h-[42px]">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-full bg-white rounded-[10px] border border-[#edf0f8] pl-[40px] pr-[16px] py-[8px] font-['Arimo',sans-serif] text-[16px] text-black placeholder:text-[#aaaaaa] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent"
                />
                <Search size={20} className="absolute left-[12px] top-[11px] text-[#aaaaaa]" strokeWidth={1.67} />
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
            {sortedProjects.length === 0 ? (
              <div className="w-full h-[200px] flex items-center justify-center">
                <p className="text-[#9ca3af] font-['Arimo',sans-serif] text-[16px]">
                  No projects found
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
                  showOpenBadge
                  onView={() => handleViewProject(project)}
                  onEdit={() => handleEditClick(project)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add New Project Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-['Arimo',sans-serif]">Add New Project</DialogTitle>
            <DialogDescription className="text-[14px] text-[#6b7280] font-['Arimo',sans-serif]">
              Enter the project name to create a new project.
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
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full h-[42px] bg-white rounded-[8px] border border-[#e5e7eb] px-[12px] py-[8px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-['Arimo',sans-serif] text-black">
                Project Description
              </label>
              <textarea
                placeholder="Enter project description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                rows={3}
                className="w-full bg-white rounded-[8px] border border-[#e5e7eb] px-[12px] py-[8px] font-['Arimo',sans-serif] text-[14px] text-black placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4834ab] focus:border-transparent resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewProjectName('');
                setNewProjectDescription('');
              }}
              className="text-[#6b7280] hover:bg-[#f3f4f6] font-['Arimo',sans-serif]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddProject}
              className="bg-[#4834ab] hover:bg-[#3d2b91] text-white font-['Arimo',sans-serif]"
            >
              Add Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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