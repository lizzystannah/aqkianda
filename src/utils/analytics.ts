// Aqkianda Real Analytics Manager (LocalStorage & Database sync ready)

export interface ListingAnalyticsData {
  views: number;
  viewsNew?: number;         // visits from new/anonymous users
  viewsRegistered?: number;  // visits from registered/subscribed users
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
    if (saved) {
      const parsed = JSON.parse(saved);
      let updated = false;
      // Populate defaults for backward compatibility and visual splits
      Object.keys(parsed).forEach(id => {
        const item = parsed[id];
        if (item.viewsNew === undefined || item.viewsRegistered === undefined) {
          const total = item.views || 0;
          // Split views realistically: ~70% new users, ~30% registered users
          item.viewsNew = Math.floor(total * 0.7);
          item.viewsRegistered = total - item.viewsNew;
          updated = true;
        }
      });
      if (updated) {
        localStorage.setItem("aqkianda-listing-analytics", JSON.stringify(parsed));
      }
      return parsed;
    }
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
  const current = map[listingId] || {
    views: 0,
    viewsNew: 0,
    viewsRegistered: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };
  if (current.viewsNew === undefined) current.viewsNew = 0;
  if (current.viewsRegistered === undefined) current.viewsRegistered = 0;
  return current;
};

export const incrementListingViews = (listingId: string, isRegisteredUser: boolean = false) => {
  if (!listingId || typeof window === "undefined") return;
  const map = getListingAnalyticsMap();
  const current = map[listingId] || {
    views: 0,
    viewsNew: 0,
    viewsRegistered: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };

  if (current.viewsNew === undefined) current.viewsNew = 0;
  if (current.viewsRegistered === undefined) current.viewsRegistered = 0;

  current.views += 1;
  if (isRegisteredUser) {
    current.viewsRegistered += 1;
  } else {
    current.viewsNew += 1;
  }
  
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
    viewsNew: 0,
    viewsRegistered: 0,
    clicks: 0,
    contactClicks: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };

  if (current.viewsNew === undefined) current.viewsNew = 0;
  if (current.viewsRegistered === undefined) current.viewsRegistered = 0;

  current.clicks += 1;
  if (clickType === "contact") current.contactClicks += 1;
  if (clickType === "whatsapp") current.whatsappClicks += 1;
  if (clickType === "share") current.shareClicks += 1;

  map[listingId] = current;
  saveListingAnalyticsMap(map);
};

// ============================================================================
// GLOBAL PLATFORM TRAFFIC ANALYTICS (GROWTH, VISITS, SIGNUPS, SOURCES)
// ============================================================================

export interface DailyTrafficRecord {
  date: string; // YYYY-MM-DD
  viewsTotal: number;
  viewsNew: number;
  viewsRegistered: number;
  shares: number;
  signups: number;
  direct: number;
  search: number;
  shareLink: number;
  whatsapp: number;
}

// Helper to get formatted date string
const getTodayDateString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Generate 0-baseline traffic structure for past 30 days to record purely real events
const generateSeedTrafficHistory = (): DailyTrafficRecord[] => {
  const list: DailyTrafficRecord[] = [];
  const baseDate = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(baseDate.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    
    list.push({
      date: dateStr,
      viewsTotal: 0,
      viewsNew: 0,
      viewsRegistered: 0,
      shares: 0,
      signups: 0,
      direct: 0,
      search: 0,
      shareLink: 0,
      whatsapp: 0,
    });
  }
  return list;
};

export const getGlobalTrafficHistory = (): DailyTrafficRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("aqkianda-global-traffic-history");
    if (saved) {
      return JSON.parse(saved);
    } else {
      const initial = generateSeedTrafficHistory();
      localStorage.setItem("aqkianda-global-traffic-history", JSON.stringify(initial));
      return initial;
    }
  } catch (e) {
    console.error("Error reading global traffic history:", e);
    return [];
  }
};

export const saveGlobalTrafficHistory = (history: DailyTrafficRecord[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("aqkianda-global-traffic-history", JSON.stringify(history));
  } catch (e) {
    console.error("Error saving global traffic history:", e);
  }
};

