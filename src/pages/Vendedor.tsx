import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, ShieldCheck, MapPin, ArrowLeft, Package, Calendar, MessageCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ListingCard from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { listings } from "@/data/listings";
import { useRatings } from "@/context/RatingsContext";
import { useAuth } from "@/context/AuthContext";

const Vendedor = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const { getSellerRating } = useRatings();
  const { isAuthenticated, openAuthModal } = useAuth();
  const sellerName = decodeURIComponent(name || "");

  const sellerListings = listings.filter((l) => l.seller.toLowerCase() === sellerName.toLowerCase());

  if (sellerListings.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Vendedor não encontrado</h1>
          <Link to="/" className="text-primary mt-4 inline-block hover:underline">
            Voltar para a página inicial
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  /* Aggregate seller stats from their listings using dynamic ratings context */
  const sellerStats = getSellerRating(sellerName);
  const avgRating = sellerStats.rating;
  const locations = [...new Set(sellerListings.map((l) => l.location))];
  const initials = sellerName
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sellerUsername = sellerName.toLowerCase().replace(/\s+/g, "_");

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      <Header />

      <section className="container mx-auto px-4 py-6 md:py-8">
        
        {/* Back navigation button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar atrás
        </button>

        {/* Minimalist Vinted Seller Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-md p-6 sm:p-8 border border-border/40 mb-10 shadow-sm relative overflow-hidden"
        >
          {/* Subtle background red accent glow */}
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            {/* Left side: Avatar, Name and ratings */}
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Profile avatar circle with brand border */}
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl border-2 border-primary/25 shrink-0 shadow-sm">
                {initials}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-bold text-lg sm:text-2xl text-foreground leading-tight">
                    {sellerName}
                  </h1 >
                  <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-900/30">
                    <ShieldCheck className="h-3 w-3" /> Verificado
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">@{sellerUsername}</p>

                {/* Stars ratings breakdown */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-0.5 text-gold">
                    {[1, 2, 3, 4, 5].map((starVal) => (
                      <Star 
                        key={starVal} 
                        className={`h-3.5 w-3.5 ${starVal <= Math.floor(avgRating) ? "fill-current" : "opacity-30"}`} 
                      />
                    ))}
                  </div>
                  <span className="font-bold text-foreground/90">{avgRating}</span>
                  <span>({sellerStats.totalCount} avaliações)</span>
                </div>
              </div>
            </div>

            {/* Right side: Seller stats & Send Message Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <Button
                onClick={() => {
                  if (!isAuthenticated) {
                    openAuthModal(`/vendedor/${name}`);
                    return;
                  }
                  navigate("/mensagens", { state: { sellerName, productName: sellerListings[0]?.title || "Geral" } });
                }}
                className="h-11 bg-primary hover:bg-primary/90 text-white font-bold px-6 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" /> Enviar Mensagem
              </Button>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs md:text-sm text-muted-foreground bg-muted/30 p-4 rounded-xl border border-border/20">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider block">Artigos Ativos</span>
                  <span className="font-sans font-extrabold text-foreground text-base flex items-center gap-1">
                    <Package className="h-4 w-4 text-primary" /> {sellerListings.length}
                  </span>
                </div>
                <div className="w-px h-8 bg-border/40 hidden sm:block" />
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider block">Localização</span>
                  <span className="font-bold text-foreground text-xs flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary" /> {locations.join(" · ")}
                  </span>
                </div>
                <div className="w-px h-8 bg-border/40 hidden sm:block" />
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider block">Membro Desde</span>
                  <span className="font-bold text-foreground text-xs flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-primary" /> 2026
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tab Header for list of items */}
        <div className="border-b border-border/40 mb-6 pb-2 flex items-center justify-between">
          <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
            Anúncios publicados <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{sellerListings.length}</span>
          </h2>
        </div>

        {/* Seller active listings feed list using the newly crafted ListingCard */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {sellerListings.map((l, i) => (
            <ListingCard key={l.id} listing={l} index={i} />
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Vendedor;
