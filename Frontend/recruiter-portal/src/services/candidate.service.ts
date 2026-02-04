import { fetchAPI } from './client';

export const candidateService = {
    getHome: async () => fetchAPI('/candidate/home'),
    getAssessments: async () => fetchAPI('/candidate/assessments'),
    getProfile: async () => fetchAPI('/candidate/profile')
};
