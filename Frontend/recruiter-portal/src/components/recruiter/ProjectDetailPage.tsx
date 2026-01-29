import { ArrowLeft, Users, Calendar, MapPin, DollarSign, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { useState, useEffect } from 'react';
import { api, Project } from '../../services/api';

interface ProjectDetailPageProps {
  projectTitle: string;
  onBack: () => void;
}

export function ProjectDetailPage({ projectTitle, onBack }: ProjectDetailPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setIsLoading(true);
        const projects = await api.recruiter.getProjects();
        const found = projects.find(p => p.projectName === projectTitle);
        setProject(found || null);
      } catch (error) {
        console.error("Failed to fetch project details", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProject();
  }, [projectTitle]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-12 py-8 text-center text-gray-500">
        Project not found.
        <Button variant="link" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="px-12 py-8">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          className="rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 flex items-center gap-2"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
          Back to Projects
        </Button>
      </div>

      {/* Project Title */}
      <div className="mb-8">
        <h1 className="text-gray-900 text-3xl mb-2">{projectTitle}</h1>
        <div className="flex items-center gap-6 text-gray-500 text-sm">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span>Posted {project.openDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} />
            <span>Remote / Hybrid</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} />
            <span>Full-time</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card className="p-6 bg-white rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Users size={24} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-2xl text-gray-900">{project.applicantsCount}</div>
              <div className="text-sm text-gray-500">Total Applicants</div>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl text-gray-900">{Math.floor(project.applicantsCount * 0.2)}</div>
              <div className="text-sm text-gray-500">Shortlisted</div>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock size={24} className="text-amber-600" />
            </div>
            <div>
              <div className="text-2xl text-gray-900">{Math.floor(project.applicantsCount * 0.4)}</div>
              <div className="text-sm text-gray-500">In Progress</div>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle size={24} className="text-red-600" />
            </div>
            <div>
              <div className="text-2xl text-gray-900">{Math.floor(project.applicantsCount * 0.05)}</div>
              <div className="text-sm text-gray-500">Needs Review</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Content Section */}
      <div className="grid grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Job Description */}
          <Card className="p-8 bg-white rounded-2xl shadow-sm">
            <h2 className="text-xl text-gray-900 mb-4">Job Description</h2>
            <div className="space-y-4 text-gray-600">
              <p>
                We are looking for talented individuals to join our team and work on exciting projects that will shape the future of our {projectTitle}. This role offers great opportunities for growth and development.
              </p>
              <p>
                The ideal candidate will have strong problem-solving skills, excellent communication abilities, and a passion for innovation. You will work closely with cross-functional teams to deliver high-quality results.
              </p>
            </div>
          </Card>

          {/* Requirements */}
          <Card className="p-8 bg-white rounded-2xl shadow-sm">
            <h2 className="text-xl text-gray-900 mb-4">Requirements</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Bachelor's degree in relevant field or equivalent experience</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>3+ years of professional experience in related role</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Strong analytical and problem-solving skills</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Excellent written and verbal communication skills</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Ability to work independently and as part of a team</span>
              </li>
            </ul>
          </Card>

          {/* Responsibilities */}
          <Card className="p-8 bg-white rounded-2xl shadow-sm">
            <h2 className="text-xl text-gray-900 mb-4">Key Responsibilities</h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                <span>Collaborate with team members to achieve project goals</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                <span>Participate in planning and strategy sessions</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                <span>Deliver high-quality work within established timelines</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0 mt-2" />
                <span>Continuously improve processes and methodologies</span>
              </li>
            </ul>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Open Roles */}
          <Card className="p-6 bg-white rounded-2xl shadow-sm">
            <h3 className="text-lg text-gray-900 mb-4">Open Roles</h3>
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-gray-900 mb-1">Senior Developer</div>
                <div className="text-sm text-gray-500">23 applicants</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-gray-900 mb-1">Junior Developer</div>
                <div className="text-sm text-gray-500">89 applicants</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-gray-900 mb-1">Team Lead</div>
                <div className="text-sm text-gray-500">12 applicants</div>
              </div>
            </div>
          </Card>

          {/* Compensation */}
          <Card className="p-6 bg-white rounded-2xl shadow-sm">
            <h3 className="text-lg text-gray-900 mb-4">Compensation</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <DollarSign size={24} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl text-gray-900">$80K - $120K</div>
                <div className="text-sm text-gray-500">per year</div>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Health Insurance</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>401(k) Matching</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Remote Work Options</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Professional Development</span>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-6">
              View All Applicants
            </Button>
            <Button variant="outline" className="w-full rounded-lg py-6 border-gray-300 text-gray-700 hover:bg-gray-50">
              Edit Project
            </Button>
            <Button variant="outline" className="w-full rounded-lg py-6 border-red-300 text-red-600 hover:bg-red-50">
              Close Project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
