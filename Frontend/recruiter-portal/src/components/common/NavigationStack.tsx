import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavigationStackContextType {
  /** Navigate forward, pushing the current path onto the stack */
  navigateWithStack: (path: string) => void;
  /** Pop the stack and navigate to the previous path. Falls back to /recruiter/projects if stack is empty */
  goBack: (fallback?: string) => void;
  /** Peek at where "Back" would navigate (null if stack is empty) */
  backPath: string | null;
}

const NavigationStackContext = createContext<NavigationStackContextType | null>(null);

const DEFAULT_FALLBACK = '/recruiter/projects';

export function NavigationStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const navigateWithStack = useCallback((path: string) => {
    // Push current location onto the stack before navigating
    setStack(prev => [...prev, location.pathname + location.search]);
    navigate(path);
  }, [navigate, location]);

  const goBack = useCallback((fallback?: string) => {
    setStack(prev => {
      if (prev.length === 0) {
        // Stack empty — use fallback
        navigate(fallback || DEFAULT_FALLBACK);
        return prev;
      }
      const newStack = [...prev];
      const previousPath = newStack.pop()!;
      navigate(previousPath);
      return newStack;
    });
  }, [navigate]);

  const backPath = stack.length > 0 ? stack[stack.length - 1] : null;

  return (
    <NavigationStackContext.Provider value={{ navigateWithStack, goBack, backPath }}>
      {children}
    </NavigationStackContext.Provider>
  );
}

export function useNavigationStack() {
  const context = useContext(NavigationStackContext);
  if (!context) {
    throw new Error('useNavigationStack must be used within a NavigationStackProvider');
  }
  return context;
}
