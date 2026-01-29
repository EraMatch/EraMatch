import { ArrowDown, ArrowUp } from 'lucide-react';

interface StatCardProps {
  value: string | number;
  title: string;
  subtitle: string;
  trend?: 'up' | 'down';
  hasLink?: boolean;
  onCheckClick?: () => void;
}

export function StatCard({ value, title, subtitle, trend, hasLink, onCheckClick }: StatCardProps) {
  return (
    <div className="bg-[#fefefe] rounded-[16px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] relative">
      <div className="flex flex-col justify-center size-full">
        <div className="box-border content-stretch flex flex-col items-start justify-center pl-[32px] pr-0 py-0 relative size-full min-h-[172px]">
          <div className="content-stretch flex gap-[16px] h-[60px] items-center relative w-full pr-[32px]">
            <div className="h-[60px] flex items-center gap-[8px]">
              {/* Value */}
              <div className="h-[60px] flex items-center">
                <p className="font-['Arimo',sans-serif] leading-[60px] text-[60px] text-black">{value}</p>
              </div>
              
              {/* Trend Icon */}
              {trend && (
                <div className="h-[48px] w-[48px] flex items-center justify-center">
                  {trend === 'down' ? (
                    <ArrowDown size={48} className="text-[#C63434]" strokeWidth={2.5} />
                  ) : (
                    <ArrowUp size={48} className="text-[#18BA84]" strokeWidth={2.5} />
                  )}
                </div>
              )}
            </div>
            
            {/* Title and Subtitle Container */}
            <div className="flex-1 content-stretch flex flex-col gap-[4px] h-[55px] items-start">
              <div className="h-[27px]">
                <p className="font-['Arimo',sans-serif] leading-[27px] text-[18px] text-black">{title}</p>
              </div>
              {subtitle && (
                <div className="h-[24px]">
                  <p className="font-['Arimo',sans-serif] leading-[24px] text-[#aaaaaa] text-[16px]">{subtitle}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Check Link */}
          {hasLink && (
            <div className="absolute right-[32px] bottom-[32px]">
              <button 
                className="font-['Arimo',sans-serif] leading-[24px] text-[#9f9f9f] text-[16px] hover:text-[#7f7f7f] transition-colors"
                onClick={onCheckClick}
              >
                Check &gt;&gt;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}