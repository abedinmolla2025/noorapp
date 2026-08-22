import React from 'react';

export type PremiumIconName = 'home' | 'quran' | 'hadith' | 'calendar' | 'support' | 'settings' | 'dua' | 'quiz' | 'prayer-times' | 'names' | 'baby' | 'qibla' | 'about' | 'contact' | 'privacy' | 'terms' | 'sources' | 'sitemap';

interface PremiumIconProps {
  name: PremiumIconName;
  className?: string;
  active?: boolean;
}

const PremiumIcon: React.FC<PremiumIconProps> = ({ name, className = "w-6 h-6", active = false }) => {
  const iconPath = `/assets/nav-icons/premium-${name}.svg`;
  
  return (
    <div 
      className={`relative flex items-center justify-center transition-all duration-300 ${active ? 'filter drop-shadow-[0_0_8px_rgba(16,185,129,0.4)] scale-110' : 'grayscale-[0.4] opacity-80 scale-100'} ${className}`}
    >
      <img 
        src={iconPath} 
        alt={`${name} icon`} 
        className="w-full h-full object-contain"
      />
      {active && (
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse -z-10" />
      )}
    </div>
  );
};

export default PremiumIcon;
