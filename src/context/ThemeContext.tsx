import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  activeTemplate: string;
  setActiveTemplate: (template: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('aqkianda-theme');
    if (saved) return saved === 'dark';
    return false; // Default to Light Mode on first visit
  });

  const [activeTemplate, setActiveTemplateState] = useState(() => {
    return localStorage.getItem('aqkianda-template') || 'classic';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('aqkianda-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const setActiveTemplate = (template: string) => {
    setActiveTemplateState(template);
    localStorage.setItem('aqkianda-template', template);
  };

  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, activeTemplate, setActiveTemplate }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
