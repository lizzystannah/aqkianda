import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { listings, formatPrice, Listing, categories, slugify } from "@/data/listings";
import { incrementListingViews, incrementListingClick, getListingStats } from "@/utils/analytics";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { 
  Heart, MapPin, Star, Share2, MessageCircle, Phone, ShieldCheck, 
  ArrowLeft, Check, ChevronLeft, ChevronRight, AlertTriangle, 
  AlertCircle, Eye, Calendar, Tag, ShieldAlert, Award
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/hooks/use-toast";
import { useRatings } from "@/context/RatingsContext";
import { useAuth } from "@/context/AuthContext";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

// Helper to retrieve custom multiple images for the listing gallery based on category to look highly realistic
const getListingImages = (listing: Listing) => {
  const base = listing.image;
  const categoryImages: Record<string, string[]> = {
    eletronica: [
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1523206489230-c012cdd4cc96?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80"
    ],
    viaturas: [
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80"
    ],
    imoveis: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"
    ],
    moda: [
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80"
    ],
    moveis: [
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80"
    ],
    desporto: [
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80"
    ],
    empregos: [
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
    ],
    servicos: [
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80"
    ]
  };

  const cats = categoryImages[listing.categoryId] || categoryImages["eletronica"];
  return [base, ...cats];
};

interface PriceCardProps {
  listing: Listing;
  fav: boolean;
  toggleFavorite: (id: string) => void;
  showPhone: boolean;
  setShowPhone: (show: boolean) => void;
  handleShare: () => void;
  isShared: boolean;
  nav: (path: string, state?: unknown) => void;
  clicks: number;
}

