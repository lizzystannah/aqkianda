import { useState, useEffect } from "react";

export type Listing = {
  id: string;
  title: string;
  price: number;
  currency: string;
  condition: "novo" | "usado";
  location: string;
  image: string;
  images?: string[];
  featured: boolean;
  rating: number;
  categoryId: string;
  description: string;
  postedAt: string;
  seller: string;
  phone: string;
  sellerEmail?: string;
  sellerId?: string;
  tags?: string[];
  promoEventId?: string;
  promoDiscount?: number;
  promoPrice?: number;
};

export type Category = {
  slug: string;
  name: string;
  icon: string;
};

export const formatPrice = (price: number, currency: string = "AOA") => {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: currency || 'AOA' }).format(price);
};

// ==============================================================
// SEARCH NORMALIZATION UTILITIES
// ==============================================================
export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove all accents: ténis -> tenis, calçado -> calcado, electrónica -> electronica, móveis -> moveis
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesListingSearch(listing: Listing, query: string): boolean {
  if (!query || !query.trim()) return true;

  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery.split(" ").filter((t) => t.length > 0);
  if (queryTokens.length === 0) return true;

  const tagsText = Array.isArray(listing.tags)
    ? listing.tags.join(" ")
    : typeof listing.tags === "string"
    ? listing.tags
    : "";

  const categoryObj = categories.find(c => c.slug === listing.categoryId);
  const categoryName = categoryObj ? categoryObj.name : "";

  const corpus = normalizeSearchText(
    `${listing.title} ${listing.description} ${tagsText} ${listing.categoryId} ${categoryName} ${listing.location} ${listing.condition} ${listing.seller}`
  );

  // Direct phrase match
  if (corpus.includes(normalizedQuery)) return true;

  // Multi-token match
  return queryTokens.every((token) => {
    if (corpus.includes(token)) return true;

    // Plural to singular (e.g. sapatilhas -> sapatilha, carros -> carro, computadores -> computador, tenis -> teni)
    if (token.endsWith("s") && token.length > 3 && corpus.includes(token.slice(0, -1))) {
      return true;
    }
    if (token.endsWith("es") && token.length > 4 && corpus.includes(token.slice(0, -2))) {
      return true;
    }
    if (token.endsWith("is") && token.length > 4 && corpus.includes(token.slice(0, -2) + "l")) {
      return true;
    }
    // Singular to plural (e.g. token: sapatilha, corpus: sapatilhas)
    if (corpus.includes(token + "s") || corpus.includes(token + "es")) {
      return true;
    }
    return false;
  });
}

export const categories: Category[] = [
  { slug: "eletronica", name: "Electrónica", icon: "Smartphone" },
  { slug: "viaturas", name: "Viaturas", icon: "Car" },
  { slug: "imoveis", name: "Imóveis", icon: "Home" },
  { slug: "moda", name: "Moda", icon: "Shirt" },
  { slug: "moveis", name: "Móveis", icon: "Sofa" },
  { slug: "desporto", name: "Desporto", icon: "Dumbbell" },
  { slug: "empregos", name: "Empregos", icon: "Briefcase" },
  { slug: "servicos", name: "Serviços", icon: "Wrench" }
];

export const getCategories = (): Category[] => {
  if (typeof window === "undefined") return categories;
  const saved = localStorage.getItem("aqkianda-categories");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error("Error reading categories:", e);
    }
  }
  return categories;
};