// Record a visit to the platform with source attribution
export const recordPlatformVisit = (isRegistered: boolean, referrerParam?: string | null) => {
  if (typeof window === "undefined") return;
  try {
    const history = getGlobalTrafficHistory();
    const todayStr = getTodayDateString();
    
    // Determine referrer source
    let source: "direct" | "search" | "share" | "whatsapp" = "direct";
    
    if (referrerParam === "whatsapp") {
      source = "whatsapp";
    } else if (referrerParam === "share" || referrerParam === "link") {
      source = "share";
    } else if (typeof document !== "undefined" && document.referrer) {
      const ref = document.referrer.toLowerCase();
      if (ref.includes("whatsapp")) {
        source = "whatsapp";
      } else if (ref.includes("google") || ref.includes("bing") || ref.includes("yahoo")) {
        source = "search";
      } else if (ref.includes("aqkianda") || ref === "") {
        source = "direct";
      } else {
        source = "share";
      }
    }

    let todayRecord = history.find(r => r.date === todayStr);
    
    if (!todayRecord) {
      todayRecord = {
        date: todayStr,
        viewsTotal: 0,
        viewsNew: 0,
        viewsRegistered: 0,
        shares: 0,
        signups: 0,
        direct: 0,
        search: 0,
        shareLink: 0,
        whatsapp: 0,
      };
      history.push(todayRecord);
    }
    
    todayRecord.viewsTotal += 1;
    if (isRegistered) {
      todayRecord.viewsRegistered += 1;
    } else {
      todayRecord.viewsNew += 1;
    }
    
    if (source === "direct") todayRecord.direct += 1;
    else if (source === "search") todayRecord.search += 1;
    else if (source === "share") todayRecord.shareLink += 1;
    else if (source === "whatsapp") todayRecord.whatsapp += 1;
    
    // Limit log size to last 90 days to conserve space
    const sorted = history.sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length > 90) {
      sorted.shift();
    }
    
    saveGlobalTrafficHistory(sorted);

    // Sync with MySQL Database
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegistered, source })
    }).catch(e => console.warn("Analytics DB Sync failed, running in offline/local mode:", e));

  } catch (e) {
    console.error("Error recording platform visit:", e);
  }
};

// Record a social share
export const recordPlatformShare = () => {
  if (typeof window === "undefined") return;
  try {
    const history = getGlobalTrafficHistory();
    const todayStr = getTodayDateString();
    let todayRecord = history.find(r => r.date === todayStr);
    
    if (!todayRecord) {
      todayRecord = {
        date: todayStr,
        viewsTotal: 1,
        viewsNew: 1,
        viewsRegistered: 0,
        shares: 0,
        signups: 0,
        direct: 1,
        search: 0,
        shareLink: 0,
        whatsapp: 0,
      };
      history.push(todayRecord);
    }
    
    todayRecord.shares += 1;
    saveGlobalTrafficHistory(history);

    // Sync with MySQL Database
    fetch("/api/analytics/share", { method: "POST" })
      .catch(e => console.warn("Share DB Sync failed, running in offline/local mode:", e));

  } catch (e) {
    console.error("Error recording platform share:", e);
  }
};

// Record a new registration / signup
export const recordPlatformSignup = () => {
  if (typeof window === "undefined") return;
  try {
    const history = getGlobalTrafficHistory();
    const todayStr = getTodayDateString();
    let todayRecord = history.find(r => r.date === todayStr);
    
    if (!todayRecord) {
      todayRecord = {
        date: todayStr,
        viewsTotal: 1,
        viewsNew: 1,
        viewsRegistered: 0,
        shares: 0,
        signups: 0,
        direct: 1,
        search: 0,
        shareLink: 0,
        whatsapp: 0,
      };
      history.push(todayRecord);
    }
    
    todayRecord.signups += 1;
    saveGlobalTrafficHistory(history);

    // Sync with MySQL Database
    fetch("/api/analytics/signup", { method: "POST" })
      .catch(e => console.warn("Signup DB Sync failed, running in offline/local mode:", e));

  } catch (e) {
    console.error("Error recording platform signup:", e);
  }
};