// Re-designed Sticky Price and Detail Sidebar matching Vinted.pt aesthetic exactly
const PriceCard = ({
  listing,
  fav,
  toggleFavorite,
  showPhone,
  setShowPhone,
  handleShare,
  isShared,
  nav,
  clicks
}: PriceCardProps) => {
  const { getSellerRating } = useRatings();
  const { isAuthenticated, openAuthModal } = useAuth();
  const sellerStats = getSellerRating(listing.seller);
  const formattedCategory = categories.find(c => c.slug === listing.categoryId)?.name || "Geral";

  return (
    <div className="bg-card rounded-md p-6 border border-border/40 space-y-5 shadow-sm text-foreground">
      {/* Bold Price */}
      <div>
        {listing.promoDiscount && listing.promoPrice ? (
          <div className="flex items-baseline gap-2">
            <span className="font-sans font-extrabold text-3xl text-red-600">
              {formatPrice(listing.promoPrice, listing.currency)}
            </span>
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(listing.price, listing.currency)}
            </span>
          </div>
        ) : (
          <div className="font-sans font-extrabold text-3xl text-foreground">
            {formatPrice(listing.price, listing.currency)}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">IVA incluído (se aplicável) · Sem taxas extras de intermediação</p>
      </div>

      <div className="h-px bg-border/40" />

      {/* Vinted detail list specs */}
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estado</span>
          <span className="font-semibold capitalize text-foreground">{listing.condition}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Categoria</span>
          <span className="font-semibold text-primary/90 hover:underline cursor-pointer">{formattedCategory}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Localização</span>
          <span className="font-semibold text-foreground truncate max-w-[180px]">{listing.location}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Publicado</span>
          <span className="font-semibold text-foreground">{listing.postedAt}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Visualizações</span>
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" /> {clicks} {clicks === 1 ? "visita" : "visitas"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Interessados</span>
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Heart className={`h-3 w-3 ${fav ? 'fill-primary text-primary' : 'text-muted-foreground'}`} /> {fav ? "1 membro" : "Nenhum membro"}
          </span>
        </div>
      </div>

      <div className="h-px bg-border/40" />

      {/* Title & brief location header */}
      <div className="space-y-1">
        <h3 className="font-bold text-sm text-foreground line-clamp-2">{listing.title}</h3>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {listing.location}
        </p>
      </div>

      {/* Buy & Message Buttons styled like Vinted Red Theme */}
      <div className="space-y-2.5 pt-2">
        <Button 
          className="w-full h-11 rounded bg-primary hover:bg-primary/90 text-white font-bold text-xs sm:text-sm active:scale-95 transition-all shadow-sm"
          onClick={() => {
            if (!isAuthenticated) {
              openAuthModal(`/anuncio/${listing.id}`);
              return;
            }
            incrementListingClick(listing.id, "general");
            nav("/mensagens", { state: { sellerName: listing.seller, productName: listing.title } });
          }}
        >
          <MessageCircle className="h-4 w-4 mr-1.5 shrink-0" /> Falar com o vendedor
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant={showPhone ? "secondary" : "outline"} 
            className="h-10 rounded font-bold text-[11px] sm:text-xs transition-all active:scale-95 text-ellipsis whitespace-nowrap overflow-hidden"
            onClick={() => {
              const phoneNumber = (listing.phone || "923 000 000").replace(/\s+/g, "");
              incrementListingClick(listing.id, "contact");
              setShowPhone(true);
              window.location.href = `tel:${phoneNumber}`;
            }}
          >
            <Phone className="h-3.5 w-3.5 mr-1 shrink-0" /> {showPhone ? (listing.phone || "923 000 000") : "Contacto"}
          </Button>

          <Button 
            variant="outline" 
            className={`h-10 rounded font-bold text-[11px] sm:text-xs transition-all active:scale-95 ${fav ? 'bg-primary/5 border-primary text-primary' : ''}`}
            onClick={() => {
              if (!isAuthenticated) {
                openAuthModal(`/anuncio/${listing.id}`);
                return;
              }
              toggleFavorite(listing.id);
            }}
          >
            <Heart className={`h-3.5 w-3.5 mr-1 ${fav ? 'fill-current' : ''}`} /> {fav ? "Favoritado" : "Favorito"}
          </Button>
        </div>

        <Button 
          variant="ghost" 
          className="w-full h-9 text-xs text-muted-foreground hover:text-primary transition-all rounded"
          onClick={() => {
            incrementListingClick(listing.id, "share");
            handleShare();
          }}
        >
          {isShared ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
          {isShared ? "Link copiado!" : "Partilhar anúncio"}
        </Button>
      </div>
    </div>
  );
};

// Seller info card styled like Vinted
const SellerCard = ({ listing, setIsReportOpen }: { listing: Listing, setIsReportOpen: (open: boolean) => void }) => {
  const { getSellerRating } = useRatings();
  const sellerStats = getSellerRating(listing.seller);
  const initials = listing.seller.slice(0, 1).toUpperCase();
  const sellerUsername = listing.seller.toLowerCase().replace(/\s+/g, "_");

  return (
    <div className="bg-card rounded-md p-5 border border-border/40 text-foreground">
      <div className="flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base border border-primary/20 shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/vendedor/${encodeURIComponent(listing.seller)}`} className="font-bold text-sm text-foreground hover:text-primary hover:underline block truncate">
            {sellerUsername}
          </Link>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" /> 
            <span className="font-bold text-foreground/80">{sellerStats.rating}</span> 
            <span>({sellerStats.totalCount} avaliações)</span>
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 rounded bg-muted/40 border border-border/20 text-[11px] leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-1.5 font-bold text-foreground/80 mb-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Vendedor verificado
        </div>
        Negócio livre de comissões. Recomendamos encontros presenciais em locais públicos para trocar o artigo e o dinheiro com segurança.
      </div>
    </div>
  );
};

const Anuncio = () => {
  const { id, slug } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getUpdatedListing, rateListing, getListingRating } = useRatings();
  const { isAuthenticated, openAuthModal } = useAuth();
  
  const rawListing = useMemo(() => listings.find(l => l.id === id), [id]);
  const listing = useMemo(() => rawListing ? getUpdatedListing(rawListing) : undefined, [rawListing, getUpdatedListing]);

  useDocumentMetadata({
    title: listing ? `${listing.title} — ${formatPrice(listing.price, listing.currency || "AOA")}` : "Anúncio não encontrado",
    description: listing ? `${listing.description} — Localização: ${listing.location}, Estado: ${listing.condition}` : undefined,
    image: listing?.image,
    type: "article",
  });
  
  const [showPhone, setShowPhone] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [clicks, setClicks] = useState<number>(0);

  const handleRate = (value: number) => {
    if (!listing) return;
    if (!isAuthenticated) {
      openAuthModal(`/anuncio/${listing.id}`);
      return;
    }
    rateListing(listing.id, value);
    toast({
      title: "Classificação registada!",
      description: `Classificaste este artigo com ${value} estrelas.`,
    });
  };

  // States for reporting a seller / post
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  const handleSendReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason) {
      toast({
        title: "Aviso",
        description: "Por favor, selecione um motivo para a denúncia.",
        variant: "destructive"
      });
      return;
    }

    // Save report to localStorage for Admin visibility
    try {
      const existingReports = JSON.parse(localStorage.getItem("aqkianda-reports") || "[]");
      const newReport = {
        id: `report-${Date.now()}`,
        listingId: listing?.id,
        listingTitle: listing?.title,
        listingImage: listing?.image,
        listingPrice: listing?.price,
        listingCurrency: listing?.currency,
        sellerName: listing?.seller,
        reason: reportReason,
        text: reportText,
        reportedAt: new Date().toLocaleDateString("pt-AO"),
        status: "Pendente"
      };
      existingReports.push(newReport);
      localStorage.setItem("aqkianda-reports", JSON.stringify(existingReports));
    } catch (err) {
      console.error("Error saving report:", err);
    }

    setReportSuccess(true);
    toast({
      title: "Denúncia enviada",
      description: "Agradecemos a sua colaboração. A equipa do Aqkianda irá analisar este anúncio em breve."
    });
    setTimeout(() => {
      setIsReportOpen(false);
      setReportSuccess(false);
      setReportReason("");
      setReportText("");
    }, 2500);
  };

  // Effect for initial load of a specific listing (id change)
  useEffect(() => {
    if (!id) return;

    // Scroll to top only when the article ID changes
    window.scrollTo({ top: 0, behavior: "auto" });
    setActiveImgIndex(0);

    // Increment real views and get current view stats
    try {
      incrementListingViews(id);
      const stats = getListingStats(id);
      setClicks(stats.views);
      window.dispatchEvent(new Event("storage"));
    } catch (e) {
      console.error("Error updating views:", e);
    }
  }, [id]);

  // Effect for slug validation/redirection
  useEffect(() => {
    if (listing && id && slug) {
      const expectedSlug = slugify(listing.title);
      if (slug !== expectedSlug) {
        nav(`/anuncio/${id}/${expectedSlug}`, { replace: true });
      }
    }
  }, [id, slug, listing, nav]);

  if (!listing) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Artigo não encontrado</h1>
          <Link to="/" className="text-primary mt-4 inline-block hover:underline">Voltar à página inicial</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const fav = isFavorite(listing.id);
  const images = getListingImages(listing);
  const listingRatingStats = getListingRating(listing.id);

  const handlePrevImg = () => {
    setActiveImgIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImg = () => {
    setActiveImgIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: listing.title,
          text: `Olha este anúncio no Aqkianda: ${listing.title}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setIsShared(true);
        toast({ title: "Link copiado!", description: "O link foi copiado para a área de transferência." });
        setTimeout(() => setIsShared(false), 2000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const related = listings.filter(l => l.categoryId === listing.categoryId && l.id !== listing.id).slice(0, 4);

  return (
    <div key={id} className="min-h-screen bg-background">
      <Header />
      
      <section className="container mx-auto px-4 py-6 md:py-8">
        
        {/* Back Link */}
        <button onClick={() => nav(-1)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar atrás
        </button>

        {/* Main Vinted columns split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          
          {/* Left: Gallery & Description Details */}
          <motion.div
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3 space-y-6"
          >
            {/* Elegant Vinted Split Gallery */}
            <div className={`flex flex-col sm:flex-row gap-4 transition-all duration-300 ${
              isLandscape 
                ? "h-[250px] sm:h-[350px] md:h-[400px]" 
                : "h-[350px] sm:h-[450px] md:h-[500px]"
            }`}>
              
              {/* Vertical thumbnails */}
              <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-y-auto sm:w-20 w-full h-auto sm:h-full shrink-0 scrollbar-none snap-x">
                {images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImgIndex(idx)}
                    className={`relative aspect-[3/4] sm:w-full w-14 h-18 sm:h-auto rounded overflow-hidden border-2 bg-muted transition-all shrink-0 snap-start active:scale-95 ${
                      activeImgIndex === idx
                        ? "border-primary ring-2 ring-primary/15"
                        : "border-transparent hover:border-gray-300 dark:hover:border-gray-700"
                    }`}
                  >
                    <img src={imgUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              {/* Main Display Image */}
              <div className="relative flex-1 rounded overflow-hidden bg-muted h-full group border border-border/30 flex items-center justify-center">
                {/* Background blurred image copy to fill frame edges beautifully */}
                <div 
                  className="absolute inset-0 bg-cover bg-center blur-xl opacity-60 dark:opacity-35 pointer-events-none scale-110 transition-all duration-500"
                  style={{ backgroundImage: `url(${images[activeImgIndex]})` }}
                />
                
                {/* Adaptive gradient overlay (light and dark mode) */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-background/30 dark:from-card/40 dark:via-transparent dark:to-card/40 pointer-events-none" />

                <img
                  src={images[activeImgIndex]}
                  alt={listing.title}
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    setIsLandscape(naturalWidth > naturalHeight);
                  }}
                  className="relative z-10 max-w-full max-h-full object-contain transition-all duration-500"
                />
                
                {listing.featured && (
                  <span className="absolute top-4 left-4 bg-gold text-black text-[9px] font-bold uppercase px-2.5 py-1 rounded shadow-md z-10">
                    ★ Destaque
                  </span>
                )}

                {/* Arrow navigation overlay */}
                <button
                  onClick={handlePrevImg}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-gray-900/90 text-foreground flex items-center justify-center shadow-md hover:bg-white active:scale-90 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 z-10 border border-border/20"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNextImg}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-gray-900/90 text-foreground flex items-center justify-center shadow-md hover:bg-white active:scale-90 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 z-10 border border-border/20"
                  aria-label="Seguinte"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                {/* Counter indicator */}
                <div className="absolute bottom-4 right-4 bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded">
                  {activeImgIndex + 1} de {images.length}
                </div>
              </div>
            </div>
            
            {/* Description & Detailed Information Section */}
            <div className="bg-card rounded-md p-6 border border-border/40 space-y-4">
              <h2 className="font-bold text-base text-foreground pb-2 border-b border-border/20">Descrição do Artigo</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>

            {/* Price & Contact (Mobile Only) */}
            <div className="block lg:hidden">
              <PriceCard 
                listing={listing}
                fav={fav}
                toggleFavorite={toggleFavorite}
                showPhone={showPhone}
                setShowPhone={setShowPhone}
                handleShare={handleShare}
                isShared={isShared}
                nav={nav}
                clicks={clicks}
              />
            </div>

            {/* Seller profile card (Mobile Only) */}
            <div className="block lg:hidden">
              <SellerCard 
                listing={listing} 
                setIsReportOpen={setIsReportOpen} 
              />
            </div>

            {/* Product Reviews & Rating Form */}
            <div className="bg-card rounded-md p-6 border border-border/40 space-y-6">
              <h2 className="font-bold text-base text-foreground pb-2 border-b border-border/20">Classificação do Artigo</h2>
              
              <div className="flex flex-col md:flex-row gap-6 justify-between md:items-center">
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-extrabold text-foreground">{listingRatingStats.rating}</span>
                    <span className="text-xs text-muted-foreground">de 5.0 estrelas</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((starValue) => {
                      const isFull = starValue <= Math.floor(listingRatingStats.rating);
                      const isHalf = !isFull && (starValue - 0.5 <= listingRatingStats.rating);
                      return (
                        <Star
                          key={starValue}
                          className={`h-4.5 w-4.5 ${
                            isFull ? "fill-gold text-gold" : isHalf ? "fill-gold/50 text-gold" : "text-muted/30"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Rating interact tool */}
                <div className="bg-muted/30 rounded p-4 border border-border/20 max-w-sm w-full space-y-2">
                  <h4 className="font-bold text-xs">Achas que este artigo é o que esperavas?</h4>
                  <p className="text-[10px] text-muted-foreground">
                    {isAuthenticated 
                      ? "Deixa o teu voto para apoiar outros utilizadores na plataforma do Aqkianda."
                      : "Inicia sessão para deixar a tua classificação de estrelas."}
                  </p>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((starValue) => {
                      const isHighlighted = starValue <= (hoverRating || listingRatingStats.userRating || 0);
                      return (
                        <button
                          key={starValue}
                          type="button"
                          onMouseEnter={() => isAuthenticated && setHoverRating(starValue)}
                          onMouseLeave={() => isAuthenticated && setHoverRating(0)}
                          onClick={() => handleRate(starValue)}
                          className="p-0.5 transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                          aria-label={`Avaliar com ${starValue} estrelas`}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              isHighlighted ? "fill-gold text-gold" : "text-muted-foreground/30 hover:text-gold"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {listingRatingStats.userRating && (
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 shrink-0" /> Obrigado pelo teu voto ({listingRatingStats.userRating} estrelas)!
                    </p>
                  )}
                  {!isAuthenticated && (
                    <button 
                      onClick={() => openAuthModal(`/anuncio/${listing.id}`)}
                      className="text-[11px] text-primary hover:underline font-bold block pt-1 cursor-pointer text-left"
                    >
                      Entrar / Criar Conta para avaliar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Sidebar: Sticky Info Block (Desktop Only) */}
          <motion.aside
            initial={{ opacity: 0, x: 15 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 space-y-4 hidden lg:block"
          >
            <div className="sticky top-24 space-y-4">
              <PriceCard 
                listing={listing}
                fav={fav}
                toggleFavorite={toggleFavorite}
                showPhone={showPhone}
                setShowPhone={setShowPhone}
                handleShare={handleShare}
                isShared={isShared}
                nav={nav}
                clicks={clicks}
              />
              <SellerCard 
                listing={listing} 
                setIsReportOpen={setIsReportOpen} 
              />
            </div>
          </motion.aside>
        </div>

        {/* Safety Warnings & Reporting button */}
        <div className="mt-12 border-t border-border/20 pt-10 max-w-4xl mx-auto space-y-6">
          <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Conselhos de Segurança para Compras no Aqkianda</h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  O <strong>Aqkianda</strong> é um diretório de classificados livre em Angola. A negociação e a entrega são geridas diretamente entre comprador e vendedor, sem pagamento adiantado.
                </p>
                <ul className="list-disc list-inside text-xs text-amber-800 dark:text-amber-300 space-y-1 pl-1">
                  <li>Combina encontros sempre num local público, movimentado e vigiado.</li>
                  <li>Inspeciona o artigo com atenção antes de entregar qualquer quantia.</li>
                  <li>Evita fazer transferências bancárias ou depósitos como sinal de reserva.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setIsReportOpen(true)}
              className="py-2.5 px-5 rounded text-xs font-bold text-red-600 dark:text-red-400 hover:text-white hover:bg-red-600 dark:hover:bg-red-950/60 bg-red-50 dark:bg-red-950/15 border border-red-200 dark:border-red-900/30 transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
            >
              <AlertCircle className="h-4 w-4" /> Denunciar anúncio ou utilizador suspeito
            </button>
          </div>
        </div>

        {/* Related listings similar to this item */}
        {related.length > 0 && (
          <div className="mt-16 border-t border-border/20 pt-10">
            <h2 className="font-bold text-lg text-foreground mb-6">Artigos semelhantes recomendados</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {related.map((l, i) => (
                <Link key={l.id} to={`/anuncio/${l.id}`} className="group block space-y-2.5">
                  <div className="aspect-[3/4] rounded overflow-hidden bg-muted border border-border/30">
                    <img src={l.image} alt={l.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-xs leading-tight line-clamp-1 text-foreground group-hover:text-primary transition-colors">{l.title}</h3>
                    <div className="font-sans font-extrabold text-sm text-foreground">{formatPrice(l.price, l.currency)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <Footer />

      {/* Report Modal */}
      <AnimatePresence>
        {isReportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReportOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card text-card-foreground p-6 rounded shadow-2xl border border-border/80 max-w-md w-full relative z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b pb-3 border-border/40">
                <h3 className="font-bold text-base text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="h-5 w-5" /> Denunciar Artigo
                </h3>
                <button 
                  onClick={() => setIsReportOpen(false)}
                  className="text-muted-foreground hover:text-foreground text-sm font-bold bg-muted p-1 rounded-full w-7 h-7 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              {reportSuccess ? (
                <div className="py-6 text-center space-y-3">
                  <div className="h-11 w-11 rounded-full bg-green-100 dark:bg-green-950/40 text-green-600 mx-auto flex items-center justify-center text-xl font-bold">✓</div>
                  <h4 className="font-bold text-green-600">Submetido com sucesso</h4>
                  <p className="text-xs text-muted-foreground">A equipa do Aqkianda irá analisar este anúncio e tomar as providências adequadas rapidamente.</p>
                </div>
              ) : (
                <form onSubmit={handleSendReport} className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Agradecemos o teu alerta. Ajuda-nos a manter a plataforma livre de fraudes e anúncios fictícios.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Selecione o motivo principal:</label>
                    <select 
                      value={reportReason} 
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full p-2.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 text-black dark:text-white"
                    >
                      <option value="">Selecione um motivo...</option>
                      <option value="fraude">Tentativa de fraude / Burla</option>
                      <option value="falso">Anúncio falso / Spam</option>
                      <option value="preco">Preço abusivo / enganador</option>
                      <option value="contacto">Contacto telefónico inexistente</option>
                      <option value="outro">Outro motivo suspeito</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Comentários (opcional):</label>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={3}
                      placeholder="Indique mais pormenores sobre o que despertou desconfiança..."
                      className="w-full p-2.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none text-black dark:text-white"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold shadow transition-all active:scale-95"
                  >
                    Submeter Denúncia
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Anuncio;
