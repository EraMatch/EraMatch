import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = "Loading...", 
  fullScreen = true,
  className = ""
}) => {
  const containerClasses = fullScreen 
    ? `fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm ${className}`
    : `flex flex-col items-center justify-center p-8 w-full h-full min-h-[200px] ${className}`;

  return (
    <div className={containerClasses}>
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-blue-600 blur-md"></div>
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin relative z-10" strokeWidth={1.5} />
      </div>
      
      {message && (
        <div className="mt-6 text-center">
          <p className="text-sm font-medium text-gray-700 animate-pulse tracking-wide">{message}</p>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
