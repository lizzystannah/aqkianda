import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, MapPin, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { Listing, formatPrice, slugify } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const ListingCard = ({ listing, index = 0 }: { listing: Listing; index?: number }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(listing.id);
  const [isLandscape, setIsLandscape] = useState(false);
  const [clicks, setClicks] = useState<number>(0);

  useEffect(() => {
    const getClicks = () => {
      try {
        const storedClicks = JSON.parse(localStorage.getItem("aqkianda-listing-clicks") || "{}");
        setClicks(storedClicks[listing.id] || 0);
      } catch (e) {
        console.error(e);
      }
    };
    getClicks();
    window.addEventListener("storage", getClicks);
    return () => window.removeEventListener("storage", getClicks);
  }, [listing.id]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > naturalHeight) {
      setIsLandscape(true);
    }
  };

  // Helper to generate Vinted-like brand & size/specs depending on category
  const getBrandAndSize = (id: string, categoryId: string, condition: string) => {
    const specsMap: Record<string, string> = {
      "1": "Apple • 256GB",
      "2": "Toyota • 4x4",
      "3": "Imobiliário • T3",
      "4": "Zara • M / 38",
      "5": "Móvel • 3 Lugares",
      "6": "Shimano • 21 Vel",
      "9": "Samsung • 256GB",
      "10": "Honda • Automático",
      "11": "Mesa • 6 Lugares",
      "12": "FitShop • 20kg",
    };
    if (specsMap[id]) return specsMap[id];
    
    const categoryNames: Record<string, string> = {
      moda: "Moda • M",
      eletronica: "Tecnologia • Excelente",
      viaturas: "Viatura • Usado",
      imoveis: "Imóvel • T2",
      moveis: "Casa • Decoração",
      desporto: "Artigo • Desporto",
      empregos: "Carreira • Profissional",
      servicos: "Serviço • Certificado",
    };
    return categoryNames[categoryId] || `${condition === "novo" ? "Novo" : "Usado"} • Excelente`;
  };

  const sellerUsername = listing.seller.toLowerCase().replace(/\s+/g, "_");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Link 
        to={`/anuncio/${listing.id}/${slugify(listing.title)}`} 
        className="group block bg-card rounded-lg overflow-hidden border border-border/40 hover:shadow-md hover:border-primary/20 dark:hover:border-primary/30 transition-all duration-300"
      >
        {/* Top Seller Bar — sem avaliação: a avaliação só aparece na página do anúncio */}
        <div className="flex items-center px-3 py-2 border-b border-border/30 bg-card">
          <div className="flex items-center gap-1.5 truncate">
            <div className="w-5.5 h-5.5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[9px] shrink-0 border border-primary/20">
              {listing.seller.slice(0, 1).toUpperCase()}
            </div>
            <span className="font-semibold truncate text-foreground/80 group-hover:text-primary text-[11px] transition-colors">
              {sellerUsername}
            </span>
          </div>
        </div>

        {/* Product Image Frame (Vinted 3:4 aspect ratio) */}
        <div className="relative aspect-[3/4] overflow-hidden bg-muted flex items-center justify-center">
          {isLandscape && (
            <>
              {/* Blurred listing image copy to fill frame edges with matching colours */}
              <div 
                className="absolute inset-0 bg-cover bg-center blur-md opacity-70 pointer-events-none scale-110"
                style={{ backgroundImage: `url(${listing.image})` }}
              />
              {/* Adaptive gradient overlay (light and dark mode) */}
              <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-card/95 pointer-events-none" />
            </>
          )}
          <img
            src={listing.image}
            alt={listing.title}
            loading="lazy"
            onLoad={handleImageLoad}
            className={`w-full h-full transition-all duration-500 ${
              isLandscape 
                ? "object-contain relative z-10 group-hover:scale-102" 
                : "object-cover group-hover:scale-105"
            }`}
          />
          <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
            {listing.featured && (
              <span className="bg-gold text-secondary text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                ★ Destaque
              </span>
            )}
            <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm ${
              listing.condition === "novo" ? "bg-accent text-accent-foreground" : "bg-secondary/90 text-secondary-foreground"
            }`}>
              {listing.condition}
            </span>
            {listing.promoDiscount && (
              <span className="bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded shadow-sm animate-pulse">
                -{listing.promoDiscount}%
              </span>
            )}
          </div>
          
          <button
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              toggleFavorite(listing.id); 
            }}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/85 backdrop-blur flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-10 shadow-sm"
            aria-label="Adicionar aos favoritos"
          >
            <Heart className={`h-3.5 w-3.5 transition-colors ${fav ? "fill-primary text-primary" : "text-muted-foreground/80 hover:text-primary"}`} />
          </button>
        </div>

        {/* Details block */}
        <div className="p-3 flex flex-col justify-between h-[105px]">
          <div>
            {/* Bold Price */}
            {listing.promoDiscount && listing.promoPrice ? (
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-sm sm:text-base text-red-600">
                  {formatPrice(listing.promoPrice, listing.currency)}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground line-through opacity-75">
                  {formatPrice(listing.price, listing.currency)}
                </span>
              </div>
            ) : (
              <div className="font-display font-bold text-sm sm:text-base text-foreground">
                {formatPrice(listing.price, listing.currency)}
              </div>
            )}

            {/* Brand/Specs label styled like Vinted */}
            <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">
              {getBrandAndSize(listing.id, listing.categoryId, listing.condition)}
            </div>

            {/* Title in light font weight */}
            <h3 className="text-xs text-foreground/85 line-clamp-1 mt-1 font-normal group-hover:text-primary transition-colors">
              {listing.title}
            </h3>
          </div>

          {/* Bottom metadata row */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/20 pt-1.5 mt-2 gap-1">
            <span className="flex items-center gap-1 truncate max-w-[42%]">
              <MapPin className="h-3 w-3 shrink-0" /> {listing.location.split(",")[1] || listing.location}
            </span>
            <span className="text-[10px] opacity-80 font-normal shrink-0 flex items-center gap-0.5" title={`${clicks} visualizações`}>
              <Eye className="h-3 w-3 opacity-75 shrink-0" /> {clicks}
            </span>
            <span className="text-[10px] opacity-80 font-normal shrink-0">
              {listing.postedAt || "Hoje"}
            </span>
            <span className="flex items-center gap-0.5 font-bold text-foreground/80 shrink-0">
              <Heart className={`h-3 w-3 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              <span>{fav ? "1" : "0"}</span>
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default ListingCard;
