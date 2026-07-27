import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ListingCard from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listings, Listing, slugify } from "@/data/listings";
import { Star, MapPin, Mail, Settings, Plus, Package, Heart, LogOut, Camera, ShieldCheck, Lock, Eye, Smartphone, KeyRound, Bell, EyeOff, Trash2, Edit, UserX } from "lucide-react";
import { Link, useSearchParams, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

interface PromoCampaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  discounts: number[];
  status: string;
}

interface SellerNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
}

interface PromoMapping {
  promoEventId: string;
  promoDiscount: number;
  promoPrice: number;
  promoEventName: string;
}

const Perfil = () => {
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") || "anuncios";
  const { toast } = useToast();
  const { name: routeName } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, openAuthModal, logout, loginWithGoogle } = useAuth();

  const [localListings, setLocalListings] = useState<Listing[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [promoEvents, setPromoEvents] = useState<PromoCampaign[]>([]);
  const [notifications, setNotifications] = useState<SellerNotification[]>([]);
  const [promoMappings, setPromoMappings] = useState<Record<string, PromoMapping>>({});

  // Active mapping selection state for modal
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState("");
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [selectedDiscount, setSelectedDiscount] = useState<number>(20);

  useEffect(() => {
    if (!isAuthenticated) return;
    const currentUserName = user?.name || "O Meu Perfil";
    const expectedName = slugify(currentUserName);
    if (!routeName || routeName !== expectedName) {
      navigate(`/perfil/${expectedName}${activeTab !== "anuncios" ? `?tab=${activeTab}` : ""}`, { replace: true });
    }
  }, [routeName, navigate, activeTab, isAuthenticated, user]);

  useEffect(() => {
    // 1. Promo events
    const savedPromos = localStorage.getItem("aqkianda-promo-events");
    if (savedPromos) {
      setPromoEvents(JSON.parse(savedPromos));
    } else {
      const initialPromos: PromoCampaign[] = [
        {
          id: "e1",
          name: "Saldos de Cacimbo 2026",
          description: "Campanha especial de Inverno com promoções imperdíveis de até 30% em eletrónica, roupas e móveis!",
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          discounts: [10, 15, 20, 25, 30],
          status: "active"
        }
      ];
      setPromoEvents(initialPromos);
      localStorage.setItem("aqkianda-promo-events", JSON.stringify(initialPromos));
    }

    // 2. Notifications
    const savedNotifications = localStorage.getItem("aqkianda-seller-notifications");
    if (savedNotifications) {
      setNotifications(JSON.parse(savedNotifications));
    } else {
      const defaultNot: SellerNotification = {
        id: "not-seed",
        title: "Destaque as suas vendas nos Saldos de Cacimbo! ❄️",
        message: "O grande evento de Saldos de Cacimbo 2026 já começou. Adira agora adicionando descontos de 10% a 30% aos seus anúncios para colocá-los no topo e no slide da página inicial!",
        date: "11/07/2026 14:30",
        read: false
      };
      setNotifications([defaultNot]);
      localStorage.setItem("aqkianda-seller-notifications", JSON.stringify([defaultNot]));
    }

    // 3. Promo mappings & listings
    const loadListingsAndMappings = () => {
      // Get all base listings combined with custom ones
      const allListings = [...listings];
      const customListingsStr = localStorage.getItem("aqkianda-custom-listings");
      if (customListingsStr) {
        try {
          const customListings: Listing[] = JSON.parse(customListingsStr);
          customListings.forEach(cl => {
            if (!allListings.some(l => l.id === cl.id)) {
              allListings.push(cl);
            }
          });
        } catch (e) {
          console.error(e);
        }
      }

      // Load removed and hidden IDs
      const savedRemoved = localStorage.getItem("aqkianda-removed-ids");
      const rIds: string[] = savedRemoved ? JSON.parse(savedRemoved) : [];

      const savedHidden = localStorage.getItem("aqkianda-hidden-ids");
      const hIds: string[] = savedHidden ? JSON.parse(savedHidden) : [];
      setHiddenIds(hIds);

      // Filter listings (only non-removed)
      const filtered = allListings.filter(l => !rIds.includes(l.id));
      setLocalListings(filtered);

      const savedMappings = localStorage.getItem("aqkianda-promotional-mappings");
      if (savedMappings) {
        setPromoMappings(JSON.parse(savedMappings));
      }
    };

    loadListingsAndMappings();

    const handleStorageChange = () => {
      loadListingsAndMappings();
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleOptInPromo = () => {
    if (!selectedListingId || !selectedPromoId) return;

    const promo = promoEvents.find(p => p.id === selectedPromoId);
    if (!promo) return;

    const listing = localListings.find(l => l.id === selectedListingId);
    if (!listing) return;

    const discountMultiplier = (100 - selectedDiscount) / 100;
    const promoPrice = Math.round(listing.price * discountMultiplier);

    const updatedMappings = {
      ...promoMappings,
      [selectedListingId]: {
        promoEventId: selectedPromoId,
        promoDiscount: selectedDiscount,
        promoPrice: promoPrice,
        promoEventName: promo.name
      }
    };

    setPromoMappings(updatedMappings);
    localStorage.setItem("aqkianda-promotional-mappings", JSON.stringify(updatedMappings));

    // Update in-memory listing
    listing.promoEventId = selectedPromoId;
    listing.promoDiscount = selectedDiscount;
    listing.promoPrice = promoPrice;

    toast({
      title: "Sucesso!",
      description: `O anúncio "${listing.title}" foi inscrito no evento "${promo.name}" com ${selectedDiscount}% de desconto.`,
    });
    
    setIsPromoModalOpen(false);
    setSelectedListingId("");
    setSelectedPromoId("");

    window.dispatchEvent(new Event("storage"));
  };

  const handleOptOutPromo = (listingId: string) => {
    const updatedMappings = { ...promoMappings };
    delete updatedMappings[listingId];

    setPromoMappings(updatedMappings);
    localStorage.setItem("aqkianda-promotional-mappings", JSON.stringify(updatedMappings));

    const listing = localListings.find(l => l.id === listingId);
    if (listing) {
      delete listing.promoEventId;
      delete listing.promoDiscount;
      delete listing.promoPrice;
    }

    toast({
      title: "Inscrição Cancelada",
      description: "Anúncio removido do evento de promoção.",
    });
    window.dispatchEvent(new Event("storage"));
  };

  const handleDeleteListing = (listingId: string) => {
    if (confirm("Tens a certeza que desejas eliminar permanentemente este anúncio?")) {
      const savedRemoved = localStorage.getItem("aqkianda-removed-ids");
      const rIds = savedRemoved ? JSON.parse(savedRemoved) : [];
      if (!rIds.includes(listingId)) {
        rIds.push(listingId);
      }
      localStorage.setItem("aqkianda-removed-ids", JSON.stringify(rIds));
      
      // Update local states
      setLocalListings(prev => prev.filter(l => l.id !== listingId));
      
      // Also remove from custom listings if it was there
      const customListingsStr = localStorage.getItem("aqkianda-custom-listings");
      if (customListingsStr) {
        try {
          const customListings = JSON.parse(customListingsStr);
          const updatedCustom = customListings.filter((cl: Listing) => cl.id !== listingId);
          localStorage.setItem("aqkianda-custom-listings", JSON.stringify(updatedCustom));
        } catch (e) {
          console.error(e);
        }
      }

      window.dispatchEvent(new Event("storage"));
      
      toast({
        title: "Anúncio Eliminado",
        description: "O anúncio foi permanentemente removido da plataforma.",
      });
    }
  };

  const handleHideListing = (listingId: string) => {
    const savedHidden = localStorage.getItem("aqkianda-hidden-ids");
    const hIds = savedHidden ? JSON.parse(savedHidden) : [];
    if (!hIds.includes(listingId)) {
      hIds.push(listingId);
    }
    localStorage.setItem("aqkianda-hidden-ids", JSON.stringify(hIds));
    setHiddenIds(hIds);

    toast({
      title: "Anúncio Ocultado",
      description: "O anúncio foi movido para a aba de anúncios ocultos.",
    });
  };

  const handleUnhideListing = (listingId: string) => {
    const savedHidden = localStorage.getItem("aqkianda-hidden-ids");
    const hIds = savedHidden ? JSON.parse(savedHidden) : [];
    const updatedHidden = hIds.filter((id: string) => id !== listingId);
    localStorage.setItem("aqkianda-hidden-ids", JSON.stringify(updatedHidden));
    setHiddenIds(updatedHidden);

    toast({
      title: "Anúncio Ativado",
      description: "O anúncio voltou a estar público e ativo na plataforma.",
    });
  };

  const handleMarkNotificationRead = (notId: string) => {
    const updated = notifications.map(n => n.id === notId ? { ...n, read: true } : n);
    setNotifications(updated);
    localStorage.setItem("aqkianda-seller-notifications", JSON.stringify(updated));
  };

  const userName = user?.name || "Utilizador";
  const userInitials = user?.avatar || userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "AO";

  // Listings for the "Meus Anúncios" tab (only visible/not hidden)
  const myListings = localListings.filter(l => (l.seller.toLowerCase() === userName.toLowerCase() || l.seller === "João Manuel") && !hiddenIds.includes(l.id));

  // Listings for the "Anúncios Ocultos" tab
  const hiddenMyListings = localListings.filter(l => (l.seller.toLowerCase() === userName.toLowerCase() || l.seller === "João Manuel") && hiddenIds.includes(l.id));

  const tabs = [
    { id: "anuncios", label: "Meus Anúncios", icon: Package },
    { id: "ocultos", label: "Anúncios Ocultos", icon: EyeOff },
    { id: "promocoes", label: "Notificações & Promoções", icon: Bell },
    { id: "config", label: "Definições", icon: Settings },
    { id: "seguranca", label: "Segurança", icon: ShieldCheck },
  ];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 sm:py-16 flex flex-col items-center justify-center text-center">
          <div className="w-full max-w-sm sm:max-w-md bg-card border border-border/60 rounded-3xl p-6 sm:p-8 shadow-card flex flex-col items-center text-center">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-sm border border-primary/20">
              <UserX className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              Perfil Privado
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mb-6 leading-relaxed">
              Inicia sessão ou cria a tua conta na Aqkianda para veres o teu perfil, gerir os teus anúncios, aceder aos teus artigos guardados e gerir as tuas vendas.
            </p>
            
            <div className="w-full space-y-3">
              <Button
                type="button"
                onClick={() => loginWithGoogle("/perfil")}
                className="w-full h-11 sm:h-12 rounded-xl bg-white dark:bg-gray-900 border-2 border-primary/30 hover:border-primary text-gray-900 dark:text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2.5 active:scale-[0.98]"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                    <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                    <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                    <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
                  </g>
                </svg>
                <span>Continuar com o Google</span>
              </Button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button 
                  variant="outline"
                  onClick={() => navigate("/entrar?redirect=/perfil")}
                  className="w-full h-10 font-semibold rounded-xl text-xs"
                >
                  Fazer Login
                </Button>
                <Button 
                  onClick={() => navigate("/registar?redirect=/perfil")}
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs shadow-sm"
                >
                  Criar Conta
                </Button>
              </div>

              <Button 
                variant="ghost"
                onClick={() => navigate("/")}
                className="w-full h-9 font-medium text-xs text-muted-foreground hover:text-foreground mt-2"
              >
                Voltar à Página Inicial
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container py-10">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-[2.5rem] overflow-hidden gradient-dark p-8 md:p-12 text-secondary-foreground mb-8"
        >
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full gradient-hero opacity-30 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-60 w-60 rounded-full gradient-mint opacity-15 blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-center md:items-start gap-8">
            <div className="relative group">
              <div className="h-32 w-32 rounded-[2rem] gradient-hero flex items-center justify-center font-display font-bold text-5xl text-primary-foreground shadow-elevated">
                {userInitials}
              </div>
              <button className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-card text-foreground border border-border shadow-card flex items-center justify-center hover:text-primary transition-smooth opacity-0 group-hover:opacity-100">
                <Camera className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
                <h1 className="font-display font-bold text-3xl md:text-4xl">{userName}</h1>
                <div className="inline-flex items-center gap-1.5 bg-accent/20 text-accent px-4 py-1 rounded-full text-xs font-bold mx-auto md:mx-0">
                  <ShieldCheck className="h-4 w-4" /> Conta Verificada
                </div>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-6 gap-y-2 text-sm text-secondary-foreground/70">
                <span className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-gold text-gold" /> 5.0 (Conta Ativa)</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {user?.province || "Luanda, Angola"}</span>
                <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {user?.email || "utilizador@email.ao"}</span>
              </div>

              <div className="mt-8 flex flex-wrap justify-center md:justify-start gap-3">
                <Link to="/publicar">
                  <Button className="rounded-full gradient-hero text-primary-foreground shadow-glow font-bold px-8 h-12">
                    <Plus className="h-5 w-5 mr-2" /> Publicar Novo Anúncio
                  </Button>
                </Link>
                <Button variant="outline" className="rounded-full bg-white/5 border-white/10 text-white hover:bg-white/10 h-12 px-8">
                  Ver como público
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-hide">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setParams({ tab: tab.id })}
                className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-smooth shrink-0 ${activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "bg-card border border-border/40 hover:border-primary/40"
                  }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "anuncios" && (
            <motion.div
              key="anuncios"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {myListings.map((l, i) => {
                  const hasPromo = promoMappings[l.id];
                  return (
                    <div key={l.id} className="relative group bg-card border border-border/30 rounded-[2rem] p-3 shadow-sm flex flex-col justify-between">
                      <div className="relative">
                        <ListingCard listing={l} index={i} />
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-smooth z-10">
                          <Link to={`/publicar/${l.id}`}>
                            <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-elevated bg-background/90 backdrop-blur hover:bg-primary hover:text-primary-foreground transition-smooth">
                              <Settings className="h-5 w-5" />
                            </Button>
                          </Link>
                        </div>
                      </div>

                      {hasPromo && (
                        <div className="mt-2 text-center">
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full inline-block truncate max-w-full">
                            🔥 {hasPromo.promoEventName || "Saldos Cacimbo"} (-{hasPromo.promoDiscount}%)
                          </span>
                        </div>
                      )}

                      {/* Action Bar for Active Listings */}
                      <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-3 gap-1.5">
                        <Link to={`/publicar/${l.id}`} className="w-full">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-primary/5 hover:text-primary transition-smooth px-1"
                          >
                            <Edit className="h-3.5 w-3.5" /> Editar
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleHideListing(l.id)}
                          className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-amber-500/5 hover:text-amber-500 hover:border-amber-500/30 transition-smooth px-1"
                        >
                          <EyeOff className="h-3.5 w-3.5" /> Ocultar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteListing(l.id)}
                          className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-rose-500/5 hover:text-rose-500 hover:border-rose-500/30 transition-smooth px-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {myListings.length === 0 && (
                <div className="text-center py-20 bg-card rounded-[2rem] border border-dashed border-border">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Ainda não tens anúncios ativos.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "ocultos" && (
            <motion.div
              key="ocultos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {hiddenMyListings.map((l, i) => {
                  const hasPromo = promoMappings[l.id];
                  return (
                    <div key={l.id} className="relative group bg-card border border-border/30 rounded-[2rem] p-3 shadow-sm flex flex-col justify-between">
                      <div className="relative">
                        <ListingCard listing={l} index={i} />
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-smooth z-10">
                          <Link to={`/publicar/${l.id}`}>
                            <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full shadow-elevated bg-background/90 backdrop-blur hover:bg-primary hover:text-primary-foreground transition-smooth">
                              <Settings className="h-5 w-5" />
                            </Button>
                          </Link>
                        </div>
                      </div>

                      {hasPromo && (
                        <div className="mt-2 text-center">
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full inline-block truncate max-w-full">
                            🔥 {hasPromo.promoEventName || "Saldos Cacimbo"} (-{hasPromo.promoDiscount}%)
                          </span>
                        </div>
                      )}

                      {/* Action Bar for Hidden Listings */}
                      <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-3 gap-1.5">
                        <Link to={`/publicar/${l.id}`} className="w-full">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-primary/5 hover:text-primary transition-smooth px-1"
                          >
                            <Edit className="h-3.5 w-3.5" /> Editar
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnhideListing(l.id)}
                          className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-emerald-500/5 hover:text-emerald-500 hover:border-emerald-500/30 transition-smooth px-1"
                        >
                          <Eye className="h-3.5 w-3.5" /> Ativar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteListing(l.id)}
                          className="w-full text-[11px] font-bold h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-rose-500/5 hover:text-rose-500 hover:border-rose-500/30 transition-smooth px-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hiddenMyListings.length === 0 && (
                <div className="text-center py-20 bg-card rounded-[2rem] border border-dashed border-border">
                  <EyeOff className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Não tens anúncios ocultos.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "config" && (
            <motion.div
              key="config"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-card rounded-3xl p-8 border border-border/40 shadow-card space-y-6">
                <h3 className="font-display font-bold text-xl">Dados Pessoais</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome Completo</Label>
                    <Input id="nome" defaultValue="João Manuel" className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" defaultValue="joao.manuel@email.ao" className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tel">Telefone</Label>
                    <Input id="tel" defaultValue="+244 923 000 000" className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prov">Província</Label>
                    <Input id="prov" defaultValue="Luanda" className="rounded-xl h-12" />
                  </div>
                </div>
                <Button className="rounded-full gradient-hero text-primary-foreground font-bold px-8">
                  Guardar Alterações
                </Button>
              </div>

              <div className="bg-destructive/5 rounded-3xl p-8 border border-destructive/20 space-y-4">
                <h3 className="font-display font-bold text-xl text-destructive">Zona de Perigo</h3>
                <p className="text-sm text-muted-foreground">Ao apagar a tua conta, todos os teus anúncios e mensagens serão removidos permanentemente.</p>
                <Button variant="destructive" className="rounded-full font-bold px-8">
                  <LogOut className="h-4 w-4 mr-2" /> Apagar Conta
                </Button>
              </div>
            </motion.div>
          )}

          {activeTab === "seguranca" && (
            <motion.div
              key="seguranca"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-card rounded-3xl p-8 border border-border/40 shadow-card space-y-6">
                <h3 className="font-display font-bold text-xl flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" /> Segurança da Conta
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <KeyRound className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Palavra-passe</p>
                        <p className="text-xs text-muted-foreground">Altera a tua palavra-passe regularmente</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full">Alterar</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Autenticação de dois fatores</p>
                        <p className="text-xs text-muted-foreground">Adiciona uma camada extra de segurança</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full">Ativar</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Eye className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Sessões activas</p>
                        <p className="text-xs text-muted-foreground">Gerencia os dispositivos com acesso à tua conta</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full">Ver</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Bell className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Alertas de segurança</p>
                        <p className="text-xs text-muted-foreground">Notificações sobre atividades suspeitas</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full">Configurar</Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "promocoes" && (
            <motion.div
              key="promocoes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Notifications List */}
              <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-card space-y-6">
                <div>
                  <h3 className="font-display font-bold text-xl flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" /> Notificações do Administrador
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Fique por dentro das novidades, campanhas de promoção e comunicados oficiais da equipa Aquianda.</p>
                </div>

                <div className="space-y-4">
                  {notifications.map((not) => (
                    <div
                      key={not.id}
                      className={`p-5 rounded-2xl border transition-all relative ${
                        not.read
                          ? "bg-muted/20 border-border/40"
                          : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      {!not.read && (
                        <span className="absolute top-4 right-4 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
                      )}
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-red-500/10 text-red-600 shrink-0 mt-0.5">
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-sm text-foreground">{not.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">{not.message}</p>
                          <div className="flex items-center gap-3 pt-2 text-[10px] font-mono text-muted-foreground">
                            <span>{not.date}</span>
                            {!not.read && (
                              <button
                                onClick={() => handleMarkNotificationRead(not.id)}
                                className="text-primary hover:underline font-bold"
                              >
                                Marcar como lida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {notifications.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      Sem novas notificações de momento.
                    </div>
                  )}
                </div>
              </div>

              {/* Active Campaigns Info card */}
              <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-card space-y-4">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-gold" /> Campanhas Ativas de Parceria
                </h3>
                <p className="text-xs text-muted-foreground">
                  Adira às campanhas de descontos para destacar os seus anúncios e conseguir até 5x mais cliques dos compradores. Vá ao tab "Meus Anúncios" para inscrever cada item.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  {promoEvents.map((event) => (
                    <div key={event.id} className="p-4 rounded-2xl bg-muted/20 border border-border/50">
                      <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                        {event.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{event.description}</p>
                      <div className="text-[10px] font-mono text-muted-foreground mt-3 pt-2 border-t border-border/20">
                        Período: {event.startDate} a {event.endDate}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Promotion Opt-In Selection Dialog */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-[2rem] max-w-md w-full p-6 shadow-2xl relative"
          >
            <h3 className="font-display font-bold text-xl mb-2 flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              Participar de Promoção
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Selecione o evento ativo criado pelo Administrador e escolha o desconto que deseja aplicar. O seu anúncio aparecerá com preço promocional e selos de destaque.
            </p>

            {promoEvents.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Não existem eventos promocionais ativos de momento.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Selecione o Evento</label>
                  <select
                    value={selectedPromoId}
                    onChange={(e) => setSelectedPromoId(e.target.value)}
                    className="w-full h-11 rounded-xl bg-muted/50 border border-border px-3 text-sm focus:outline-none focus:border-primary"
                  >
                    {promoEvents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Selecione o Desconto (Porcentagem)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 15, 20, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDiscount(d)}
                        className={`py-2.5 rounded-xl font-bold text-sm border transition-all ${
                          selectedDiscount === d
                            ? "bg-red-500 text-white border-transparent"
                            : "bg-muted/50 border-transparent hover:border-border text-foreground"
                        }`}
                      >
                        {d}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsPromoModalOpen(false)}
                    className="flex-1 rounded-xl h-11"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleOptInPromo}
                    className="flex-1 rounded-xl h-11 gradient-hero text-primary-foreground font-bold"
                  >
                    Confirmar Inscrição
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Perfil;
