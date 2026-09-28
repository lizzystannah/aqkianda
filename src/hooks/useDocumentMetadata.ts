import { useEffect } from "react";
import { getAbsoluteUrl } from "@/config/urls";

export interface MetadataOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

const DEFAULT_TITLE = "Aqkianda — Marketplace angolano para comprar e vender";
const DEFAULT_DESCRIPTION = "Aqkianda é o marketplace angolano onde compras e vendes produtos novos e usados: eletrónica, viaturas, moda, casa e mais.";

export function useDocumentMetadata(options: MetadataOptions) {
  useEffect(() => {
    // 1. Update document title
    const finalTitle = options.title ? `${options.title} | Aqkianda` : DEFAULT_TITLE;
    document.title = finalTitle;

    // Helper function to update or create meta tags
    const updateMetaTag = (attribute: string, attrValue: string, content: string | undefined) => {
      if (!content) return;
      let element = document.querySelector(`meta[${attribute}="${attrValue}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    // Helper function to update or create link elements (e.g. canonical)
    const updateLinkTag = (rel: string, href: string | undefined) => {
      if (!href) return;
      let element = document.querySelector(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.setAttribute("rel", rel);
        document.head.appendChild(element);
      }
      element.setAttribute("href", href);
    };

    // 2. Standard Meta Tags
    updateMetaTag("name", "description", options.description || DEFAULT_DESCRIPTION);

    // 3. Open Graph (Facebook / Social Media) Meta Tags
    updateMetaTag("property", "og:title", finalTitle);
    updateMetaTag("property", "og:description", options.description || DEFAULT_DESCRIPTION);
    updateMetaTag("property", "og:type", options.type || "website");
    
    if (options.image) {
      const finalImage = getAbsoluteUrl(options.image);
      updateMetaTag("property", "og:image", finalImage);
      updateMetaTag("name", "twitter:image", finalImage);
    }
    
    // Resolve absolute canonical & OG url via centralized URL architecture
    const pathOrUrl = options.url || (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
    const currentUrl = getAbsoluteUrl(pathOrUrl);

    updateMetaTag("property", "og:url", currentUrl);
    updateLinkTag("canonical", currentUrl);

    // 4. Twitter Card Meta Tags
    updateMetaTag("name", "twitter:card", "summary_large_image");
    updateMetaTag("name", "twitter:title", finalTitle);
    updateMetaTag("name", "twitter:description", options.description || DEFAULT_DESCRIPTION);
  }, [options.title, options.description, options.image, options.url, options.type]);
}
