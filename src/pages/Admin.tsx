import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldCheck, ShieldAlert, Users, Package, Pin, AlertTriangle, 
  Trash2, MessageSquare, Search, ArrowLeft, CheckCircle2, 
  Eye, TrendingUp, Sparkles, Send, Mail, Phone, Calendar, Plus, Megaphone,
  Upload, Image as ImageIcon, Link as LinkIcon, FolderPlus, Tag, Laptop, ShoppingBag,
  Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Smartphone,
  LineChart, Share2, Globe
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from "recharts";
import { getGlobalTrafficHistory, DailyTrafficRecord } from "@/utils/analytics";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { listings, formatPrice, Listing, slugify, Category, getCategories, saveCategories } from "@/data/listings";
import { getListingAnalyticsMap, getListingStats } from "@/utils/analytics";
import { useToast } from "@/hooks/use-toast";
import { useRatings } from "@/context/RatingsContext";
import { useAuth, getAuthHeaders } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { getAppUrl } from "@/config/urls";
import { compressImage } from "@/utils/imageCompression";

// Standard mock seed reports if localStorage is empty
const SEED_REPORTS = [
  {
    id: "rep-1",
    listingId: "1",
    listingTitle: "iPhone 13 Pro Max 256GB",
    listingImage: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=800&q=80",
    listingPrice: 650000,
    listingCurrency: "AOA",
    sellerName: "João Manuel",
    reason: "Preço abusivo",
    text: "O preço anunciado está muito acima do valor médio praticado pelo mercado para um iPhone 13 Pro Max usado.",
    reportedAt: "08/07/2026",
    status: "Pendente"
  },
  {
    id: "rep-2",
    listingId: "9",
    listingTitle: "Samsung Galaxy S23 Ultra",
    listingImage: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80",
    listingPrice: 580000,
    listingCurrency: "AOA",
    sellerName: "Ana Correia",
    reason: "Suspeita de Fraude",
    text: "A vendedora exige sinal de 50% por transferência expressa antes de mostrar o telemóvel pessoalmente. Cuidado.",
    reportedAt: "09/07/2026",
    status: "Pendente"
  }
];

const DEFAULT_SLIDES = [
  {
    id: "b1",
    title: "Grande Inauguração Aqkianda",
    subtitle: "A maior plataforma de negócios em Angola chegou! Descontos especiais de parceiros.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
    link: "/explorar",
    buttonText: "Explorar Ofertas",
    isActive: true
  },
  {
    id: "b2",
    title: "Campanha Cacimbo Tech",
    subtitle: "Smartphones, Laptops e Acessórios com até 30% de desconto real.",
    image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
    link: "/explorar?cat=eletronica",
    buttonText: "Ver Tecnologia",
    isActive: true
  },
  {
    id: "b3",
    title: "Automóveis & Imóveis",
    subtitle: "Encontre os melhores carros e casas de Luanda às melhores condições.",
    image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80",
    link: "/explorar?cat=viaturas",
    buttonText: "Ver Imóveis",
    isActive: true
  }
];

