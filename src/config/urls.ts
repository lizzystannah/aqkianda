/**
 * Aqkianda Marketplace — Centralized URL & Domain Architecture
 * 
 * Centralized Base URL management. When moving from a VPS generic link
 * (e.g. APP_URL=https://link-generico-vps.com) to a production domain 
 * (e.g. APP_URL=https://meudominio.com), all absolute links, social shares, 
 * metadata (OG / Twitter cards), sitemaps, emails, and external redirects 
 * adapt automatically from this single source of truth.
 */

import { slugify } from "@/data/listings";

/**
 * Returns the normalized Base URL of the application.
 * Priority order:
 * 1. `import.meta.env.VITE_APP_URL` or `window.__APP_URL__` (configured via .env)
 * 2. `window.location.origin` in browser environment (automatic dynamic detection)
 * 3. Default fallback for SSR/build time
 */
export function getAppBaseUrl(): string {
  let url = "";

  // 1. Check Vite / client environment variable
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APP_URL) {
    url = String(import.meta.env.VITE_APP_URL).trim();
  }

  // 2. Check global window config if set
  if (!url && typeof window !== "undefined" && (window as unknown as { __APP_URL__?: string }).__APP_URL__) {
    url = String((window as unknown as { __APP_URL__?: string }).__APP_URL__).trim();
  }

  // 3. Fallback to current browser location origin
  if (!url && typeof window !== "undefined" && window.location && window.location.origin) {
    url = window.location.origin;
  }

  // 4. Default fallback if in isolated or SSR environment
  if (!url) {
    url = "https://aqkianda.com";
  }

  // Ensure protocol is present
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Strip trailing slashes
  return url.replace(/\/+$/, "");
}

/**
 * Alias for getAppBaseUrl()
 */
export const getAppUrl = getAppBaseUrl;

/**
 * Builds an absolute URL from any path and optional query parameters.
 * If the path is already an absolute URL (http:// or https://), it is preserved.
 *
 * @param path Relative path (e.g. "/anuncio/1") or absolute URL
 * @param queryParams Optional query parameters object
 */
export function getAbsoluteUrl(
  path: string = "",
  queryParams?: Record<string, string | number | boolean | null | undefined>
): string {
  let target = path || "/";

  // If already absolute, use it
  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    const baseUrl = getAppBaseUrl();
    const cleanPath = target.startsWith("/") ? target : `/${target}`;
    target = `${baseUrl}${cleanPath}`;
  }

  // Append query parameters if provided
  if (queryParams && Object.keys(queryParams).length > 0) {
    const urlObj = new URL(target);
    Object.entries(queryParams).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        urlObj.searchParams.set(key, String(val));
      }
    });
    return urlObj.toString();
  }

  return target;
}

/**
 * Builds a clean relative path ensuring a leading slash.
 */
export function getRelativePath(path: string = ""): string {
  if (!path) return "/";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const urlObj = new URL(path);
      return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch {
      return path;
    }
  }
  return path.startsWith("/") ? path : `/${path}`;
}

// ==============================================================
// INTERNAL NAVIGATION HELPERS (RELATIVE PATHS)
// Use these for <Link to={...}> or navigate(...)
// ==============================================================

export function getListingPath(id: string | number, title?: string): string {
  const cleanId = String(id).trim();
  if (title) {
    return `/anuncio/${cleanId}/${slugify(title)}`;
  }
  return `/anuncio/${cleanId}`;
}

export function getSellerPath(sellerName: string): string {
  return `/vendedor/${encodeURIComponent(sellerName.trim())}`;
}

export function getProfilePath(name?: string, tab?: string): string {
  const base = name ? `/perfil/${slugify(name)}` : "/perfil";
  if (tab && tab !== "anuncios") {
    return `${base}?tab=${encodeURIComponent(tab)}`;
  }
  return base;
}

export function getCategoryPath(categoryId: string): string {
  return `/explorar?cat=${encodeURIComponent(categoryId.trim())}`;
}

export function getSearchPath(query: string): string {
  return `/explorar?q=${encodeURIComponent(query.trim())}`;
}

export function getPublicarPath(): string {
  return "/publicar";
}

export function getFavoritosPath(): string {
  return "/favoritos";
}

export function getMensagensPath(): string {
  return "/mensagens";
}

// ==============================================================
// EXTERNAL / SHARE / METADATA HELPERS (ABSOLUTE URLS)
// Use these for Open Graph, Twitter cards, Social share buttons, emails, QR codes
// ==============================================================

export function getListingUrl(id: string | number, title?: string): string {
  return getAbsoluteUrl(getListingPath(id, title));
}

export function getSellerUrl(sellerName: string): string {
  return getAbsoluteUrl(getSellerPath(sellerName));
}

export function getProfileUrl(name?: string, tab?: string): string {
  return getAbsoluteUrl(getProfilePath(name, tab));
}

export function getCategoryUrl(categoryId: string): string {
  return getAbsoluteUrl(getCategoryPath(categoryId));
}

export function getSearchUrl(query: string): string {
  return getAbsoluteUrl(getSearchPath(query));
}

// ==============================================================
// SOCIAL SHARE HELPERS
// ==============================================================

export function getWhatsAppShareUrl(text: string, url?: string): string {
  const fullText = url ? `${text}\n${url}` : text;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(fullText)}`;
}

export function getFacebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function getTwitterShareUrl(text: string, url?: string): string {
  const cleanUrl = url ? `&url=${encodeURIComponent(url)}` : "";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}${cleanUrl}`;
}

export function getTelegramShareUrl(text: string, url?: string): string {
  const cleanUrl = url ? `&url=${encodeURIComponent(url)}` : "";
  return `https://t.me/share/url?text=${encodeURIComponent(text)}${cleanUrl}`;
}

export function getEmailShareUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Universal clipboard copy helper with fallback for iFrames and environments
 * where navigator.clipboard might be restricted or unavailable.
 */
export async function copyUrlToClipboard(url: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (err) {
    console.debug("navigator.clipboard error, falling back to execCommand:", err);
  }

  // Fallback for older browsers or restricted permissions
  try {
    if (typeof document !== "undefined") {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error("Failed to copy URL to clipboard:", err);
  }

  return false;
}
