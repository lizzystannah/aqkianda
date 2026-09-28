import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  const getStorageKey = () => {
    return user?.email 
      ? `aqkianda-favorites_${user.email.toLowerCase()}` 
      : 'aqkianda-favorites_guest';
  };

  const [favorites, setFavorites] = useState<string[]>([]);

  // Reload favorites whenever user changes
  useEffect(() => {
    const key = getStorageKey();
    try {
      const saved = localStorage.getItem(key);
      setFavorites(saved ? JSON.parse(saved) : []);
    } catch (e) {
      setFavorites([]);
    }
  }, [user?.email]);

  // Save favorites whenever favorites state changes
  useEffect(() => {
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(favorites));
  }, [favorites, user?.email]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(favId => favId !== id) : [...prev, id]
    );
  };

  const isFavorite = (id: string) => favorites.includes(id);

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within a FavoritesProvider');
  return context;
};
