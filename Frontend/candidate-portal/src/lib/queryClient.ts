import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
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
