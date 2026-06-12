import React from 'react';
import logo from '../../assets/image-eramatch.png';

interface LogoProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | number;
    alt?: string;
}

export function Logo({ className = '', size = 'md', alt = 'ERAMATCH' }: LogoProps) {
    const sizeClasses = {
        sm: 'h-8',   // 32px
        md: 'h-12',  // 48px
        lg: 'h-14',  // 56px
        xl: 'h-16',  // 64px
    };

    const heightClass = typeof size === 'string' ? sizeClasses[size] : '';
    const style = typeof size === 'number' ? { height: `${size}px` } : undefined;

    return (
        <div className={`flex items-center select-none ${className}`}>
            <img
                src={logo}
                alt={alt}
                className={`${heightClass} w-auto object-contain transition-opacity duration-200 hover:opacity-90`}
                style={style}
            />
        </div>
    );
}
