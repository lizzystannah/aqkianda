import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordPlatformVisit } from "@/utils/analytics";
import { useAuth } from "@/context/AuthContext";

const TrafficTracker = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    
    // Track the platform visit (differentiating new/anonymous vs registered/logged-in traffic)
    recordPlatformVisit(isAuthenticated, ref);
  }, [location.pathname, isAuthenticated]);

  return null;
};

export default TrafficTracker;
