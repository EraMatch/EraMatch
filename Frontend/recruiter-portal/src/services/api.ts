// Re-export types for backward compatibility
export * from './types';

// Import all services
import { authService } from './auth.service';
import { adminService } from './admin.service';
import { recruiterService } from './recruiter.service';
import { candidateService } from './candidate.service';

// Main API object - aggregates all services
export const api = {
    auth: authService,
    admin: adminService,
    recruiter: recruiterService,
    candidate: candidateService
};
