import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AdminProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    project?: any; // If provided, we are in Edit mode
}

export function AdminProjectModal({ isOpen, onClose, onSuccess, project }: AdminProjectModalProps) {
    const [projectName, setProjectName] = useState('');
    const [description, setDescription] = useState('');
    const [targetHireCount, setTargetHireCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setProjectName(project.projectName || project.name || '');
            setDescription(project.description || '');
            setTargetHireCount(project.targetHireCount || project.target_hire_count || 0);
        } else {
            setProjectName('');
            setDescription('');
            setTargetHireCount(0);
        }
    }, [project, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const payload = {
                name: projectName,
                description,
                target_hire_count: targetHireCount
            };

            if (project) {
                await api.recruiter.updateProject(project.id || project.project_id, payload);
                toast.success('Project updated successfully');
            } else {
                await api.recruiter.createProject(payload);
                toast.success('Project created successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(project ? 'Failed to update project' : 'Failed to create project');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-white rounded-3xl p-6">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">
                        {project ? 'Edit Project' : 'Create New Project'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="projectName">Project Name</Label>
                        <Input
                            id="projectName"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="e.g. Q1 Expansion"
                            required
                            className="rounded-xl"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Project goals and details..."
                            className="rounded-xl resize-none h-24"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="targetHireCount">Target Hires</Label>
                        <Input
                            id="targetHireCount"
                            type="number"
                            min="0"
                            value={targetHireCount}
                            onChange={(e) => setTargetHireCount(parseInt(e.target.value) || 0)}
                            className="rounded-xl"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {project ? 'Save Changes' : 'Create Project'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
