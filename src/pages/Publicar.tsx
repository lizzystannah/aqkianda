import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { categories, getCategories, Listing } from "@/data/listings";
import { Upload, ImagePlus, ArrowRight, X, CheckCircle2, AlertCircle, Edit, Trash2, Sparkles, Check, Percent, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { listings } from "@/data/listings";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import ListingCard from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";

interface PromoCampaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  discounts: number[];
  status: string;
  createdAt?: string;
}

const DEFAULT_EVENTS: PromoCampaign[] = [
  {
    id: "e1",
    name: "Saldos de Cacimbo 2026",
    description: "Campanha especial de Inverno com promoções imperdíveis de até 30% em eletrónica, roupas e móveis!",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    discounts: [10, 15, 20, 25, 30],
    status: "active",
    createdAt: "2026-07-01T12:00:00Z"
  }
];

const Publicar = () => {
  const { toast } = useToast();
  const nav = useNavigate();
  const { id } = useParams();
  const { isAuthenticated, openAuthModal, user: currentUser } = useAuth();
  const isEditing = Boolean(id);

  useDocumentMetadata({
    title: isEditing ? "Editar Anúncio" : "Publicar Anúncio",
    description: "Publica ou edita os teus anúncios na Aqkianda. Ganha dinheiro vendendo o que já não usas ou promove os teus serviços e empregos.",
  });
  
  const [images, setImages] = useState<string[]>([]);
  const [cat, setCat] = useState("");
  const [cond, setCond] = useState<"novo" | "usado">("novo");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [existingItem, setExistingItem] = useState<Listing | null>(null);

  // Controlled form states
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [loc, setLoc] = useState("");
  const [desc, setDesc] = useState("");
  const [isPromoted, setIsPromoted] = useState(false);

  // Campaign promotion states
  const [promoEvents, setPromoEvents] = useState<PromoCampaign[]>([]);
  const [joinPromo, setJoinPromo] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [selectedDiscount, setSelectedDiscount] = useState(15);

  // Load promos from localStorage
  useEffect(() => {
    const savedPromos = localStorage.getItem("aqkianda-promo-events");
    let promos: PromoCampaign[] = [];
    if (savedPromos) {
      try {
        promos = JSON.parse(savedPromos);
      } catch (err) {
        promos = DEFAULT_EVENTS;
      }
    } else {
      promos = DEFAULT_EVENTS;
    }
    setPromoEvents(promos);
    if (promos.length > 0) {
      setSelectedPromoId(promos[0].id);
    }
  }, []);

  // Pre-fill if editing
  useEffect(() => {
    if (isEditing) {
      const item = listings.find(l => l.id === id);
      if (item) {
        setExistingItem(item);
        setCat(item.categoryId);
        setCond(item.condition);
        setImages([item.image]);
        setTitle(item.title);
        setPrice(item.price.toString());
        setLoc(item.location);
        setDesc(item.description);
        setIsPromoted(item.featured);

        // Check if there are active promotional mappings for this listing
        try {
          const promoMappingsStr = localStorage.getItem("aqkianda-promotional-mappings");
          let itemPromoEventId = item.promoEventId;
          let itemPromoDiscount = item.promoDiscount;
          if (promoMappingsStr) {
            const promoMappings = JSON.parse(promoMappingsStr);
            if (promoMappings[item.id]) {
              itemPromoEventId = promoMappings[item.id].promoEventId;
              itemPromoDiscount = promoMappings[item.id].promoDiscount;
            }
          }
          if (itemPromoEventId) {
            setJoinPromo(true);
            setSelectedPromoId(itemPromoEventId);
            setSelectedDiscount(itemPromoDiscount || 15);
          }
        } catch (e) {
          console.error("Error loading promo mapping for edit", e);
        }
      }
    }
  }, [id, isEditing]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...newImages].slice(0, 8));
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGoToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "O título do anúncio é obrigatório." });
      return;
    }
    if (!cat) {
      toast({ variant: "destructive", title: "Erro", description: "Seleciona uma categoria." });
      return;
    }
    const priceVal = parseFloat(price || "0");
    if (isNaN(priceVal) || priceVal < 0) {
      toast({ variant: "destructive", title: "Erro", description: "Insere um preço válido." });
      return;
    }
    if (!loc.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "A localização é obrigatória." });
      return;
    }
    if (!desc.trim()) {
      toast({ variant: "destructive", title: "Erro", description: "A descrição detalhada é obrigatória." });
      return;
    }

    setStep(3);
  };

  const handleResetOrDelete = () => {
    setTitle("");
    setPrice("");
    setLoc("");
    setDesc("");
    setImages([]);
    setCat("");
    setStep(1);
    toast({
      title: "Rascunho descartado 🗑️",
      description: "As informações do anúncio foram apagadas.",
    });
  };

  const submit = async () => {
    if (!cat) {
      toast({ variant: "destructive", title: "Erro", description: "Seleciona uma categoria." });
      return;
    }

    if (!isAuthenticated) {
      openAuthModal("/publicar");
      toast({
        title: "Sessão Necessária 🔐",
        description: "Inicia sessão ou cria uma conta para publicar o teu anúncio.",
      });
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const priceVal = parseFloat(price || "0");
    const calculatedPromoPrice = joinPromo 
      ? Math.round(priceVal * (1 - selectedDiscount / 100))
      : undefined;

    try {
      const sellerName = currentUser?.name || "Anunciante Aqkianda";
      const sellerPhone = currentUser?.phone || "+244 923 000 000";
      
      const listingId = isEditing && id ? id : "custom-" + Date.now();

      const newListing: Listing = {
        id: listingId,
        title: title,
        price: priceVal,
        currency: "AOA",
        condition: cond,
        location: loc,
        image: images[0] || "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80",
        featured: isPromoted,
        rating: 5.0,
        categoryId: cat,
        description: desc,
        postedAt: "Hoje",
        seller: sellerName,
        phone: sellerPhone,
        ...(joinPromo && {
          promoPrice: calculatedPromoPrice,
          promoDiscount: selectedDiscount,
          promoEventId: selectedPromoId
        })
      };

      // Handle promotional mappings in localStorage to sync with Admin and Perfil view
      try {
        const promoMappingsStr = localStorage.getItem("aqkianda-promotional-mappings");
        const promoMappings = promoMappingsStr ? JSON.parse(promoMappingsStr) : {};
        
        if (joinPromo && selectedPromoId) {
          const selectedEvent = promoEvents.find(e => e.id === selectedPromoId);
          promoMappings[listingId] = {
            promoEventId: selectedPromoId,
            promoDiscount: selectedDiscount,
            promoPrice: calculatedPromoPrice,
            promoEventName: selectedEvent ? selectedEvent.name : "Promoção"
          };
        } else {
          delete promoMappings[listingId];
        }
        localStorage.setItem("aqkianda-promotional-mappings", JSON.stringify(promoMappings));
      } catch (e) {
        console.error("Error updating promotional mapping", e);
      }

      const customListingsStr = localStorage.getItem("aqkianda-custom-listings");
      let customListings = customListingsStr ? JSON.parse(customListingsStr) : [];
      if (isEditing && id) {
        customListings = customListings.map((l: Listing) => l.id === id ? newListing : l);
      } else {
        customListings.push(newListing);
      }
      localStorage.setItem("aqkianda-custom-listings", JSON.stringify(customListings));
      
      // Also update running list in-memory
      const existingIdx = listings.findIndex(l => l.id === newListing.id);
      if (existingIdx !== -1) {
        listings[existingIdx] = newListing;
      } else {
        listings.push(newListing);
      }
    } catch (err) {
      console.error("Error saving custom listing:", err);
    }

    setIsSubmitting(false);
    setStep(4);

    toast({
      title: isEditing ? "Anúncio atualizado! 📝" : "Anúncio publicado! 🎉",
      description: isEditing ? "As tuas alterações foram guardadas com sucesso." : "O teu anúncio ficará online em breve.",
    });

    setTimeout(() => nav("/perfil?tab=anuncios"), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container py-10 max-w-3xl">
        <div className="mb-10">
          <h1 className="font-display font-bold text-4xl md:text-5xl">
            {isEditing ? "Editar anúncio" : "Publicar anúncio"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isEditing ? "Atualiza as informações do teu produto." : "Dá uma nova vida ao que já não usas."}
          </p>
        </div>

        {/* Multi-step indicator */}
        <div className="bg-card border border-border/40 rounded-2xl p-3 sm:p-4 mb-6 sm:mb-10 shadow-sm">
          <div className="flex items-center justify-between sm:justify-start sm:gap-6 overflow-x-auto no-scrollbar">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-smooth ${
                  step === s ? "bg-primary text-white shadow-sm" : 
                  step > s ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? <CheckCircle2 className="h-3.5 w-3.5 sm:h-5 sm:w-5" /> : s}
                </div>
                <span className={`text-xs sm:text-sm font-semibold ${step === s ? "text-primary" : "text-muted-foreground"}`}>
                  {s === 1 ? "Fotos" : s === 2 ? "Detalhes" : s === 3 ? "Revisão" : "Sucesso"}
                </span>
                {s < 4 && <div className="h-px w-4 sm:w-8 bg-border shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleGoToPreview} className="space-y-6 sm:space-y-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-border/40 shadow-card">
                  <h2 className="font-display font-semibold text-xl mb-2">Fotos do anúncio</h2>
                  <p className="text-sm text-muted-foreground mb-4">Uma boa imagem vende mais depressa. Adiciona até 8 fotos. <strong>Mínimo obrigatório: 2 fotos.</strong></p>

                  {images.length < 2 && (
                    <div className="flex items-center gap-2 mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-semibold border border-red-200 dark:border-red-900/30">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>É obrigatório adicionar pelo menos 2 fotografias para publicar o anúncio. Faltam {2 - images.length} foto(s).</span>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-border group">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-smooth shadow-lg"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        {i === 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-primary/90 text-primary-foreground text-[10px] font-bold uppercase text-center py-1">
                            Capa
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {images.length < 8 && (
                      <label className="aspect-square rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center cursor-pointer transition-smooth gap-2 text-muted-foreground hover:text-primary">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <ImagePlus className="h-6 w-6" />
                        </div>
                        <span className="text-xs font-semibold">Adicionar</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      </label>
                    )}
                  </div>
                </div>

                <Button 
                  type="button" 
                  size="lg" 
                  disabled={images.length < 2}
                  onClick={() => setStep(2)}
                  className="w-full h-14 rounded-full gradient-hero text-primary-foreground font-semibold"
                >
                  Continuar para detalhes <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-border/40 shadow-card space-y-6">
                  <h2 className="font-display font-semibold text-xl">Informações do produto</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider">Título do Anúncio</Label>
                      <Input 
                        id="title" 
                        required 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        placeholder="Ex: Samsung Galaxy S23 Ultra em perfeito estado" 
                        className="mt-2 h-12 rounded-xl bg-muted/30 border-transparent focus:bg-background focus:border-primary/20" 
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider">Categoria</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {getCategories().map(c => (
                          <button
                            type="button"
                            key={c.slug}
                            onClick={() => setCat(c.slug)}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-smooth border ${
                              cat === c.slug ? "gradient-hero text-primary-foreground border-transparent shadow-glow" : "bg-muted/30 border-transparent hover:border-border"
                            }`}
                          >{c.name}</button>
                        ))}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider">Condição</Label>
                        <div className="flex gap-2 mt-2">
                          {(["novo", "usado"] as const).map(c => (
                            <button
                              type="button"
                              key={c}
                              onClick={() => setCond(c)}
                              className={`flex-1 py-3 rounded-xl text-xs font-bold capitalize border transition-smooth ${
                                cond === c ? "gradient-hero text-primary-foreground border-transparent shadow-glow" : "bg-muted/30 border-transparent hover:border-border"
                              }`}
                            >{c}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="price" className="text-xs font-bold uppercase tracking-wider">Preço (AOA)</Label>
                        <Input 
                          id="price" 
                          type="number" 
                          required 
                          value={price} 
                          onChange={(e) => setPrice(e.target.value)} 
                          placeholder="0.00" 
                          className="mt-2 h-12 rounded-xl bg-muted/30 border-transparent focus:bg-background focus:border-primary/20" 
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="loc" className="text-xs font-bold uppercase tracking-wider">Localização</Label>
                      <Input 
                        id="loc" 
                        required 
                        value={loc} 
                        onChange={(e) => setLoc(e.target.value)} 
                        placeholder="Ex: Luanda, Talatona" 
                        className="mt-2 h-12 rounded-xl bg-muted/30 border-transparent focus:bg-background focus:border-primary/20" 
                      />
                    </div>

                    <div>
                      <Label htmlFor="desc" className="text-xs font-bold uppercase tracking-wider">Descrição Detalhada</Label>
                      <Textarea 
                        id="desc" 
                        required 
                        value={desc} 
                        onChange={(e) => setDesc(e.target.value)} 
                        rows={6} 
                        placeholder="Descreve o estado, acessórios incluídos e outros detalhes importantes..." 
                        className="mt-2 rounded-2xl bg-muted/30 border-transparent focus:bg-background focus:border-primary/20 resize-none" 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setStep(1)}
                    className="h-14 px-8 rounded-full font-semibold"
                  >
                    Voltar
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 h-14 rounded-full gradient-hero text-primary-foreground shadow-glow font-semibold"
                  >
                    Ver Pré-visualização <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-border/40 shadow-card space-y-6 sm:space-y-8">
                  <div>
                    <h2 className="font-display font-semibold text-2xl">Pré-visualização do Anúncio</h2>
                    <p className="text-sm text-muted-foreground mt-1">Vê como o teu anúncio ficará visível para os compradores.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8 items-start">
                    {/* Visualizer card */}
                    <div className="space-y-4">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">O Seu Card de Anúncio</Label>
                      <div className="p-4 rounded-3xl bg-muted/20 border border-border/40 flex justify-center">
                        <div className="w-full max-w-[280px]">
                          <ListingCard 
                            listing={{
                              id: "preview-id",
                              title: title || "Sem Título",
                              price: parseFloat(price || "0"),
                              currency: "AOA",
                              condition: cond,
                              location: loc || "Sem Localização",
                              image: images[0] || "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80",
                              featured: isPromoted,
                              rating: 5.0,
                              categoryId: cat || "eletronica",
                              description: desc || "Sem descrição",
                              postedAt: "Hoje",
                              seller: "Você",
                              phone: "+244 923 000 000",
                              promoPrice: joinPromo ? Math.round(parseFloat(price || "0") * (1 - selectedDiscount / 100)) : undefined,
                              promoDiscount: joinPromo ? selectedDiscount : undefined,
                              promoEventId: joinPromo ? selectedPromoId : undefined,
                            }} 
                            index={0} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Controls & Promotion */}
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Promoção & Campanhas Oficiais</Label>
                        <div 
                          onClick={() => setJoinPromo(!joinPromo)}
                          className={`p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${
                            joinPromo 
                              ? "bg-primary/5 border-primary shadow-sm" 
                              : "bg-muted/10 border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl shrink-0 ${joinPromo ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                              <Percent className="h-6 w-6" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm">Aderir à Promoção da Plataforma</span>
                                <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${joinPromo ? "bg-primary border-primary text-white" : "border-muted-foreground/30"}`}>
                                  {joinPromo && <Check className="h-3 w-3 stroke-[3]" />}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Adira a um evento promocional ativo criado pelo administrador para destacar o seu anúncio e ganhar visibilidade oficial.
                              </p>
                            </div>
                          </div>
                        </div>

                        {joinPromo && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }} 
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4 pt-2"
                          >
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selecionar Evento de Promoção</Label>
                              {promoEvents.length === 0 ? (
                                <div className="p-4 rounded-xl bg-muted/20 border border-dashed text-center text-xs text-muted-foreground">
                                  Nenhum evento promocional ativo no momento.
                                </div>
                              ) : (
                                <select
                                  value={selectedPromoId}
                                  onChange={(e) => {
                                    setSelectedPromoId(e.target.value);
                                    const found = promoEvents.find(ev => ev.id === e.target.value);
                                    if (found && found.discounts && found.discounts.length > 0) {
                                      setSelectedDiscount(found.discounts[0]);
                                    }
                                  }}
                                  className="w-full h-12 px-4 rounded-xl bg-muted/30 border border-border/40 focus:outline-none focus:border-primary/40 text-sm font-medium"
                                >
                                  {promoEvents.map((e) => (
                                    <option key={e.id} value={e.id}>
                                      {e.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {selectedPromoId && (
                              <div className="p-4 rounded-2xl bg-muted/25 border border-border/40 space-y-3">
                                <p className="text-xs text-muted-foreground">
                                  {promoEvents.find(e => e.id === selectedPromoId)?.description || "Inscrição com preço de desconto."}
                                </p>
                                
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Escolher Percentagem de Desconto</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {(promoEvents.find(e => e.id === selectedPromoId)?.discounts || [10, 15, 20, 25, 30]).map((disc: number) => (
                                      <button
                                        type="button"
                                        key={disc}
                                        onClick={() => setSelectedDiscount(disc)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 border-2 ${
                                          selectedDiscount === disc 
                                            ? "bg-primary border-primary text-white" 
                                            : "bg-background border-border/40 hover:border-muted-foreground/30 text-foreground"
                                        }`}
                                      >
                                        -{disc}%
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-border/40 flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground font-medium">Preço com Desconto:</span>
                                  <span className="font-bold text-primary text-sm">
                                    {Math.round(parseFloat(price || "0") * (1 - selectedDiscount / 100)).toLocaleString("pt-AO")} AOA
                                  </span>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>

                      {/* Detail overview */}
                      <div className="p-5 rounded-2xl bg-muted/20 border border-border/40 space-y-3 text-sm">
                        <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Resumo dos Detalhes</h4>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                          <span className="text-muted-foreground font-medium">Categoria:</span>
                          <span className="font-semibold text-right text-foreground">{categories.find(c => c.slug === cat)?.name || "Nenhuma"}</span>
                          
                          <span className="text-muted-foreground font-medium">Condição:</span>
                          <span className="font-semibold capitalize text-right text-foreground">{cond}</span>
                          
                          <span className="text-muted-foreground font-medium">Localização:</span>
                          <span className="font-semibold text-right text-foreground">{loc}</span>

                          <span className="text-muted-foreground font-medium">Preço Original:</span>
                          <span className="font-semibold text-right text-foreground">{parseFloat(price || "0").toLocaleString("pt-AO")} AOA</span>

                          {joinPromo && (
                            <>
                              <span className="text-primary font-medium">Evento Participante:</span>
                              <span className="font-bold text-right text-primary text-xs shrink-0">
                                {promoEvents.find(e => e.id === selectedPromoId)?.name || "Promoção Ativa"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setStep(2)}
                    className="h-14 flex-1 rounded-full font-semibold border-border hover:bg-muted"
                  >
                    <Edit className="h-4 w-4 mr-2" /> Editar Detalhes
                  </Button>
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleResetOrDelete}
                    className="h-14 px-6 rounded-full font-semibold"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Apagar
                  </Button>
                  <Button 
                    type="button" 
                    disabled={isSubmitting}
                    onClick={submit}
                    className="h-14 flex-[1.5] rounded-full gradient-hero text-primary-foreground shadow-glow font-semibold"
                  >
                    {isSubmitting ? "A publicar..." : isEditing ? "Guardar Alterações" : "Publicar Anúncio"} <Check className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-[3rem] p-12 border border-border/40 shadow-elevated text-center space-y-6"
              >
                <div className="h-24 w-24 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <h2 className="font-display font-bold text-4xl text-foreground">Anúncio Publicado!</h2>
                <p className="text-muted-foreground text-lg max-w-sm mx-auto">
                  Excelente! O teu anúncio já está disponível para milhares de compradores em toda Angola.
                </p>
                <div className="pt-6">
                  <Button 
                    type="button"
                    onClick={() => nav("/")}
                    className="rounded-full px-12 h-14 gradient-hero text-primary-foreground shadow-glow font-semibold"
                  >
                    Ir para o início
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </section>
      <Footer />
    </div>
  );
};

export default Publicar;
