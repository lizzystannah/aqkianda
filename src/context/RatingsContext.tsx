import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Listing, listings as originalListings } from "@/data/listings";
import { useAuth, getAuthHeaders } from "@/context/AuthContext";

interface RatingsContextType {
  userRatings: Record<string, number>; // listingId -> user star rating (1-5)
  rateListing: (listingId: string, rating: number) => void;
  refreshSummaries: () => void;
  getListingRating: (listingId: string) => { rating: number; totalCount: number; userRating?: number };
  getSellerRating: (sellerName: string) => { rating: number | null; totalCount: number };
  getUpdatedListings: () => Listing[];
  getUpdatedListing: (listing: Listing) => Listing;
}

const RatingsContext = createContext<RatingsContextType | undefined>(undefined);

interface RatingSummary {
  avg: number;
  count: number;
}

const RATINGS_STORAGE_KEY = "aqkianda-user-ratings";

const readLocalRatings = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem(RATINGS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
};

const fetchServerRatings = async (): Promise<Record<string, number> | null> => {
  try {
    const res = await fetch("/api/ratings", { headers: getAuthHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ratings && typeof data.ratings === "object" ? data.ratings : {};
  } catch (e) {
    return null;
  }
};

const pushServerRatings = async (ratings: Record<string, number>): Promise<void> => {
  try {
    await fetch("/api/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ratings }),
    });
  } catch (e) {
    // Offline: fica no cache local e é reenviado no próximo carregamento
    console.debug("Sync de avaliações adiado:", e);
  }
};

export const RatingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [userRatings, setUserRatings] = useState<Record<string, number>>(readLocalRatings);
  // Agregado real de TODOS os utilizadores (média + nº de votos por anúncio)
  const [summaries, setSummaries] = useState<Record<string, RatingSummary>>({});
  const syncedRef = useRef(false);
  const lastPushedRef = useRef<string>("");

  const refreshSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/ratings/summary");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.summary && typeof data.summary === "object") {
        setSummaries(data.summary);
      }
    } catch {
      // Offline: mantém o último agregado conhecido
    }
  }, []);

  // Carrega o agregado real no arranque e quando o catálogo muda
  useEffect(() => {
    void refreshSummaries();
    window.addEventListener("aqkianda-listings-updated", refreshSummaries);
    return () => window.removeEventListener("aqkianda-listings-updated", refreshSummaries);
  }, [refreshSummaries]);

  useEffect(() => {
    try {
      localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(userRatings));
    } catch (e) {
      console.debug('Sem espaço para guardar avaliações localmente:', e);
    }
  }, [userRatings]);

  // Primeira sincronização com a conta: traz as avaliações do servidor
  useEffect(() => {
    syncedRef.current = false;

    if (!user?.email) return;
    let cancelled = false;

    const sync = async () => {
      const server = await fetchServerRatings();
      if (cancelled) return;
      if (server === null) return; // offline: tenta na próxima abertura

      const local = readLocalRatings();
      const merged = { ...server, ...local };

      const isSame =
        Object.keys(merged).length === Object.keys(server).length &&
        Object.keys(merged).every((key) => Number(merged[key]) === Number(server[key]));

      lastPushedRef.current = JSON.stringify(server);
      setUserRatings(isSame ? server : merged);
      syncedRef.current = true;

      if (!isSame) {
        void pushServerRatings(merged);
        lastPushedRef.current = JSON.stringify(merged);
      }
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // Envia alterações locais para a conta (após a primeira sincronização)
  // e recarrega o agregado para o voto contar para toda a gente
  useEffect(() => {
    if (!user?.email || !syncedRef.current) return;

    const snapshot = JSON.stringify(userRatings);
    if (snapshot === lastPushedRef.current) return;

    lastPushedRef.current = snapshot;
    void pushServerRatings(userRatings).then(() => refreshSummaries());
  }, [userRatings, user?.email, refreshSummaries]);

  const rateListing = useCallback((listingId: string, rating: number) => {
    setUserRatings((prev) => ({
      ...prev,
      [listingId]: rating,
    }));
  }, []);

  const getListingRating = useCallback((listingId: string) => {
    const summary = summaries[listingId];
    const userRating = userRatings[listingId];

    // 1. Agregado real de todos os utilizadores (inclui o meu voto após sincronizar)
    if (summary && summary.count > 0) {
      return {
        rating: summary.avg,
        totalCount: summary.count,
        userRating,
      };
    }

    // 2. Só o meu voto local (ainda não sincronizado): conta como 1 voto real
    if (userRating !== undefined) {
      return {
        rating: userRating,
        totalCount: 1,
        userRating,
      };
    }

    // 3. Zero votos reais: sem estrelas, sem contagem inventada
    return {
      rating: 0,
      totalCount: 0,
    };
  }, [userRatings, summaries]);

  const getUpdatedListing = useCallback((listing: Listing): Listing => {
    const { rating } = getListingRating(listing.id);
    return {
      ...listing,
      rating,
    };
  }, [getListingRating]);

  const getUpdatedListings = useCallback((): Listing[] => {
    return originalListings.map((l) => getUpdatedListing(l));
  }, [getUpdatedListing]);

  const getSellerRating = useCallback((sellerName: string) => {
    const sellerListings = originalListings.filter(
      (l) => l.seller.toLowerCase() === sellerName.toLowerCase()
    );

    // Média ponderada pelos votos reais nos anúncios do vendedor.
    // Sem nenhum voto real: null (vendedor novo, sem estrelas à nascença).
    let weightedSum = 0;
    let totalVotes = 0;
    for (const l of sellerListings) {
      const s = getListingRating(l.id);
      weightedSum += s.rating * s.totalCount;
      totalVotes += s.totalCount;
    }

    if (totalVotes === 0) return { rating: null as number | null, totalCount: 0 };

    return {
      rating: Math.round((weightedSum / totalVotes) * 10) / 10,
      totalCount: totalVotes,
    };
  }, [getListingRating]);

  const contextValue = useMemo(() => ({
    userRatings,
    rateListing,
    refreshSummaries,
    getListingRating,
    getSellerRating,
    getUpdatedListings,
    getUpdatedListing,
  }), [userRatings, rateListing, refreshSummaries, getListingRating, getSellerRating, getUpdatedListings, getUpdatedListing]);

  return (
    <RatingsContext.Provider value={contextValue}>
      {children}
    </RatingsContext.Provider>
  );
};

export const useRatings = () => {
  const context = useContext(RatingsContext);
  if (!context) {
    throw new Error("useRatings must be used within a RatingsProvider");
  }
  return context;
};
