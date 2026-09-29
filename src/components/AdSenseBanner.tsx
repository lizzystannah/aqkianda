import React, { useEffect, useState } from "react";

interface AdSenseBannerProps {
  slotId?: string;
  format?: "auto" | "fluid" | "rectangle" | "horizontal";
  responsive?: boolean;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export const AdSenseBanner: React.FC<AdSenseBannerProps> = ({
  slotId = "1234567890",
  format = "auto",
  responsive = true,
  className = ""
}) => {
  const [adClient, setAdClient] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("aqkianda-adsense-client-id") ||
      import.meta.env.VITE_ADSENSE_CLIENT_ID ||
      ""
    ).trim();
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("aqkianda-adsense-client-id") || import.meta.env.VITE_ADSENSE_CLIENT_ID || "";
      setAdClient(saved.trim());
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("aqkianda-adsense-updated", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("aqkianda-adsense-updated", handleStorageChange);
    };
  }, []);

  const isValidAdSense = adClient.startsWith("ca-pub-") && adClient.length > 10;

  useEffect(() => {
    if (isValidAdSense) {
      // Inject Google AdSense Script if not present
      const scriptId = "google-adsense-script";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`;
        script.async = true;
        script.crossOrigin = "anonymous";
        document.head.appendChild(script);
      }

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        console.debug("AdSense push error:", err);
      }
    }
  }, [isValidAdSense, adClient]);

  if (!isValidAdSense) {
    // When AdSense is not configured, render nothing so the UI is completely clean without placeholder boxes
    return null;
  }

  return (
    <div className={`my-6 overflow-hidden text-center ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={adClient}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
};

export default AdSenseBanner;
