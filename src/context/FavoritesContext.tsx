import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useAuth, getAuthHeaders } from './AuthContext';

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const GUEST_FAVORITES_KEY = 'aqkianda-favorites_guest';

const accountKeyFor = (email?: string) =>
  email ? `aqkianda-favorites_${email.toLowerCase()}` : GUEST_FAVORITES_KEY;

const readKey = (key: string): string[] => {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (e) {
    return [];
  }
};

const fetchServerFavorites = async (): Promise<string[] | null> => {
  try {
    const res = await fetch('/api/favorites', { headers: getAuthHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.listingIds) ? data.listingIds.map(String) : [];
  } catch (e) {
    return null;
  }
};

const pushServerFavorites = async (listingIds: string[]): Promise<void> => {
  try {
    await fetch('/api/favorites', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ listingIds }),
    });
  } catch (e) {
    // Offline: fica em localStorage e é reenviado no próximo carregamento
    console.debug('Sync de favoritos adiado:', e);
  }
};

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const accountKey = accountKeyFor(user?.email);

  const [favorites, setFavorites] = useState<string[]>(() => readKey(accountKey));

  const favoritesRef = useRef<string[]>(favorites);
  const dirtyRef = useRef(false);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  // Carrega da conta (servidor) e migra os favoritos de convidado no primeiro login
  useEffect(() => {
    let cancelled = false;
    dirtyRef.current = false;

    const load = async () => {
      const local = readKey(accountKey);
      const guest = user?.email ? readKey(GUEST_FAVORITES_KEY) : [];

      if (!user?.email) {
        if (!cancelled) setFavorites(local);
        return;
      }

      const server = await fetchServerFavorites();
      if (cancelled) return;

      if (server === null) {
        // Sem ligação ao servidor: usa o cache local da conta
        setFavorites(local);
        return;
      }

      // O utilizador alternou um favorito enquanto o load corria: não sobrepor
      if (dirtyRef.current) {
        const union = Array.from(new Set([...server, ...favoritesRef.current]));
        setFavorites(union);
        void pushServerFavorites(union);
        return;
      }

      const merged = Array.from(new Set([...server, ...local, ...guest]));
      setFavorites(merged);

      // Envia para a conta tudo o que existia só neste navegador (migração + offline)
      if (merged.length !== server.length) {
        void pushServerFavorites(merged);
      }
      if (guest.length > 0) {
        localStorage.removeItem(GUEST_FAVORITES_KEY);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.email, accountKey]);

  // Cache local da lista atual (conta ou convidado)
  useEffect(() => {
    try {
      localStorage.setItem(accountKey, JSON.stringify(favorites));
    } catch (e) {
      console.debug('Sem espaço para guardar favoritos localmente:', e);
    }
  }, [favorites, accountKey]);

  const toggleFavorite = (id: string) => {
    dirtyRef.current = true;

    const next = favorites.includes(id)
      ? favorites.filter((favId) => favId !== id)
      : [...favorites, id];

    setFavorites(next);

    if (user?.email) {
      void pushServerFavorites(next);
    }
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const contextValue = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite }),
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={contextValue}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within a FavoritesProvider');
  return context;
};
