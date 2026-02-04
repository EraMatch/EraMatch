// Import all services
import { authService } from './auth.service';
import { candidateService } from './candidate.service';

// Main API object - aggregates all services
export const api = {
    auth: authService,
    candidate: candidateService
};
