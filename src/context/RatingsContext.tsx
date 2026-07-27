import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Listing, listings as originalListings } from "@/data/listings";

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

export const RatingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userRatings, setUserRatings] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem("aqkianda-user-ratings");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("aqkianda-user-ratings", JSON.stringify(userRatings));
  }, [userRatings]);

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