const DEFAULT_EVENTS = [
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

const AVAILABLE_CATEGORY_ICONS = [
  { label: "Etiqueta / Geral", value: "Tag" },
  { label: "Smartphone / Tecnologia", value: "Smartphone" },
  { label: "Computadores / Laptops", value: "Laptop" },
  { label: "Viaturas / Automóveis", value: "Car" },
  { label: "Imóveis / Casas", value: "Home" },
  { label: "Moda / Vestuário", value: "Shirt" },
  { label: "Móveis / Casa & Jardim", value: "Sofa" },
  { label: "Desporto / Fitness", value: "Dumbbell" },
  { label: "Empregos / Serviços", value: "Briefcase" },
  { label: "Ferramentas / Reparações", value: "Wrench" },
  { label: "Compras / Lojas", value: "ShoppingBag" },
  { label: "Especial / Destaques", value: "Sparkles" },
  { label: "Caixa / Diversos", value: "Package" }
];

const Admin = () => {
  useDocumentMetadata({
    title: "Painel de Controlo & Administração",
    description: "Gestão completa de anúncios, vendedores, denúncias e métricas do Aqkianda.",
  });

  const { toast } = useToast();
  const navigate = useNavigate();
  const { getListingRating } = useRatings();
  const [activeTab, setActiveTab] = useState<"anuncios" | "denuncias" | "vendedores" | "slides" | "promocoes" | "categorias" | "analytics">("anuncios");
  const [analyticsRange, setAnalyticsRange] = useState<"today" | "7d" | "30d">("7d");
  
  // Search state
  const [adsSearch, setAdsSearch] = useState("");
  const [sellersSearch, setSellersSearch] = useState("");

  // Categories management state
  const [customCategories, setCustomCategories] = useState<Category[]>(getCategories);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("Tag");
  const [newCatDesc, setNewCatDesc] = useState("");

  // Loaded states from localStorage
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [reports, setReports] = useState<typeof SEED_REPORTS>([]);
  const [registeredUsers, setRegisteredUsers] = useState<typeof SEED_USERS>([]);

  // Slideshow banners & Promo events states
  const [slides, setSlides] = useState<Array<{ id: string; title: string; subtitle: string; image: string; link: string; listingId?: string; buttonText: string }>>([]);
  const [promoEvents, setPromoEvents] = useState<Array<{ id: string; title: string; discountText: string; expiresAt: string; categorySlug: string; image: string }>>([]);

  // Banners form state
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [bannerLink, setBannerLink] = useState("");
  const [bannerButtonText, setBannerButtonText] = useState("Ver Oferta");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Top Banner Alert State
  const [topBannerText, setTopBannerText] = useState("Envia os teus artigos de forma simples e direta. Sem comissões de venda no Aqkianda!");

  // Promos form state
  const [promoName, setPromoName] = useState("");
  const [promoDesc, setPromoDesc] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");

  // Message modal state
  const [isMsgModalOpen, setIsMsgModalOpen] = useState(false);
  const [msgTargetSeller, setMsgTargetSeller] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgText, setMsgText] = useState("");
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  const { isAdmin } = useAuth();
  // Authorization check state
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  // Load Admin Data from API & localStorage on mount
  useEffect(() => {
    setIsAuthorized(isAdmin);

    // Scroll to top
    window.scrollTo(0, 0);

    // 1. Pinned IDs
    const savedPinned = localStorage.getItem("aqkianda-pinned-ids");
    if (savedPinned) {
      setPinnedIds(JSON.parse(savedPinned));
    } else {
      const defaultPinned = listings.filter(l => l.featured).map(l => l.id);
      setPinnedIds(defaultPinned);
      localStorage.setItem("aqkianda-pinned-ids", JSON.stringify(defaultPinned));
    }

    // 2. Reports from Backend API
    fetch("/api/reports", {
      headers: { ...getAuthHeaders() }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((r: { id: string; listingId: string; listingTitle?: string; reporterName?: string; reason: string; details: string; createdAt?: string; status?: string }) => ({
            id: r.id,
            listingId: r.listingId,
            listingTitle: r.listingTitle || "Anúncio",
            listingImage: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=800&q=80",
            listingPrice: 0,
            listingCurrency: "AOA",
            sellerName: r.reporterName || "Utilizador",
            reason: r.reason,
            text: r.details,
            reportedAt: r.createdAt || "Hoje",
            status: r.status || "Pendente"
          }));
          setReports(mapped);
          localStorage.setItem("aqkianda-reports", JSON.stringify(mapped));
        } else {
          const savedReports = localStorage.getItem("aqkianda-reports");
          if (savedReports) setReports(JSON.parse(savedReports));
          else setReports(SEED_REPORTS);
        }
      })
      .catch(() => {
        const savedReports = localStorage.getItem("aqkianda-reports");
        if (savedReports) setReports(JSON.parse(savedReports));
        else setReports(SEED_REPORTS);
      });

    // 3. Registered Users from Backend API
    fetch("/api/admin/users", {
      headers: {
        ...getAuthHeaders()
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRegisteredUsers(data);
        }
      })
      .catch(err => console.debug("Error loading admin users from API:", err));

    // 4. Slideshow banners from Backend API
    fetch("/api/banners")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSlides(data);
          localStorage.setItem("aqkianda-slideshow-banners", JSON.stringify(data));
        } else {
          const savedSlides = localStorage.getItem("aqkianda-slideshow-banners");
          if (savedSlides) setSlides(JSON.parse(savedSlides));
          else setSlides(DEFAULT_SLIDES);
        }
      })
      .catch(() => {
        const savedSlides = localStorage.getItem("aqkianda-slideshow-banners");
        if (savedSlides) setSlides(JSON.parse(savedSlides));
        else setSlides(DEFAULT_SLIDES);
      });

    // 5. Promo events
    const savedPromos = localStorage.getItem("aqkianda-promo-events");
    if (savedPromos) {
      setPromoEvents(JSON.parse(savedPromos));
    } else {
      setPromoEvents(DEFAULT_EVENTS);
      localStorage.setItem("aqkianda-promo-events", JSON.stringify(DEFAULT_EVENTS));
    }

    // 6. Top alert banner text
    const savedTopBanner = localStorage.getItem("aqkianda-top-banner-text");
    if (savedTopBanner) {
      setTopBannerText(savedTopBanner);
    }
  }, []);

  // Sync pinned list with localStorage & listings property updates
  const togglePinListing = (listingId: string) => {
    let updatedPinned: string[];
    if (pinnedIds.includes(listingId)) {
      updatedPinned = pinnedIds.filter(id => id !== listingId);
      toast({
        title: "Anúncio desafixado",
        description: "O anúncio já não será destacado com prioridade na página principal."
      });
    } else {
      updatedPinned = [...pinnedIds, listingId];
      toast({
        title: "Anúncio afixado! 📌",
        description: "O anúncio agora aparecerá destacado com prioridade na página principal."
      });
    }
    setPinnedIds(updatedPinned);
    localStorage.setItem("aqkianda-pinned-ids", JSON.stringify(updatedPinned));
    
    // Trigger event to make listings update dynamically across frames/components
    window.dispatchEvent(new Event("storage"));
  };

  // Create promotion event
  const handleCreatePromoEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoName || !promoDesc || !promoStart || !promoEnd) {
      toast({ variant: "destructive", title: "Erro", description: "Por favor, preencha todos os campos do evento." });
      return;
    }
    const newEvent = {
      id: "e-" + Date.now(),
      name: promoName,
      description: promoDesc,
      startDate: promoStart,
      endDate: promoEnd,
      discounts: [10, 15, 20, 25, 30, 50],
      status: "active",
      createdAt: new Date().toISOString()
    };
    const updated = [newEvent, ...promoEvents];
    setPromoEvents(updated);
    localStorage.setItem("aqkianda-promo-events", JSON.stringify(updated));

    // Also trigger seller notification
    const notificationsStr = localStorage.getItem("aqkianda-seller-notifications") || "[]";
    const notifications = JSON.parse(notificationsStr);
    const newNotification = {
      id: "not-" + Date.now(),
      title: "Novo Evento de Promoção Disponível! 🎉",
      message: `O administrador criou o evento de promoção "${promoName}" decorrendo de ${promoStart} até ${promoEnd}. Adira já com os seus anúncios no seu painel para ganhar destaque nacional e atrair mais clientes!`,
      date: new Date().toLocaleDateString("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      eventId: newEvent.id,
      read: false
    };
    notifications.unshift(newNotification);
    localStorage.setItem("aqkianda-seller-notifications", JSON.stringify(notifications));

    // Reset fields
    setPromoName("");
    setPromoDesc("");
    setPromoStart("");
    setPromoEnd("");

    toast({
      title: "Evento criado com sucesso! 🚀",
      description: "Todos os vendedores foram notificados para aderir ao evento."
    });
  };

  // Delete promo event
  const handleDeletePromoEvent = (id: string) => {
    const updated = promoEvents.filter(e => e.id !== id);
    setPromoEvents(updated);
    localStorage.setItem("aqkianda-promo-events", JSON.stringify(updated));
    toast({
      title: "Evento removido",
      description: "O evento foi eliminado do sistema."
    });
  };

  // Save Top Alert Banner Text
  const handleSaveTopBannerText = () => {
    localStorage.setItem("aqkianda-top-banner-text", topBannerText);
    toast({
      title: "Aviso Guardado! 📢",
      description: "O texto da barra superior de aviso foi atualizado com sucesso.",
    });
  };

  // Handle uploading banner image from computer with gentle compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        toast({ title: "A processar imagem... ⏳", description: "Otimizando imagem para exibição rápida." });
        const compressed = await compressImage(file, { maxDimension: 1920, quality: 0.88 });
        if (!compressed) return;

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...getAuthHeaders()
            },
            body: JSON.stringify({ image: compressed, name: file.name })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              setBannerImage(data.url);
              toast({ title: "Imagem carregada! 📷", description: "Imagem comprimida e guardada no Cloudflare R2 com sucesso." });
              return;
            }
          }
        } catch (uploadErr) {
          console.debug("Banner upload fallback:", uploadErr);
        }

        setBannerImage(compressed);
        toast({ title: "Imagem pronta! 📷", description: "Imagem comprimida e pronta para o banner." });
      } catch (err) {
        console.error("Erro ao comprimir banner:", err);
        toast({ variant: "destructive", title: "Erro na imagem", description: "Não foi possível processar o ficheiro." });
      }
    }
  };

  // Promote published listing directly to Slideshow Banner using its image
  const handleAddListingToBanner = (listing: Listing) => {
    const firstImage = listing.image;
    const targetLink = `/anuncio/${listing.id}/${slugify(listing.title)}`;
    
    const newBanner = {
      id: "b-listing-" + listing.id + "-" + Date.now(),
      title: listing.title,
      subtitle: `${formatPrice(listing.price, listing.currency)} — Vendedor: ${listing.seller}`,
      image: firstImage,
      link: targetLink,
      listingId: listing.id,
      buttonText: "Ver Anúncio",
      isActive: true
    };

    const updated = [...slides, newBanner];
    setSlides(updated);
    localStorage.setItem("aqkianda-slideshow-banners", JSON.stringify(updated));

    // Sync to backend API
    fetch("/api/banners", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(newBanner)
    }).catch(err => console.debug("Banner sync:", err));

    toast({
      title: "Adicionado ao Banner! 🖼️",
      description: `O anúncio "${listing.title}" com a primeira imagem foi publicado nos banners de destaque.`,
    });
  };

  // Create slideshow banner (Title, Subtitle, Description & Link are optional!)
  const handleCreateBanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerImage) {
      toast({ variant: "destructive", title: "Imagem obrigatória", description: "Por favor selecione uma imagem do computador ou insira o URL da imagem." });
      return;
    }
    const newBanner = {
      id: "b-" + Date.now(),
      title: bannerTitle || "",
      subtitle: bannerSubtitle || "",
      image: bannerImage,
      link: bannerLink || "",
      buttonText: bannerButtonText || "Ver Mais",
      isActive: true
    };
    const updated = [...slides, newBanner];
    setSlides(updated);
    localStorage.setItem("aqkianda-slideshow-banners", JSON.stringify(updated));

    // Sync to backend API
    fetch("/api/banners", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(newBanner)
    }).catch(err => console.debug("Banner sync:", err));

    // Reset fields
    setBannerTitle("");
    setBannerSubtitle("");
    setBannerImage("");
    setBannerLink("");
    setBannerButtonText("Ver Oferta");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    toast({
      title: "Slide de anúncio adicionado! 🖼️",
      description: "O carrossel da página inicial foi atualizado."
    });
  };

  // Delete slideshow banner
  const handleDeleteBanner = (id: string) => {
    const updated = slides.filter(s => s.id !== id);
    setSlides(updated);
    localStorage.setItem("aqkianda-slideshow-banners", JSON.stringify(updated));

    // Sync to backend API
    fetch(`/api/banners/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    }).catch(err => console.debug("Banner delete sync:", err));

    toast({
      title: "Slide removido",
      description: "O slide foi retirado do carrossel principal."
    });
  };

  // Delete a listing
  const handleDeleteListing = async (listingId: string) => {
    if (confirm("Tem certeza que deseja remover este anúncio de forma permanente?")) {
      const listingToDelete = listings.find(l => l.id === listingId);

      const removedIds = JSON.parse(localStorage.getItem("aqkianda-removed-ids") || "[]");
      removedIds.push(listingId);
      localStorage.setItem("aqkianda-removed-ids", JSON.stringify(removedIds));
      
      // Mutate listings array in-memory
      const idx = listings.findIndex(l => l.id === listingId);
      if (idx !== -1) {
        listings.splice(idx, 1);
      }
      
      // Dispatch storage event to trigger dynamic updates across frames
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("aqkianda-listings-updated"));

      // Chamar backend para eliminar o anúncio do MySQL e purgar do Cloudflare R2
      try {
        await fetch(`/api/listings/${listingId}`, { 
          method: "DELETE",
          headers: getAuthHeaders()
        });

        if (listingToDelete) {
          const urlsToDelete: string[] = [];
          if (listingToDelete.image) urlsToDelete.push(listingToDelete.image);
          if (listingToDelete.images && Array.isArray(listingToDelete.images)) {
            urlsToDelete.push(...listingToDelete.images);
          }
          if (urlsToDelete.length > 0) {
            await fetch("/api/storage/delete", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                ...getAuthHeaders()
              },
              body: JSON.stringify({ urls: urlsToDelete })
            });
          }
        }
      } catch (err) {
        console.debug("Backend delete sync:", err);
      }

      toast({
        title: "Anúncio removido",
        description: "O anúncio e as suas imagens foram retirados de circulação e do Cloudflare R2 com sucesso.",
        variant: "destructive"
      });

      // Update reports if the listing was reported
      const updatedReports = reports.map(r => r.listingId === listingId ? { ...r, status: "Removido" } : r);
      setReports(updatedReports);
      localStorage.setItem("aqkianda-reports", JSON.stringify(updatedReports));
    }
  };

  // Handle report actions
  const handleResolveReport = (reportId: string, status: "Resolvido" | "Ignorado") => {
    const updatedReports = reports.map(r => r.id === reportId ? { ...r, status } : r);
    setReports(updatedReports);
    localStorage.setItem("aqkianda-reports", JSON.stringify(updatedReports));
    toast({
      title: status === "Resolvido" ? "Denúncia resolvida" : "Denúncia ignorada",
      description: `O estado da denúncia foi atualizado para ${status}.`
    });
  };

  // Open support message modal
  const openMessageModal = (sellerName: string, subject: string = "Contacto da Equipa Aqkianda") => {
    setMsgTargetSeller(sellerName);
    setMsgSubject(subject);
    setMsgText("");
    setIsMsgModalOpen(true);
  };

  // Send Admin message on behalf of Aqkianda Team
  const handleSendAdminMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    setIsSendingMsg(true);
    setTimeout(() => {
      try {
        const DEFAULT_CONVERSATIONS = [
          { id: "1", name: "Tech Luanda", last: "Boa tarde, ainda está disponível?", time: "14:32", unread: 2, avatar: "TL", product: "iPhone 13 Pro Max 256GB" },
          { id: "2", name: "Kalandula Motors", last: "Posso negociar o preço.", time: "12:18", unread: 0, avatar: "KM", product: "Toyota Hilux 2020 4x4" },
        ];
        const DEFAULT_MESSAGES = {
          "1": [{ from: "them", text: "Boa tarde! Ainda tem disponível?", time: "14:30" }]
        };

        const conversations = JSON.parse(localStorage.getItem("aqkianda-conversations") || JSON.stringify(DEFAULT_CONVERSATIONS));
        const messages = JSON.parse(localStorage.getItem("aqkianda-messages") || JSON.stringify(DEFAULT_MESSAGES));

        const convId = `admin-msg-${Date.now()}`;
        const newConv = {
          id: convId,
          name: "Equipa Aqkianda", // The seller sees it comes from Team Aqkianda
          last: msgText,
          time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          unread: 1,
          avatar: "AQ",
          product: msgSubject
        };

        const newMsgs = [
          {
            from: "them", // Loaded in seller inbox, "them" represents Aqkianda Admin Team
            text: `[Equipa Aqkianda - NOTIFICAÇÃO OFICIAL]\n\nAssunto: ${msgSubject}\n\n${msgText}`,
            time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
          }
        ];

        const updatedConvs = [newConv, ...conversations];
        const updatedMsgs = { ...messages, [convId]: newMsgs };

        localStorage.setItem("aqkianda-conversations", JSON.stringify(updatedConvs));
        localStorage.setItem("aqkianda-messages", JSON.stringify(updatedMsgs));

        toast({
          title: "Mensagem oficial enviada! ✉️",
          description: `A sua mensagem oficial em nome da equipa Aqkianda foi enviada para ${msgTargetSeller}.`
        });
      } catch (err) {
        console.error("Error sending admin message:", err);
      }

      setIsSendingMsg(false);
      setIsMsgModalOpen(false);
      setMsgText("");
    }, 1500);
  };

  // Create new category handler
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Insira o nome da categoria.",
      });
      return;
    }

    const slug = newCatSlug.trim() ? slugify(newCatSlug) : slugify(newCatName);

    if (customCategories.some((c) => c.slug === slug)) {
      toast({
        variant: "destructive",
        title: "Categoria existente",
        description: "Já existe uma categoria com este slug ou identificador.",
      });
      return;
    }

    const newCat: Category = {
      slug,
      name: newCatName.trim(),
      icon: newCatIcon || "Tag",
    };

    const updated = [...customCategories, newCat];
    setCustomCategories(updated);
    saveCategories(updated);

    setNewCatName("");
    setNewCatSlug("");
    setNewCatDesc("");
    setNewCatIcon("Tag");

    toast({
      title: "Categoria criada! 📁",
      description: `A categoria "${newCat.name}" foi adicionada com sucesso.`,
    });
  };

  // Delete category handler
  const handleDeleteCategory = (slugToDelete: string) => {
    if (customCategories.length <= 1) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "Deve manter pelo menos 1 categoria no sistema.",
      });
      return;
    }

    const catName = customCategories.find((c) => c.slug === slugToDelete)?.name || slugToDelete;
    const updated = customCategories.filter((c) => c.slug !== slugToDelete);

    setCustomCategories(updated);
    saveCategories(updated);

    toast({
      title: "Categoria removida",
      description: `A categoria "${catName}" foi removida do sistema.`,
    });
  };

  // Gather active listings filtered by removal
  const getActiveListings = () => {
    const removedIds = JSON.parse(localStorage.getItem("aqkianda-removed-ids") || "[]");
    return listings.filter(l => !removedIds.includes(l.id));
  };

  const activeListings = getActiveListings();

  // Dynamic calculations for stats
  const totalSellersCount = new Set(activeListings.map(l => l.seller)).size + registeredUsers.length - SEED_USERS.length;
  const totalAdsCount = activeListings.length;
  const pendingReportsCount = reports.filter(r => r.status === "Pendente").length;
  const totalPinnedCount = pinnedIds.filter(id => activeListings.some(l => l.id === id)).length;

  // Real Analytics calculations
  const analyticsMap = getListingAnalyticsMap();
  let totalRealViews = 0;
  let totalRealViewsNew = 0;
  let totalRealViewsRegistered = 0;
  let totalRealClicks = 0;

  activeListings.forEach((l) => {
    const stats = analyticsMap[l.id];
    if (stats) {
      totalRealViews += stats.views || 0;
      totalRealViewsNew += stats.viewsNew || Math.floor((stats.views || 0) * 0.7);
      totalRealViewsRegistered += stats.viewsRegistered || ((stats.views || 0) - Math.floor((stats.views || 0) * 0.7));
      totalRealClicks += stats.clicks || 0;
    }
  });

  // Load global traffic history with live MySQL database sync
  const [rawTrafficHistory, setRawTrafficHistory] = useState<DailyTrafficRecord[]>([]);

  useEffect(() => {
    // Initialize immediately from LocalStorage to prevent layout shift or empty screens
    setRawTrafficHistory(getGlobalTrafficHistory());

    // Fetch real-time traffic history from MySQL backend
    fetch("/api/analytics/traffic")
      .then((res) => {
        if (!res.ok) throw new Error("Erro de rede");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRawTrafficHistory(data);
        }
      })
      .catch((err) => {
        console.warn("Lendo tráfego local; erro ao obter dados do MySQL:", err);
      });
  }, []);

  // Filter history by range
  const filteredTraffic = useMemo(() => {
    if (analyticsRange === "today") {
      return rawTrafficHistory.slice(-2); // return today and yesterday
    } else if (analyticsRange === "7d") {
      return rawTrafficHistory.slice(-7);
    } else {
      return rawTrafficHistory.slice(-30);
    }
  }, [rawTrafficHistory, analyticsRange]);

  // Totals calculations
  const totalStats = useMemo(() => {
    let views = 0;
    let viewsNew = 0;
    let viewsRegistered = 0;
    let shares = 0;
    let signups = 0;
    let direct = 0;
    let search = 0;
    let shareLink = 0;
    let whatsapp = 0;

    const dataToSum = analyticsRange === "today" 
      ? rawTrafficHistory.slice(-1)
      : filteredTraffic;

    dataToSum.forEach((day) => {
      views += day.viewsTotal || 0;
      viewsNew += day.viewsNew || 0;
      viewsRegistered += day.viewsRegistered || 0;
      shares += day.shares || 0;
      signups += day.signups || 0;
      direct += day.direct || 0;
      search += day.search || 0;
      shareLink += day.shareLink || 0;
      whatsapp += day.whatsapp || 0;
    });

    return {
      views,
      viewsNew,
      viewsRegistered,
      shares,
      signups,
      direct,
      search,
      shareLink,
      whatsapp
    };
  }, [filteredTraffic, rawTrafficHistory, analyticsRange]);

  // Filter listings
  const filteredListings = activeListings.filter(l => {
    const term = adsSearch.toLowerCase();
    return l.title.toLowerCase().includes(term) || l.seller.toLowerCase().includes(term) || l.location.toLowerCase().includes(term);
  });

  // Filter sellers
  const uniqueSellersMap = new Map();
  // Group counts
  activeListings.forEach(l => {
    if (!uniqueSellersMap.has(l.seller.toLowerCase())) {
      uniqueSellersMap.set(l.seller.toLowerCase(), {
        name: l.seller,
        adsCount: 0,
        email: `${l.seller.toLowerCase().replace(/\s+/g, "")}@email.ao`,
        phone: l.phone || "923 111 222",
        registeredAt: "Antes de 2026",
        avatar: l.seller.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
      });
    }
    const s = uniqueSellersMap.get(l.seller.toLowerCase());
    s.adsCount += 1;
  });

  // Merge in explicit registered users
  registeredUsers.forEach(u => {
    const key = u.name.toLowerCase();
    const existing = uniqueSellersMap.get(key);
    if (existing) {
      existing.email = u.email;
      existing.phone = u.phone;
      existing.registeredAt = u.registeredAt;
    } else {
      uniqueSellersMap.set(key, {
        name: u.name,
        adsCount: activeListings.filter(l => l.seller.toLowerCase() === key).length,
        email: u.email,
        phone: u.phone,
        registeredAt: u.registeredAt,
        avatar: u.avatar
      });
    }
  });

  const sellersList = Array.from(uniqueSellersMap.values());
  const filteredSellers = sellersList.filter(s => {
    const term = sellersSearch.toLowerCase();
    return s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term);
  });

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm mt-4">A verificar autorização...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="p-4 rounded-full bg-rose-500/10 text-rose-500 mb-6">
            <ShieldAlert className="h-16 w-16" />
          </div>
          <h1 className="font-display font-bold text-2xl mb-2">Acesso Restrito</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Desculpe, esta página é reservada exclusivamente para o administrador autorizado da plataforma Aqkianda.
          </p>
          <div className="flex flex-col gap-2 w-full">
            <Button onClick={() => navigate("/")} className="w-full rounded-xl">
              Voltar para a Página Inicial
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)} className="w-full rounded-xl">
              Voltar atrás
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const appBaseUrl = getAppUrl();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container py-8">
        {/* Navigation & Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2 cursor-pointer" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-2xl bg-[#DC2626]/10 text-[#DC2626] dark:text-red-400">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <h1 className="font-display font-bold text-3xl md:text-4xl">Painel de Controlo Aqkianda</h1>
                <p className="text-muted-foreground text-sm">Controle de qualidade, moderação e destaque de anúncios de Angola.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground shadow-sm">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[11px] text-foreground font-semibold truncate max-w-[200px]" title={appBaseUrl}>
                {appBaseUrl}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Modo Administrador Activo</span>
            </div>
          </div>
        </div>

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
          {/* Sellers Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Vendedores</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono">{sellersList.length}</h3>
            </div>
          </motion.div>

          {/* Listings Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-[#DC2626]/10 text-[#DC2626] flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Anúncios</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono">{totalAdsCount}</h3>
            </div>
          </motion.div>

          {/* Real Views Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Visitas Reais</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono text-emerald-600 dark:text-emerald-400">{totalRealViews}</h3>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-semibold mt-1">
                <span className="text-sky-600 dark:text-sky-400">Novos: {totalRealViewsNew}</span>
                <span className="text-indigo-600 dark:text-indigo-400">Inscritos: {totalRealViewsRegistered}</span>
              </div>
            </div>
          </motion.div>

          {/* Real Clicks Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Cliques Reais</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono text-purple-600 dark:text-purple-400">{totalRealClicks}</h3>
            </div>
          </motion.div>

          {/* Pinned Ads Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Pin className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Destaques</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono">{totalPinnedCount}</h3>
            </div>
          </motion.div>

          {/* Active Reports Stat */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm flex items-center gap-3 hover:border-primary/20 transition-all relative overflow-hidden"
          >
            {pendingReportsCount > 0 && (
              <div className="absolute top-0 right-0 h-2 w-2 bg-rose-500" />
            )}
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Denúncias</p>
              <h3 className="font-display font-bold text-xl sm:text-2xl mt-0.5 font-mono text-rose-500">{pendingReportsCount}</h3>
            </div>
          </motion.div>
        </div>

        {/* Tab Controls - Responsive Scrollable Bar */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-border mb-6 gap-1 pb-1">
          <button
            onClick={() => setActiveTab("anuncios")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "anuncios" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-4 w-4" />
            Afixar & Moderar
          </button>
          <button
            onClick={() => setActiveTab("denuncias")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "denuncias" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-rose-500"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Denúncias
            {pendingReportsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold">
                {pendingReportsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("vendedores")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "vendedores" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            Vendedores
          </button>
          <button
            onClick={() => setActiveTab("slides")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "slides" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Slide Banners
          </button>
          <button
            onClick={() => setActiveTab("promocoes")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "promocoes" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Promoções
          </button>
          <button
            onClick={() => setActiveTab("categorias")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "categorias" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderPlus className="h-4 w-4" />
            Gerir Categorias
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono text-[9px] font-bold">
              {customCategories.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 relative transition-all ${
              activeTab === "analytics" 
                ? "text-primary border-b-2 border-primary bg-primary/5 rounded-t-xl" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart className="h-4 w-4" />
            Crescimento & Métricas
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-mono text-[9px] font-bold">
              Novo
            </span>
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="bg-card border border-border/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm min-h-[400px]">
          <AnimatePresence mode="wait">
            
            {/* Panel 1: listings & PINNING */}
            {activeTab === "anuncios" && (
              <motion.div
                key="anuncios-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                  <div>
                    <h2 className="font-display font-bold text-xl">Todos os Anúncios</h2>
                    <p className="text-muted-foreground text-xs mt-1">Afixe anúncios no topo ou remova anúncios fraudulentos.</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={adsSearch}
                      onChange={(e) => setAdsSearch(e.target.value)}
                      placeholder="Pesquisar anúncios..."
                      className="pl-10 h-10 rounded-xl bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary/20"
                    />
                  </div>
                </div>

                {filteredListings.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    Não foram encontrados anúncios com esse critério de pesquisa.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border/60 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="pb-3 pl-4">Produto</th>
                          <th className="pb-3">Vendedor</th>
                          <th className="pb-3">Preço</th>
                          <th className="pb-3 text-center">Visualizações (Novos / Inscritos)</th>
                          <th className="pb-3 text-center">Cliques</th>
                          <th className="pb-3 text-center">Avaliação</th>
                          <th className="pb-3 text-center">Estado</th>
                          <th className="pb-3 pr-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredListings.map((l) => {
                          const isPinned = pinnedIds.includes(l.id);
                          const stats = analyticsMap[l.id] || { views: 0, clicks: 0 };
                          const ratingStats = getListingRating(l.id);
                          return (
                            <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                              {/* Product col */}
                              <td className="py-4 pl-4 flex items-center gap-3">
                                <img 
                                  src={l.image} 
                                  alt={l.title} 
                                  className="h-12 w-12 object-cover rounded-xl border border-border/60 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <Link to={`/anuncio/${l.id}`} className="font-semibold text-sm hover:text-primary transition-colors line-clamp-1">
                                    {l.title}
                                  </Link>
                                  <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded uppercase">
                                    ID: {l.id} • {l.location}
                                  </span>
                                </div>
                              </td>

                              {/* Seller col */}
                              <td className="py-4 text-sm font-medium">
                                <Link to={`/vendedor/${encodeURIComponent(l.seller)}`} className="hover:underline hover:text-primary transition-all">
                                  {l.seller}
                                </Link>
                              </td>

                              {/* Price col */}
                              <td className="py-4 font-mono font-bold text-sm">
                                {l.price === 0 ? "Grátis / Negociável" : formatPrice(l.price, l.currency)}
                              </td>

                              {/* Real Views col (with New / Registered splits) */}
                              <td className="py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20" title="Total de Visitas">
                                    <Eye className="h-3 w-3" /> {stats.views}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[9px] font-bold mt-0.5 whitespace-nowrap">
                                    <span className="bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.2 rounded" title="Novos Utilizadores">
                                      Novos: {stats.viewsNew ?? Math.floor(stats.views * 0.7)}
                                    </span>
                                    <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1 py-0.2 rounded" title="Utilizadores Inscritos / Registados">
                                      Inscritos: {stats.viewsRegistered ?? (stats.views - Math.floor(stats.views * 0.7))}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Real Clicks col */}
                              <td className="py-4 text-center">
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">
                                  <TrendingUp className="h-3 w-3" /> {stats.clicks}
                                </span>
                              </td>

                              {/* Listing Rating col */}
                              <td className="py-4 text-center">
                                <div className="flex flex-col items-center justify-center">
                                  <div className="flex items-center gap-1">
                                    <span className="text-amber-500 text-xs font-bold font-mono">
                                      {ratingStats.rating.toFixed(1)}
                                    </span>
                                    <span className="text-amber-400 text-xs">★</span>
                                  </div>
                                  <span className="text-[9px] text-muted-foreground font-semibold">
                                    ({ratingStats.totalCount} votos)
                                  </span>
                                </div>
                              </td>

                              {/* Status badge */}
                              <td className="py-4 text-center">
                                {isPinned ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-amber-500/20">
                                    <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" /> Afixado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-500/20">
                                    <CheckCircle2 className="h-3 w-3" /> Ativo
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-4 pr-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleAddListingToBanner(l)}
                                    className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-95 flex items-center justify-center shrink-0"
                                    title="Adicionar ao Banner"
                                  >
                                    <Megaphone className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                    <span className="hidden xl:inline text-xs font-semibold ml-1.5">Banner</span>
                                  </button>

                                  <button
                                    onClick={() => togglePinListing(l.id)}
                                    className={`p-2 rounded-xl border transition-all active:scale-95 flex items-center justify-center ${
                                      isPinned 
                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20" 
                                        : "bg-card text-muted-foreground hover:text-foreground border-border/80 hover:bg-muted"
                                    }`}
                                    title={isPinned ? "Desafixar anúncio" : "Afixar no topo"}
                                  >
                                    <Pin className="h-4 w-4" />
                                  </button>
                                  <Link to={`/anuncio/${l.id}`}>
                                    <button
                                      className="p-2 rounded-xl bg-card text-muted-foreground hover:text-foreground border border-border/80 hover:bg-muted transition-all active:scale-95"
                                      title="Visualizar anúncio"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  </Link>
                                  <button
                                    onClick={() => handleDeleteListing(l.id)}
                                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 transition-all active:scale-95"
                                    title="Remover anúncio"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {/* Panel 2: reports */}
            {activeTab === "denuncias" && (
              <motion.div
                key="denuncias-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="font-display font-bold text-xl">Denúncias de Segurança</h2>
                  <p className="text-muted-foreground text-xs mt-1">Modere anúncios sinalizados por compradores por conduta imprópria.</p>
                </div>

                {reports.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed">
                    Excelente! Não há nenhuma denúncia registada ou pendente.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reports.map((r) => {
                      const isActive = r.status === "Pendente";
                      return (
                        <div 
                          key={r.id} 
                          className={`border rounded-2xl p-5 md:p-6 transition-all ${
                            isActive 
                              ? "bg-rose-500/5 border-rose-500/20 shadow-sm" 
                              : "bg-muted/30 border-border/40 opacity-75"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row items-start justify-between gap-4 mb-4">
                            <div className="flex items-start gap-4">
                              <img 
                                src={r.listingImage} 
                                alt={r.listingTitle} 
                                className="h-16 w-16 object-cover rounded-xl border border-border/80"
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    {r.reason}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    Sinalizado em {r.reportedAt}
                                  </span>
                                </div>
                                <h3 className="font-bold text-base mt-1 text-foreground">
                                  {r.listingTitle}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Vendedor anunciado: <span className="font-semibold text-foreground">{r.sellerName}</span> · Preço: {formatPrice(r.listingPrice, r.listingCurrency)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
                                r.status === "Pendente" ? "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse" :
                                r.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                "bg-gray-500/10 text-gray-500 border-gray-500/20"
                              }`}>
                                {r.status}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 bg-background/50 border border-border/30 rounded-xl mb-4 text-sm text-foreground/90">
                            <strong className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Relato do Comprador:</strong>
                            "{r.text}"
                          </div>

                          {isActive && (
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openMessageModal(r.sellerName, `Notificação: Denúncia sobre Anúncio ${r.listingTitle}`)}
                                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 shadow-sm transition-all flex items-center gap-2"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" /> Enviar Mensagem ao Vendedor
                                </button>
                                <button
                                  onClick={() => handleDeleteListing(r.listingId)}
                                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Remover Anúncio
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleResolveReport(r.id, "Resolvido")}
                                  className="px-3.5 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
                                >
                                  Marcar Resolvido
                                </button>
                                <button
                                  onClick={() => handleResolveReport(r.id, "Ignorado")}
                                  className="px-3.5 py-1.5 rounded-xl border border-border bg-card text-muted-foreground text-xs font-bold hover:bg-muted transition-all"
                                >
                                  Ignorar / Manter
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* Panel 3: sellers/registered list */}
            {activeTab === "vendedores" && (
              <motion.div
                key="vendedores-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                  <div>
                    <h2 className="font-display font-bold text-xl">Vendedores e Utilizadores Inscritos</h2>
                    <p className="text-muted-foreground text-xs mt-1">Acompanhe novos cadastros e contacte diretamente os vendedores.</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={sellersSearch}
                      onChange={(e) => setSellersSearch(e.target.value)}
                      placeholder="Pesquisar utilizadores..."
                      className="pl-10 h-10 rounded-xl bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary/20"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSellers.map((s, idx) => {
                    return (
                      <motion.div
                        key={s.name}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        className="p-5 rounded-2xl bg-muted/20 border border-border/50 hover:bg-muted/40 transition-all shadow-sm flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-xl gradient-hero flex items-center justify-center font-bold text-primary-foreground text-sm shadow-sm shrink-0">
                              {s.avatar}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm text-foreground line-clamp-1">{s.name}</h3>
                              <span className="text-[10px] bg-primary/10 text-primary dark:text-red-400 font-bold uppercase px-1.5 py-0.5 rounded tracking-wider">
                                Vendedor Activo
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2 text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{s.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span>{s.phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              <span>Inscrito em {s.registeredAt}</span>
                            </div>
                            <div className="flex items-center gap-2 pt-1.5 border-t border-border/20 mt-1.5 text-foreground/90">
                              <Package className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-semibold">Possui {s.adsCount} anúncio{s.adsCount !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border/10 mt-auto">
                          <button
                            onClick={() => openMessageModal(s.name)}
                            className="flex-1 px-3 py-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> Enviar Mensagem
                          </button>
                          <Link to={`/vendedor/${encodeURIComponent(s.name)}`} className="shrink-0">
                            <button className="p-2 rounded-xl bg-card border border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95" title="Ver anúncios públicos">
                              <Eye className="h-4 w-4" />
                            </button>
                          </Link>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Panel 4: Slide Banners Manager */}
            {activeTab === "slides" && (
              <motion.div
                key="slides-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Editable Top Informational Banner (Barra Superior de Aviso) */}
                <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
                  <h3 className="font-display font-bold text-lg flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-rose-500" />
                    Barra de Aviso Superior (Página Inicial)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Altere o texto do aviso que aparece na barra vermelha no topo da página inicial do Aqkianda (ex: campanhas especiais, avisos de entrega, novidades).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Texto do Aviso</label>
                      <Input
                        value={topBannerText}
                        onChange={(e) => setTopBannerText(e.target.value)}
                        placeholder="Ex: Envia os teus artigos de forma simples e direta. Sem comissões de venda no Aqkianda!"
                        className="h-10 rounded-xl bg-muted/20"
                      />
                    </div>
                    <Button 
                      onClick={handleSaveTopBannerText}
                      className="h-10 rounded-xl bg-primary text-white hover:bg-primary/95 font-bold shadow-sm shrink-0 px-6 w-full sm:w-auto"
                    >
                      Salvar Aviso
                    </Button>
                  </div>
                </div>

                <div className="grid lg:grid-cols-12 gap-8">
                  {/* Left: Add Banner Form */}
                  <div className="lg:col-span-5 bg-muted/20 border border-border/60 rounded-2xl p-6 space-y-4">
                    <h3 className="font-display font-bold text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      Adicionar Novo Slide
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Insira banners de fotos ou anúncios especiais para destacar na parte superior da página inicial do Aqkianda.
                    </p>

                    <form onSubmit={handleCreateBanner} className="space-y-4 pt-2">
                      {/* Image Upload from Computer or URL */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider block">Imagem do Banner *</label>
                        
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            className="h-10 rounded-xl border-dashed border-primary/40 bg-card hover:bg-primary/5 text-primary text-xs font-bold flex items-center gap-2 flex-1"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Carregar do Computador</span>
                          </Button>
                        </div>

                        {bannerImage && (
                          <div className="relative rounded-xl overflow-hidden border border-border/80 h-28 bg-muted">
                            <img src={bannerImage} alt="Pré-visualização" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setBannerImage("")}
                              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                              title="Remover imagem"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="pt-1">
                          <span className="text-[10px] text-muted-foreground block mb-1">Ou cole o URL da imagem da web:</span>
                          <Input
                            value={bannerImage}
                            onChange={(e) => setBannerImage(e.target.value)}
                            placeholder="https://exemplo.com/imagem.jpg"
                            className="h-9 rounded-xl bg-card text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider block">Título do Slide</label>
                          <span className="text-[10px] text-muted-foreground italic">(Opcional)</span>
                        </div>
                        <Input
                          value={bannerTitle}
                          onChange={(e) => setBannerTitle(e.target.value)}
                          placeholder="Ex: Saldos de Cacimbo 30% OFF (ou deixe em branco)"
                          className="h-10 rounded-xl bg-card text-xs"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider block">Subtítulo / Descrição</label>
                          <span className="text-[10px] text-muted-foreground italic">(Opcional)</span>
                        </div>
                        <Textarea
                          value={bannerSubtitle}
                          onChange={(e) => setBannerSubtitle(e.target.value)}
                          placeholder="Ex: Aproveite as melhores promoções (ou deixe em branco)..."
                          rows={2}
                          className="rounded-xl bg-card resize-none text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider block">Link de Ação</label>
                            <span className="text-[10px] text-muted-foreground italic">(Opcional)</span>
                          </div>
                          <Input
                            value={bannerLink}
                            onChange={(e) => setBannerLink(e.target.value)}
                            placeholder="Ex: /explorar ou https://..."
                            className="h-10 rounded-xl bg-card text-xs"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider block">Texto do Botão</label>
                            <span className="text-[10px] text-muted-foreground italic">(Opcional)</span>
                          </div>
                          <Input
                            value={bannerButtonText}
                            onChange={(e) => setBannerButtonText(e.target.value)}
                            placeholder="Ex: Ver Oferta"
                            className="h-10 rounded-xl bg-card text-xs"
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold shadow-md">
                        <Plus className="mr-2 h-4 w-4" /> Publicar Slide
                      </Button>
                    </form>
                  </div>

                  {/* Right: Active Slides list */}
                  <div className="lg:col-span-7 space-y-4">
                    <h3 className="font-display font-bold text-lg flex items-center gap-2">
                      <Eye className="h-5 w-5 text-primary" />
                      Slides Ativos Atualmente ({slides.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Estes banners rotativos são mostrados para todos os visitantes que entram no site.
                    </p>

                    <div className="space-y-4 pt-2">
                      {slides.map((slide) => (
                        <div
                          key={slide.id}
                          className="p-4 rounded-2xl bg-muted/10 border border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between"
                        >
                          <div className="flex gap-4 items-center min-w-0">
                            <img
                              src={slide.image}
                              alt={slide.title}
                              className="h-16 w-24 object-cover rounded-xl bg-muted shrink-0 shadow-sm"
                            />
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm truncate">{slide.title}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-1">{slide.subtitle}</p>
                              <span className="inline-block mt-1 text-[9px] font-mono font-bold bg-primary/10 text-primary dark:text-red-400 px-1.5 py-0.5 rounded">
                                Link: {slide.link}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteBanner(slide.id)}
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all shrink-0 self-end sm:self-center"
                            title="Remover banner"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Panel 5: Promo Events Manager */}
            {activeTab === "promocoes" && (
              <motion.div
                key="promocoes-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="grid lg:grid-cols-12 gap-8">
                  {/* Left: Create Event Form */}
                  <div className="lg:col-span-5 bg-muted/20 border border-border/60 rounded-2xl p-6 space-y-4">
                    <h3 className="font-display font-bold text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Criar Evento de Promoção
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Crie um evento de vendas. Vendedores receberão uma notificação automática no painel e poderão marcar os seus anúncios com preços promocionais exclusivos.
                    </p>

                    <form onSubmit={handleCreatePromoEvent} className="space-y-4 pt-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Nome do Evento *</label>
                        <Input
                          required
                          value={promoName}
                          onChange={(e) => setPromoName(e.target.value)}
                          placeholder="Ex: Black Friday Luanda / Saldos de Cacimbo"
                          className="h-10 rounded-xl bg-card"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Descrição Geral / Regras *</label>
                        <Textarea
                          required
                          value={promoDesc}
                          onChange={(e) => setPromoDesc(e.target.value)}
                          placeholder="Ex: Evento nacional para descontos reais. Vendedores elegíveis em tecnologia e viaturas..."
                          rows={3}
                          className="rounded-xl bg-card resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Início *</label>
                          <Input
                            required
                            type="date"
                            value={promoStart}
                            onChange={(e) => setPromoStart(e.target.value)}
                            className="h-10 rounded-xl bg-card"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Fim *</label>
                          <Input
                            required
                            type="date"
                            value={promoEnd}
                            onChange={(e) => setPromoEnd(e.target.value)}
                            className="h-10 rounded-xl bg-card"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">Descontos Sugeridos</label>
                        <div className="flex gap-1.5 flex-wrap pt-1">
                          {[10, 15, 20, 30, 50].map((d) => (
                            <span key={d} className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs">
                              {d}% Off
                            </span>
                          ))}
                        </div>
                      </div>

                      <Button type="submit" className="w-full h-11 rounded-xl gradient-hero font-bold shadow-md">
                        <Calendar className="mr-2 h-4 w-4" /> Lançar Evento & Notificar
                      </Button>
                    </form>
                  </div>

                  {/* Right: Active Promotions list */}
                  <div className="lg:col-span-7 space-y-4">
                    <h3 className="font-display font-bold text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-rose-500" />
                      Campanhas e Eventos Ativos ({promoEvents.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Os clientes podem inscrever os seus anúncios nestas campanhas. Os anúncios terão selos coloridos na página principal.
                    </p>

                    <div className="space-y-4 pt-2">
                      {promoEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                {event.name}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                            </div>

                            <button
                              onClick={() => handleDeletePromoEvent(event.id)}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all shrink-0"
                              title="Eliminar evento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs font-mono font-medium pt-2 border-t border-border/40 text-muted-foreground">
                            <span className="bg-muted px-2 py-0.5 rounded">
                              Duração: {event.startDate} até {event.endDate}
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              ● Vendedores Podem Aderir
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: GERIR CATEGORIAS */}
            {activeTab === "categorias" && (
              <motion.div
                key="tab-categorias"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid lg:grid-cols-3 gap-8">
                  {/* Categorias Criadas List */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-display font-bold text-xl md:text-2xl text-foreground">
                          Categorias Ativas no Aqkianda ({customCategories.length})
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Todas as categorias disponíveis para os vendedores publicarem anúncios e compradores navegarem.
                        </p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      {customCategories.map((cat) => {
                        const count = activeListings.filter((l) => l.categoryId === cat.slug).length;
                        return (
                          <div
                            key={cat.slug}
                            className="bg-card border border-border/40 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-primary/20 transition-all group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">
                                <FolderPlus className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-sm text-foreground truncate">{cat.name}</h3>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">
                                  slug: {cat.slug} · ícone: {cat.icon}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono font-bold bg-muted px-2 py-1 rounded-full text-muted-foreground">
                                {count} anúncio{count !== 1 ? "s" : ""}
                              </span>
                              <button
                                onClick={() => handleDeleteCategory(cat.slug)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                                title="Eliminar Categoria"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Formulário de Adicionar Nova Categoria */}
                  <div className="bg-card border border-border/40 rounded-3xl p-6 shadow-sm h-fit space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-primary font-bold text-sm">
                        <FolderPlus className="h-4 w-4" />
                        <span>Adicionar Nova Categoria</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Crie uma nova categoria extra para organizar os produtos dos vendedores no marketplace Aqkianda.
                      </p>
                    </div>

                    <form onSubmit={handleCreateCategory} className="space-y-4 pt-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                          Nome da Categoria *
                        </label>
                        <Input
                          required
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Ex: Bebés & Crianças, Livros, Animais..."
                          className="h-10 rounded-xl bg-card text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                          Slug / Identificador (Opcional)
                        </label>
                        <Input
                          value={newCatSlug}
                          onChange={(e) => setNewCatSlug(e.target.value)}
                          placeholder="Ex: bebes-criancas (gerado automaticamente)"
                          className="h-10 rounded-xl bg-card text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                          Escolher Ícone da Categoria
                        </label>
                        <select
                          value={newCatIcon}
                          onChange={(e) => setNewCatIcon(e.target.value)}
                          className="w-full h-10 rounded-xl border border-border/80 bg-card text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {AVAILABLE_CATEGORY_ICONS.map((icon) => (
                            <option key={icon.value} value={icon.value}>
                              {icon.label} ({icon.value})
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button type="submit" className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold shadow-md">
                        <Plus className="mr-2 h-4 w-4" /> Criar Categoria
                      </Button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Panel 7: Real Analytics Dashboard */}
            {activeTab === "analytics" && (
              <motion.div
                key="analytics-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Header controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
                  <div>
                    <h2 className="font-display font-bold text-lg text-foreground">Relatório de Tráfego & Crescimento</h2>
                    <p className="text-xs text-muted-foreground">Monitorize a adesão, novos registos, canais de tráfego e partilhas por período.</p>
                  </div>
                  
                  {/* Date Range Selector */}
                  <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/20 self-stretch sm:self-auto">
                    {(["today", "7d", "30d"] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => setAnalyticsRange(range)}
                        className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap capitalize ${
                          analyticsRange === range 
                            ? "bg-card text-foreground shadow-sm font-extrabold" 
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {range === "today" ? "Hoje" : range === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Growth Performance Stats Widgets */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                  {/* Stat 1: Total Views */}
                  <div className="bg-card border border-border/40 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Visitas Totais</span>
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Eye className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-display font-bold text-lg sm:text-2xl font-mono text-emerald-600 dark:text-emerald-400">{totalStats.views}</h4>
                      <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">Páginas visualizadas</p>
                    </div>
                  </div>

                  {/* Stat 2: New Visitors */}
                  <div className="bg-card border border-border/40 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Novos Utilizadores</span>
                      <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-display font-bold text-lg sm:text-2xl font-mono text-sky-600 dark:text-sky-400">{totalStats.viewsNew}</h4>
                      <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">Visitas de visitantes novos</p>
                    </div>
                  </div>

                  {/* Stat 3: Registered/Subscribed Views */}
                  <div className="bg-card border border-border/40 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Visitas de Inscritos</span>
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        <Users className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-display font-bold text-lg sm:text-2xl font-mono text-indigo-600 dark:text-indigo-400">{totalStats.viewsRegistered}</h4>
                      <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">Com conta iniciada</p>
                    </div>
                  </div>

                  {/* Stat 4: Shares */}
                  <div className="bg-card border border-border/40 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Partilhas</span>
                      <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Share2 className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-display font-bold text-lg sm:text-2xl font-mono text-purple-600 dark:text-purple-400">{totalStats.shares}</h4>
                      <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">Partilhas efetuadas</p>
                    </div>
                  </div>

                  {/* Stat 5: Signups / Registrations */}
                  <div className="bg-card border border-border/40 rounded-2xl p-4 flex flex-col justify-between shadow-sm col-span-2 md:col-span-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Inscritos (Novos)</span>
                      <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400">
                        <Plus className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <h4 className="font-display font-bold text-lg sm:text-2xl font-mono text-pink-600 dark:text-pink-400">{totalStats.signups}</h4>
                      <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">Contas criadas no período</p>
                    </div>
                  </div>
                </div>

                {/* Graphs Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Traffic over time Area Chart */}
                  <div className="lg:col-span-2 bg-card border border-border/40 rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <LineChart className="h-4 w-4 text-emerald-500" />
                        Histórico de Tráfego e Crescimento
                      </h3>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 rounded-full font-bold">
                        {analyticsRange === "today" ? "Visualização diária" : analyticsRange === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"}
                      </span>
                    </div>

                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={filteredTraffic}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorViewsRegistered" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.1)" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#888888" 
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => {
                              const pts = val.split("-");
                              return pts.length > 2 ? `${pts[2]}/${pts[1]}` : val;
                            }}
                          />
                          <YAxis 
                            stroke="#888888" 
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltip 
                            contentStyle={{ 
                              background: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }} 
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                          <Area 
                            name="Visitas Totais" 
                            type="monotone" 
                            dataKey="viewsTotal" 
                            stroke="#10B981" 
                            strokeWidth={2.5}
                            fillOpacity={1} 
                            fill="url(#colorViews)" 
                          />
                          <Area 
                            name="Utilizadores Inscritos" 
                            type="monotone" 
                            dataKey="viewsRegistered" 
                            stroke="#6366F1" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorViewsRegistered)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Traffic Referrals / Channels Bar Chart */}
                  <div className="bg-card border border-border/40 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-4">
                        <Globe className="h-4 w-4 text-sky-500" />
                        Métodos de Acesso / Fontes
                      </h3>
                      
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: "Direto", total: totalStats.direct, fill: "#F59E0B" },
                              { name: "Pesquisa", total: totalStats.search, fill: "#3B82F6" },
                              { name: "Partilha", total: totalStats.shareLink, fill: "#8B5CF6" },
                              { name: "WhatsApp", total: totalStats.whatsapp, fill: "#10B981" }
                            ]}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.1)" />
                            <XAxis dataKey="name" fontSize={10} stroke="#888888" tickLine={false} axisLine={false} />
                            <YAxis fontSize={10} stroke="#888888" tickLine={false} axisLine={false} />
                            <ChartTooltip 
                              contentStyle={{ 
                                background: 'hsl(var(--card))', 
                                border: '1px solid hsl(var(--border))', 
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            />
                            <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                              {[
                                { fill: "#F59E0B" },
                                { fill: "#3B82F6" },
                                { fill: "#8B5CF6" },
                                { fill: "#10B981" }
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4 pt-4 border-t border-border/30 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                          Acesso Direto
                        </span>
                        <span className="font-mono font-bold">
                          {totalStats.views > 0 ? Math.round((totalStats.direct / totalStats.views) * 100) : 0}% ({totalStats.direct})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                          <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                          Motores de Busca
                        </span>
                        <span className="font-mono font-bold">
                          {totalStats.views > 0 ? Math.round((totalStats.search / totalStats.views) * 100) : 0}% ({totalStats.search})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                          <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
                          Links de Partilha
                        </span>
                        <span className="font-mono font-bold">
                          {totalStats.views > 0 ? Math.round((totalStats.shareLink / totalStats.views) * 100) : 0}% ({totalStats.shareLink})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                          WhatsApp Link
                        </span>
                        <span className="font-mono font-bold">
                          {totalStats.views > 0 ? Math.round((totalStats.whatsapp / totalStats.views) * 100) : 0}% ({totalStats.whatsapp})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Growth metrics data table log */}
                <div className="bg-card border border-border/40 rounded-3xl p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Registos de Tráfego Diários</h3>
                      <p className="text-[11px] text-muted-foreground">Registo exaustivo diário das visitas (Novos/Inscritos), partilhas e novas contas criadas no Aqkianda.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground font-semibold">
                          <th className="pb-3">Data</th>
                          <th className="pb-3 text-center">Visitas Totais</th>
                          <th className="pb-3 text-center text-sky-600 dark:text-sky-400">Visitantes Novos</th>
                          <th className="pb-3 text-center text-indigo-600 dark:text-indigo-400">Utilizadores Inscritos</th>
                          <th className="pb-3 text-center text-purple-600 dark:text-purple-400">Partilhas</th>
                          <th className="pb-3 text-center text-pink-600 dark:text-pink-400">Novos Registos</th>
                          <th className="pb-3 text-right">Canal Dominante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {[...filteredTraffic].reverse().map((day) => {
                          const channels = [
                            { name: "Acesso Direto", value: day.direct || 0 },
                            { name: "Motores de Busca", value: day.search || 0 },
                            { name: "Link de Partilha", value: day.shareLink || 0 },
                            { name: "WhatsApp", value: day.whatsapp || 0 }
                          ];
                          const dominant = channels.sort((a, b) => b.value - a.value)[0].name;

                          return (
                            <tr key={day.date} className="hover:bg-muted/10 transition-colors">
                              <td className="py-3 font-mono font-bold text-[11px]">
                                {day.date}
                              </td>
                              <td className="py-3 text-center font-bold font-mono">
                                {day.viewsTotal}
                              </td>
                              <td className="py-3 text-center font-semibold font-mono text-sky-600 dark:text-sky-400">
                                {day.viewsNew}
                              </td>
                              <td className="py-3 text-center font-semibold font-mono text-indigo-600 dark:text-indigo-400">
                                {day.viewsRegistered}
                              </td>
                              <td className="py-3 text-center font-mono font-medium text-purple-600 dark:text-purple-400">
                                {day.shares}
                              </td>
                              <td className="py-3 text-center font-mono font-medium text-pink-600 dark:text-pink-400">
                                {day.signups}
                              </td>
                              <td className="py-3 text-right font-medium text-muted-foreground text-[10px]">
                                {dominant}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* Support Message Popup Dialog / Modal */}
      <AnimatePresence>
        {isMsgModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMsgModalOpen(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-card rounded-3xl border border-border p-6 shadow-elevated z-10 space-y-4"
            >
              <div>
                <h3 className="font-display font-bold text-xl">Notificação Oficial da Equipa Aqkianda</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Enviar comunicação oficial direta para {msgTargetSeller}.</p>
              </div>

              <form onSubmit={handleSendAdminMessage} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assunto da Notificação</label>
                  <Input 
                    value={msgSubject}
                    onChange={(e) => setMsgSubject(e.target.value)}
                    placeholder="Ex: Alerta de segurança sobre o seu anúncio"
                    className="rounded-xl h-10 border-border/80 bg-muted/30 focus-visible:bg-background"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem da Equipa / Admin</label>
                  <Textarea
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    placeholder="Descreva a notificação ou instrução para o vendedor. Ele receberá isto como um chat oficial do suporte Aqkianda..."
                    className="rounded-xl min-h-[140px] border-border/80 bg-muted/30 focus-visible:bg-background"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsMsgModalOpen(false)}
                    className="px-4 py-2 h-10 rounded-xl border border-border bg-card text-xs font-bold hover:bg-muted text-muted-foreground transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingMsg}
                    className="px-6 py-2 h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold transition-all shadow-glow flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSendingMsg ? (
                      <>Enviando...</>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" /> Enviar Notificação
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default Admin;
