import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Listing, listings as originalListings } from "@/data/listings";
import { useAuth, getAuthHeaders } from "@/context/AuthContext";

interface RatingsContextType {
  userRatings: Record<string, number>; // listingId -> user star rating (1-5)
  rateListing: (listingId: string, rating: number) => void;
  getListingRating: (listingId: string) => { rating: number; totalCount: number; userRating?: number };
  getSellerRating: (sellerName: string) => { rating: number; totalCount: number };
  getUpdatedListings: () => Listing[];
  getUpdatedListing: (listing: Listing) => Listing;
}

const RatingsContext = createContext<RatingsContextType | undefined>(undefined);

const BASELINE_COUNT = 8; // Assumed number of original reviews to give realistic weight
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
  const syncedRef = useRef(false);
  const lastPushedRef = useRef<string>("");

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
  useEffect(() => {
    if (!user?.email || !syncedRef.current) return;

    const snapshot = JSON.stringify(userRatings);
    if (snapshot === lastPushedRef.current) return;

    lastPushedRef.current = snapshot;
    void pushServerRatings(userRatings);
  }, [userRatings, user?.email]);

  const rateListing = useCallback((listingId: string, rating: number) => {
    setUserRatings((prev) => ({
      ...prev,
      [listingId]: rating,
    }));
  }, []);

  const getListingRating = useCallback((listingId: string) => {
    const original = originalListings.find((l) => l.id === listingId);
    if (!original) return { rating: 0, totalCount: 0 };

    const userRating = userRatings[listingId];
    if (userRating !== undefined) {
      const calculated = parseFloat(
        (((original.rating * BASELINE_COUNT) + userRating) / (BASELINE_COUNT + 1)).toFixed(1)
      );
      return {
        rating: calculated,
        totalCount: BASELINE_COUNT + 1,
        userRating,
      };
    }

    return {
      rating: original.rating,
      totalCount: BASELINE_COUNT,
    };
  }, [userRatings]);

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

    if (sellerListings.length === 0) return { rating: 5.0, totalCount: 0 };

    const updatedSellerListings = sellerListings.map(l => getUpdatedListing(l));
    const sum = updatedSellerListings.reduce((acc, l) => acc + l.rating, 0);
    const avg = parseFloat((sum / updatedSellerListings.length).toFixed(1));

    const totalCount = updatedSellerListings.reduce((acc, l) => {
      const { totalCount: tc } = getListingRating(l.id);
      return acc + tc;
    }, 0);

    return {
      rating: avg,
      totalCount,
    };
  }, [getUpdatedListing, getListingRating]);

  const contextValue = useMemo(() => ({
    userRatings,
    rateListing,
    getListingRating,
    getSellerRating,
    getUpdatedListings,
    getUpdatedListing,
  }), [userRatings, rateListing, getListingRating, getSellerRating, getUpdatedListings, getUpdatedListing]);

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
