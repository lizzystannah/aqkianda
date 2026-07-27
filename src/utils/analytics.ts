// Aqkianda Real Analytics Manager (LocalStorage & Database sync ready)

export interface ListingAnalyticsData {
  views: number;
  clicks: number;
  contactClicks: number;
  whatsappClicks: number;
  shareClicks: number;
  lastViewedAt?: string;
}

export const getListingAnalyticsMap = (): Record<string, ListingAnalyticsData> => {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem("aqkianda-listing-analytics");
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Error reading analytics:", e);
  }
  return {};
};

export const saveListingAnalyticsMap = (data: Record<string, ListingAnalyticsData>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("aqkianda-listing-analytics", JSON.stringify(data));
  } catch (e) {
    console.error("Error saving analytics:", e);
  }
};

export const getListingStats = (listingId: string): ListingAnalyticsData => {
  const map = getListingAnalyticsMap();
  return map[listingId] || {
    views: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };
};

export const incrementListingViews = (listingId: string) => {
  if (!listingId || typeof window === "undefined") return;
  const map = getListingAnalyticsMap();
  const current = map[listingId] || {
    views: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };

  current.views += 1;
  current.lastViewedAt = new Date().toISOString();
  map[listingId] = current;
  saveListingAnalyticsMap(map);
};

export const incrementListingClick = (
  listingId: string, 
  clickType: "general" | "contact" | "whatsapp" | "share" = "general"
) => {
  if (!listingId || typeof window === "undefined") return;
  const map = getListingAnalyticsMap();
  const current = map[listingId] || {
    views: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };

  current.clicks += 1;
  if (clickType === "contact") current.contactClicks += 1;
  if (clickType === "whatsapp") current.whatsappClicks += 1;
  if (clickType === "share") current.shareClicks += 1;

  map[listingId] = current;
  saveListingAnalyticsMap(map);
};