export const saveCategories = (newCategories: Category[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("aqkianda-categories", JSON.stringify(newCategories));
};

export const listings: Listing[] = [
  {
    id: "1",
    title: "iPhone 13 Pro Max 256GB",
    price: 650000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Talatona",
    image: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.8,
    categoryId: "eletronica",
    description: "iPhone 13 Pro Max em excelente estado, com 256GB de memória. Bateria a 100%. Inclui caixa e acessórios originais.",
    postedAt: "Há 2 horas",
    seller: "João Manuel",
    phone: "923 111 222",
    sellerEmail: "joao.manuel@exemplo.ao",
    tags: ["telemovel", "celular", "smartphone", "apple", "ios", "iphone", "telefone"]
  },
  {
    id: "2",
    title: "Toyota Hilux 2020 4x4",
    price: 18500000,
    currency: "AOA",
    condition: "usado",
    location: "Benguela, Lobito",
    image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.9,
    categoryId: "viaturas",
    description: "Toyota Hilux 2020, tração 4x4, motor a diesel. Apenas 45.000km rodados. Manutenções sempre em dia na marca.",
    postedAt: "Há 5 horas",
    seller: "Kalandula Motors",
    phone: "912 333 444",
    sellerEmail: "kalandula@motors.ao",
    tags: ["carro", "carrinha", "pickup", "pick up", "4x4", "diesel", "toyota", "viatura", "automovel"]
  },
  {
    id: "3",
    title: "Apartamento T3 Kilamba",
    price: 35000000,
    currency: "AOA",
    condition: "usado",
    location: "Luanda, Kilamba",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.5,
    categoryId: "imoveis",
    description: "Apartamento T3 no Kilamba, Bloco W. Cozinha equipada, quartos com roupeiros e sala ampla. Pronto a habitar.",
    postedAt: "Ontem",
    seller: "Imobiliária Futuro",
    phone: "931 555 666",
    sellerEmail: "geral@imobiliariafuturo.ao",
    tags: ["casa", "apartamento", "imovel", "moradia", "residencia", "t3", "arrendamento", "venda"]
  },
  {
    id: "4",
    title: "Ténis Nike Air Max",
    price: 45000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Maianga",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.7,
    categoryId: "moda",
    description: "Ténis Nike Air Max novos, nunca usados. Disponíveis em vários tamanhos. Entrega imediata em Luanda.",
    postedAt: "Há 1 dia",
    seller: "Fashion Store",
    phone: "945 777 888",
    sellerEmail: "vendas@fashionstore.ao",
    tags: ["tenis", "sapatilha", "sapatilhas", "calcado", "calcados", "sapato", "nike", "air max", "moda", "desporto"]
  },
  {
    id: "5",
    title: "Sofá L em Couro Sintético",
    price: 380000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Viana",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.6,
    categoryId: "moveis",
    description: "Sofá em L de couro sintético, cor cinza escuro. 3 lugares + chaise longue. Almofadas incluídas. Entrega ao domicílio em Luanda.",
    postedAt: "Há 3 horas",
    seller: "MóveisPlus",
    phone: "928 999 000",
    sellerEmail: "atendimento@moveisplus.ao",
    tags: ["sofa", "mobilia", "sala", "moveis", "decoracao", "couro", "casa"]
  },
  {
    id: "6",
    title: "Bicicleta de Montanha Shimano",
    price: 120000,
    currency: "AOA",
    condition: "usado",
    location: "Huambo, Cidade",
    image: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.3,
    categoryId: "desporto",
    description: "Bicicleta de montanha com câmbio Shimano 21 velocidades. Quadro em alumínio, pneus novos. Ideal para trilhos e cidade.",
    postedAt: "Há 6 horas",
    seller: "Pedro Esportes",
    phone: "991 222 333",
    sellerEmail: "pedro@esportes.ao",
    tags: ["bike", "bicicleta", "ciclismo", "desporto", "shimano", "trilha"]
  },
  {
    id: "7",
    title: "Vaga: Programador Full-Stack",
    price: 0,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Ingombota",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 5.0,
    categoryId: "empregos",
    description: "Empresa de tecnologia em Luanda procura programador full-stack com experiência em React e Node.js. Regime híbrido, salário competitivo.",
    postedAt: "Hoje",
    seller: "TechAngola",
    phone: "922 444 555",
    sellerEmail: "rh@techangola.ao",
    tags: ["emprego", "trabalho", "vaga", "ti", "software", "programador", "developer", "react", "nodejs"]
  },
  {
    id: "8",
    title: "Electricista Certificado 24h",
    price: 15000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Cacuaco",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.9,
    categoryId: "servicos",
    description: "Serviço de electricista certificado, disponível 24 horas. Instalações, reparações e manutenções. Orçamento gratuito.",
    postedAt: "Há 4 horas",
    seller: "ElectroServiços",
    phone: "933 666 777",
    sellerEmail: "contacto@electroservicos.ao",
    tags: ["eletricista", "electricista", "servico", "reparacao", "instalacao", "urgencia", "manutencao"]
  },
  {
    id: "9",
    title: "Samsung Galaxy S23 Ultra",
    price: 580000,
    currency: "AOA",
    condition: "usado",
    location: "Luanda, Morro Bento",
    image: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.6,
    categoryId: "eletronica",
    description: "Samsung Galaxy S23 Ultra 256GB, em perfeito estado. Câmara 200MP, S Pen incluída. Sem riscos.",
    postedAt: "Há 8 horas",
    seller: "Ana Correia",
    phone: "927 444 333",
    tags: ["telemovel", "celular", "smartphone", "samsung", "galaxy", "android", "s23"]
  },
  {
    id: "10",
    title: "Honda Civic 2019 Automático",
    price: 12000000,
    currency: "AOA",
    condition: "usado",
    location: "Luanda, Talatona",
    image: "https://images.unsplash.com/photo-1606611013016-969c19ba27d5?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.7,
    categoryId: "viaturas",
    description: "Honda Civic 2019, caixa automática, 60.000 km. Interior em couro, câmara traseira, sensores de estacionamento.",
    postedAt: "Há 12 horas",
    seller: "AutoLuanda",
    phone: "921 555 777",
    tags: ["carro", "viatura", "automovel", "honda", "civic", "automatico"]
  },
  {
    id: "11",
    title: "Mesa de Jantar 6 Lugares",
    price: 250000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Benfica",
    image: "https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.4,
    categoryId: "moveis",
    description: "Mesa de jantar em madeira maciça com 6 cadeiras estofadas. Acabamento premium. Montagem incluída.",
    postedAt: "Há 1 dia",
    seller: "Casa & Design",
    phone: "935 222 444",
    tags: ["mesa", "cadeiras", "jantar", "madeira", "mobilia", "moveis", "casa"]
  },
  {
    id: "12",
    title: "Kit Halteres 20kg Ajustáveis",
    price: 35000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Maianga",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.8,
    categoryId: "desporto",
    description: "Kit de halteres ajustáveis até 20kg cada. Material emborrachado, ideal para treino em casa. Novos na caixa.",
    postedAt: "Há 2 dias",
    seller: "FitShop Angola",
    phone: "948 111 999",
    tags: ["pesos", "musculacao", "fitness", "halteres", "treino", "ginasio", "desporto"]
  }
];

// Apply dynamic getter to listings to allow Admin Pinning (afixar) and filter out removed listings on load
export const fetchListingsFromApi = async (): Promise<Listing[]> => {
  if (typeof window === "undefined" || !window.location || !window.location.origin) return listings;
  try {
    const res = await fetch("/api/listings");
    if (res.ok) {
      const serverListings: Listing[] = await res.json();
      if (Array.isArray(serverListings) && serverListings.length > 0) {
        // Merge with local pinned/promo mappings
        const removedIds = JSON.parse(localStorage.getItem("aqkianda-removed-ids") || "[]");
        const promoMappingsStr = localStorage.getItem("aqkianda-promotional-mappings");
        const promoMappings = promoMappingsStr ? JSON.parse(promoMappingsStr) : {};

        const activeList = serverListings.filter(l => !removedIds.includes(l.id)).map(l => {
          if (promoMappings[l.id]) {
            l.promoEventId = promoMappings[l.id].promoEventId;
            l.promoDiscount = promoMappings[l.id].promoDiscount;
            l.promoPrice = promoMappings[l.id].promoPrice;
          }
          return l;
        });

        listings.length = 0;
        listings.push(...activeList);

        window.dispatchEvent(new Event("aqkianda-listings-updated"));
        return listings;
      }
    }
  } catch (e) {
    console.debug("Backend listings sync fallback to local store:", e);
  }
  return listings;
};

// Hook: devolve um contador que incrementa sempre que a lista de anúncios
// é atualizada (servidor, outra aba ou novo anúncio). Usar como dependência
// de useMemo/useEffect para a página redesenhar sem refresh manual.
export function useListingsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("aqkianda-listings-updated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("aqkianda-listings-updated", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return version;
}

// Polling automático: volta a buscar o catálogo ao servidor de X em X segundos
// e sempre que a aba volta a ficar visível / com foco. Assim um anúncio
// publicado por outra pessoa aparece sem refresh manual.
let autoRefreshStarted = false;
export function startListingsAutoRefresh(intervalMs: number = 30000): void {
  if (typeof window === "undefined" || autoRefreshStarted) return;
  autoRefreshStarted = true;

  let inFlight = false;
  const refresh = async () => {
    if (inFlight || document.hidden) return;
    inFlight = true;
    try {
      await fetchListingsFromApi();
    } finally {
      inFlight = false;
    }
  };

  window.setInterval(refresh, intervalMs);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}

if (typeof window !== "undefined") {
  try {
    // 1. Load any custom listings created by users
    const customListingsStr = localStorage.getItem("aqkianda-custom-listings");
    if (customListingsStr) {
      const customListings: Listing[] = JSON.parse(customListingsStr);
      customListings.forEach(cl => {
        if (!listings.some(l => l.id === cl.id)) {
          listings.push(cl);
        }
      });
    }

    // 2. Filter out removed listings
    const removedIds = JSON.parse(localStorage.getItem("aqkianda-removed-ids") || "[]");
    if (removedIds.length > 0) {
      const activeList = listings.filter(l => !removedIds.includes(l.id));
      listings.length = 0;
      listings.push(...activeList);
    }

    // 3. Apply promotional mappings (event discounts)
    const promoMappingsStr = localStorage.getItem("aqkianda-promotional-mappings");
    if (promoMappingsStr) {
      const promoMappings = JSON.parse(promoMappingsStr);
      listings.forEach(l => {
        if (promoMappings[l.id]) {
          l.promoEventId = promoMappings[l.id].promoEventId;
          l.promoDiscount = promoMappings[l.id].promoDiscount;
          l.promoPrice = promoMappings[l.id].promoPrice;
        }
      });
    }

    // 4. Initial server fetch
    fetchListingsFromApi();
    // 5. Auto-refresh: polling + foco/visibilidade (sem refresh manual)
    startListingsAutoRefresh(30000);
  } catch (err) {
    console.error("Error filtering or loading listings:", err);
  }

  listings.forEach((l) => {
    const originalFeatured = l.featured;
    Object.defineProperty(l, "featured", {
      get() {
        try {
          const pinned = JSON.parse(localStorage.getItem("aqkianda-pinned-ids") || "[]");
          return pinned.includes(this.id) || originalFeatured;
        } catch (e) {
          return originalFeatured;
        }
      },
      configurable: true,
      enumerable: true
    });
  });
}

export const slugify = (text: string): string => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};


