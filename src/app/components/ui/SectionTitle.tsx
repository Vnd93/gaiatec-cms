import React from 'react';
import { cn } from './Button';

interface SectionTitleProps {
  subtitle?: string;
  title: string;
  className?: string;
  align?: 'left' | 'center';
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  subtitle,
  title,
  className,
  align = 'center',
}) => {
  return (
    <div className={cn('mb-12', align === 'center' ? 'text-center' : 'text-left', className)}>
      {subtitle && (
        <span className="text-blue-600 font-semibold tracking-wider uppercase text-sm block mb-2">
          {subtitle}
        </span>
      )}
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
        {title}
      </h2>
      <div className={cn(
        "h-1 w-20 bg-orange-500 mt-4 rounded-full",
        align === 'center' ? 'mx-auto' : ''
      )} />
    </div>
  );
};