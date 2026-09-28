import { describe, it, expect } from "vitest";
import { 
  getAppBaseUrl, 
  getAbsoluteUrl, 
  getRelativePath, 
  getListingUrl, 
  getListingPath, 
  getSellerUrl, 
  getSellerPath,
  getProfileUrl,
  getProfilePath,
  getCategoryUrl,
  getCategoryPath,
  getSearchUrl,
  getSearchPath,
  getWhatsAppShareUrl,
  getFacebookShareUrl,
  getTwitterShareUrl
} from "@/config/urls";

describe("Centralized URL Architecture", () => {
  it("generates correct base url", () => {
    const baseUrl = getAppBaseUrl();
    expect(baseUrl).toBeTruthy();
    expect(baseUrl.startsWith("http")).toBe(true);
    expect(baseUrl.endsWith("/")).toBe(false);
  });

  it("builds absolute urls correctly from relative paths", () => {
    const url = getAbsoluteUrl("/explorar");
    const baseUrl = getAppBaseUrl();
    expect(url).toBe(`${baseUrl}/explorar`);
  });

  it("handles query parameters in getAbsoluteUrl", () => {
    const url = getAbsoluteUrl("/explorar", { cat: "moda", sort: "recent" });
    expect(url).toContain("/explorar?cat=moda&sort=recent");
  });

  it("preserves already absolute URLs in getAbsoluteUrl", () => {
    const external = "https://example.com/external";
    expect(getAbsoluteUrl(external)).toBe(external);
  });

  it("builds correct listing path and listing absolute URL", () => {
    const path = getListingPath("123", "iPhone 13 Pro Max");
    expect(path).toBe("/anuncio/123/iphone-13-pro-max");

    const fullUrl = getListingUrl("123", "iPhone 13 Pro Max");
    const baseUrl = getAppBaseUrl();
    expect(fullUrl).toBe(`${baseUrl}/anuncio/123/iphone-13-pro-max`);
  });

  it("builds correct seller path and seller absolute URL", () => {
    const path = getSellerPath("João Silva");
    expect(path).toBe("/vendedor/Jo%C3%A3o%20Silva");

    const fullUrl = getSellerUrl("João Silva");
    const baseUrl = getAppBaseUrl();
    expect(fullUrl).toBe(`${baseUrl}/vendedor/Jo%C3%A3o%20Silva`);
  });

  it("builds correct category and search URLs", () => {
    const catPath = getCategoryPath("viaturas");
    expect(catPath).toBe("/explorar?cat=viaturas");

    const searchPath = getSearchPath("ténis");
    expect(searchPath).toBe("/explorar?q=t%C3%A9nis");
  });

  it("generates valid social share URLs", () => {
    const waUrl = getWhatsAppShareUrl("Confere este anúncio", "https://aqkianda.com/anuncio/1");
    expect(waUrl).toContain("https://api.whatsapp.com/send?text=");
    expect(waUrl).toContain(encodeURIComponent("Confere este anúncio\nhttps://aqkianda.com/anuncio/1"));

    const fbUrl = getFacebookShareUrl("https://aqkianda.com/anuncio/1");
    expect(fbUrl).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Faqkianda.com%2Fanuncio%2F1");
  });
});
