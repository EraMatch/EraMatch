import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: (failureCount, error) => {
                if (error instanceof Error && error.message === 'Unauthorized') return false;
                return failureCount < 1;
            },
            retryDelay: 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: 'always',
        },
        mutations: {
            retry: false,
        },
    },
});
