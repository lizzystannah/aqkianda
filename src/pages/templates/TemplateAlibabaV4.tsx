/**
 * Template Kianda - Versão Vinted.pt Aesthetic (Estilo Clean Minimalist Red)
 * - Design clean e minimalista focado em vestuário, acessórios e utilitários
 * - Paleta de cores oficial da Aqkianda (Vibrant Red)
 * - Hero banner dinâmico com cartão flutuante
 * - Secção "Como funciona" informativa e detalhada
 * - Cards de produtos com estrutura Vinted (Avatar de vendedor, preço, marca/tamanho e favoritos)
 * - Filtros rápidos e barra de pesquisa inteligente
 */
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Heart, MapPin, Star, ChevronRight, Shield, Truck, DollarSign,
    Phone, Building2, BadgeCheck, Clock, Plus, Info,
    Menu, User, SlidersHorizontal, Sun, Moon, Sparkles, Zap, TrendingUp, Award,
    ChevronLeft, X, ArrowUp, Package, ShoppingBag, Eye, HelpCircle,
    Smartphone, Car, Home as HomeIcon, Shirt, Sofa, Dumbbell, Briefcase, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listings, categories, formatPrice, useListingsVersion } from "@/data/listings";
import { useTheme } from "@/context/ThemeContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import ListingCard from "@/components/ListingCard";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const DEFAULT_DYNAMIC_SLIDES = [
    {
        id: "b1",
        title: "Grande Inauguração Aqkianda",
        subtitle: "A maior plataforma de negócios em Angola chegou! Descontos especiais de parceiros.",
        image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1920&q=80",
        link: "/explorar",
        buttonText: "Explorar Ofertas",
        isActive: true
    },
    {
        id: "b2",
        title: "Campanha Cacimbo Tech",
        subtitle: "Smartphones, Laptops e Acessórios com até 30% de desconto real.",
        image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1920&q=80",
        link: "/explorar?cat=eletronica",
        buttonText: "Ver Tecnologia",
        isActive: true
    },
    {
        id: "b3",
        title: "Automóveis & Imóveis",
        subtitle: "Encontre os melhores carros e casas de Luanda às melhores condições.",
        image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80",
        link: "/explorar?cat=viaturas",
        buttonText: "Ver Imóveis",
        isActive: true
    }
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Smartphone: Smartphone,
    Car: Car,
    Home: HomeIcon,
    Shirt: Shirt,
    Sofa: Sofa,
    Dumbbell: Dumbbell,
    Briefcase: Briefcase,
    Wrench: Wrench
};

const TemplateAlibabaV4 = () => {
    const { isDark: darkMode, toggleTheme: toggleDarkMode } = useTheme();
    const { toggleFavorite, isFavorite } = useFavorites();
    const { user, isAdmin, logout } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    // Redesenha quando chegam anúncios novos do servidor (sem refresh manual)
    useListingsVersion();
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const navigate = useNavigate();

    const [bannerText, setBannerText] = useState("Envia os teus artigos de forma simples e direta. Sem comissões de venda no Aqkianda!");

    useEffect(() => {
        const storedBanner = localStorage.getItem("aqkianda-top-banner-text");
        if (storedBanner) {
            setBannerText(storedBanner);
        }
    }, []);

    useDocumentMetadata({
        title: "Aqkianda — Marketplace de Compra e Venda de Artigos Novos e Usados",
        description: "Compra e vende vestuário, eletrónica, acessórios e utilitários de forma simples, rápida e 100% segura com a Aqkianda.",
        type: "website",
    });

    const [dynamicSlides, setDynamicSlides] = useState<any[]>(DEFAULT_DYNAMIC_SLIDES);

    useEffect(() => {
        const loadSlides = () => {
            const saved = localStorage.getItem("aqkianda-slideshow-banners");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const activeOnly = parsed.filter((s: any) => s.isActive !== false);
                        if (activeOnly.length > 0) {
                            setDynamicSlides(activeOnly);
                            return;
                        }
                    }
                } catch (e) {
                    console.error("Error parsing banners:", e);
                }
            }
            setDynamicSlides(DEFAULT_DYNAMIC_SLIDES);
        };

        loadSlides();
        window.addEventListener("storage", loadSlides);
        return () => window.removeEventListener("storage", loadSlides);
    }, []);

    useEffect(() => {
        if (dynamicSlides.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % dynamicSlides.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [dynamicSlides.length]);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Lock body scroll when mobile menu drawer is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileMenuOpen]);

    const handleLogout = () => {
        logout();
    };

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/explorar?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    return (
        <div className={`min-h-screen pb-16 md:pb-0 transition-colors duration-300 ${darkMode ? "dark bg-gray-950 text-white" : "bg-[#F5F6F7] text-[#111111]"}`}>

            {/* Mini Informational Alert Banner in Brand Red */}
            <div className="bg-primary text-primary-foreground text-xs py-2.5 text-center font-medium px-4 select-none shadow-sm">
                <span className="inline-flex items-center gap-1.5 justify-center flex-wrap">
                    <Truck className="h-4 w-4 animate-bounce" /> {bannerText}
                </span>
            </div>

            {/* Header Vinted Style in Brand Red */}
            <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 dark:bg-gray-900/95 shadow-md backdrop-blur border-b border-border/40" : "bg-white dark:bg-gray-900 border-b border-border/20"}`}>
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between py-3 md:py-4 gap-4">
                        
                        {/* Logo Aqkianda styled beautifully like Vinted */}
                        <Link to="/" className="flex items-center shrink-0 group select-none">
                            <span className="font-display font-black text-2xl md:text-[29px] tracking-tighter leading-none">
                                <span className="text-foreground">A</span>
                                <span className="text-rose-600">qk</span>
                                <span className="text-foreground">ianda</span>
                            </span>
                        </Link>

                        {/* Centered Wide Search Input */}
                        <form onSubmit={handleSearch} className="flex-1 max-w-2xl hidden md:block">
                            <div className="relative flex items-center bg-muted/60 dark:bg-gray-800 rounded-lg border border-transparent focus-within:border-primary/40 focus-within:bg-card transition-all">
                                <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Pesquisar artigos, marcas ou utilizadores"
                                    className="w-full bg-transparent pl-11 pr-4 py-2.5 text-sm outline-none text-foreground placeholder-muted-foreground"
                                />
                            </div>
                        </form>

                        {/* Navigation Right actions */}
                        <div className="flex items-center gap-3 md:gap-5 shrink-0">
                            {/* Theme switcher */}
                            <button onClick={toggleDarkMode} className="text-muted-foreground hover:text-primary transition-colors p-1" aria-label="Alterar Tema">
                                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                            </button>

                            {user ? (
                                <div className="flex items-center gap-4">
                                    <Link to="/perfil" className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20">
                                            {user.name.slice(0, 1).toUpperCase()}
                                        </div>
                                        <span className="hidden lg:inline font-semibold text-xs">{user.name}</span>
                                    </Link>
                                    <Link to="/favoritos" className="text-muted-foreground hover:text-primary transition-colors relative" title="Favoritos">
                                        <Heart className="h-5 w-5" />
                                    </Link>
                                    <Link to="/mensagens" className="text-muted-foreground hover:text-primary transition-colors relative" title="Mensagens">
                                        <Phone className="h-5 w-5" />
                                    </Link>
                                    <button 
                                        onClick={handleLogout}
                                        className="text-xs font-semibold text-muted-foreground hover:text-red-500 transition-colors hidden sm:block"
                                    >
                                        Sair
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-xs md:text-sm">
                                    <Link to="/registar" className="text-muted-foreground hover:text-primary font-semibold transition-colors">
                                        Registar
                                    </Link>
                                    <span className="text-border">|</span>
                                    <Link to="/entrar" className="text-muted-foreground hover:text-primary font-semibold transition-colors">
                                        Entrar
                                    </Link>
                                </div>
                            )}

                            {/* Vinted style main CTA in Red */}
                            <Link 
                                to="/publicar" 
                                className="bg-primary hover:bg-primary/90 text-white text-xs sm:text-sm font-semibold px-4 py-2 md:py-2.5 rounded transition-all duration-200 flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap shrink-0 hidden sm:flex"
                            >
                                <Plus className="h-4 w-4" /> criar anúncio
                            </Link>

                            {/* Mobile Hamburger menu */}
                            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-muted-foreground hover:text-primary">
                                <Menu className="h-6 w-6" />
                            </button>
                        </div>
                    </div>

                    {/* Horizontal Category strip in the style of Vinted */}
                    <div className="hidden md:flex items-center justify-between py-2.5 border-t border-border/30 text-xs sm:text-sm font-medium text-muted-foreground">
                        <div className="flex items-center gap-6 overflow-x-auto scrollbar-none py-1">
                            {categories.map((cat) => {
                                const Icon = iconMap[cat.icon] || Package;
                                return (
                                    <Link 
                                        key={cat.slug} 
                                        to={`/explorar?cat=${cat.slug}`} 
                                        className="hover:text-primary transition-colors whitespace-nowrap flex items-center gap-1.5"
                                    >
                                        <Icon className="h-3.5 w-3.5 text-primary/70" />
                                        <span>{cat.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-4 text-xs shrink-0">
                            <Link to="/explorar" className="hover:text-primary transition-colors">Explorar artigos</Link>
                            <Link to="/blog" className="hover:text-primary transition-colors font-bold text-primary flex items-center gap-1">
                                <Sparkles className="h-3.5 w-3.5" /> Blog & Dicas
                            </Link>
                            {isAdmin && (
                                <Link to="/admin" className="hover:text-primary transition-colors flex items-center gap-1 font-bold text-[#DC2626]"><Shield className="h-3.5 w-3.5" /> Administração</Link>
                            )}
                        </div>
                    </div>

                    {/* Mobile Only Search Bar */}
                    <form onSubmit={handleSearch} className="py-2 md:hidden">
                        <div className="relative flex items-center bg-muted/60 dark:bg-gray-800 rounded-lg">
                            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="O que procuras hoje?"
                                className="w-full bg-transparent pl-9 pr-4 py-2 text-xs outline-none text-foreground placeholder-muted-foreground"
                            />
                        </div>
                    </form>
                </div>
            </header>

            {/* Mobile Navigation Drawer */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[70] md:hidden flex justify-end">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                    <div className="relative w-4/5 max-w-[320px] h-full max-h-[100dvh] bg-card p-6 pb-32 sm:pb-8 shadow-2xl flex flex-col justify-between overflow-y-auto overscroll-contain touch-pan-y z-10">
                        <div>
                            <div className="flex items-center justify-between pb-4 border-b border-border/40 mb-5">
                                <span className="font-extrabold text-primary text-xl lowercase flex items-center gap-1">
                                    <div className="w-6 h-6 rounded bg-primary text-white text-xs flex items-center justify-center">A</div>
                                    aqkianda
                                </span>
                                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {user ? (
                                <div className="bg-primary/5 rounded-xl p-4 mb-6 flex items-center gap-3 border border-primary/10">
                                    <div className="h-10 w-10 rounded-full bg-primary text-white font-bold flex items-center justify-center text-sm">
                                        {user.name.slice(0, 1).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-foreground text-sm">{user.name}</div>
                                        <div className="text-[10px] text-muted-foreground">Membro verificado</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-muted p-4 rounded-xl mb-6 text-center">
                                    <p className="text-xs text-muted-foreground mb-3">Conecte-se para negociar e vender gratuitamente no Aqkianda.</p>
                                    <Link to="/entrar" onClick={() => setMobileMenuOpen(false)} className="block w-full bg-primary text-white text-xs font-semibold py-2 rounded">
                                        Entrar / Registar
                                    </Link>
                                </div>
                            )}

                            <nav className="space-y-4">
                                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Explorar categorias</h4>
                                <div className="grid grid-cols-1 gap-2.5">
                                    {categories.map((cat) => {
                                        const Icon = iconMap[cat.icon] || Package;
                                        return (
                                            <Link
                                                key={cat.slug}
                                                to={`/explorar?cat=${cat.slug}`}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="flex items-center gap-3 text-sm text-foreground/80 hover:text-primary"
                                            >
                                                <Icon className="h-4.5 w-4.5 text-primary" />
                                                <span className="font-medium">{cat.name}</span>
                                            </Link>
                                        );
                                    })}
                                </div>

                                <div className="h-px bg-border/40 my-6" />

                                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Menu do utilizador</h4>
                                <div className="space-y-3 text-sm">
                                    <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 text-primary font-bold">
                                        <Sparkles className="h-4 w-4" /> Blog & Dicas
                                    </Link>
                                    <Link to="/publicar" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 text-foreground/80 hover:text-primary">
                                        <Plus className="h-4 w-4" /> Vender agora
                                    </Link>
                                    <Link to="/favoritos" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 text-foreground/80 hover:text-primary">
                                        <Heart className="h-4 w-4" /> Favoritos
                                    </Link>
                                    <Link to="/mensagens" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 text-foreground/80 hover:text-primary">
                                        <Phone className="h-4 w-4" /> Mensagens
                                    </Link>
                                    <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 text-foreground/80 hover:text-primary">
                                        <Shield className="h-4 w-4" /> Administração
                                    </Link>
                                </div>
                            </nav>
                        </div>

                        {user && (
                            <div className="pt-6 border-t border-border/40 mt-6">
                                <button
                                    onClick={() => {
                                        handleLogout();
                                        setMobileMenuOpen(false);
                                    }}
                                    className="w-full text-center bg-muted text-foreground/70 py-2.5 rounded text-xs font-semibold hover:text-red-500"
                                >
                                    Sair da conta
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Hero Section (Clean lifestyle with dynamic clickable slides) */}
            <section className="relative h-[220px] sm:h-[450px] md:h-[500px] overflow-hidden bg-gray-900 group">
                <AnimatePresence mode="popLayout">
                    {dynamicSlides.length > 0 && dynamicSlides[currentSlide] && (
                        <motion.div
                            key={dynamicSlides[currentSlide].id || currentSlide}
                            initial={{ opacity: 0, scale: 1.03 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.7 }}
                            onClick={() => {
                                const activeSlide = dynamicSlides[currentSlide];
                                if (activeSlide?.link) {
                                    if (activeSlide.link.startsWith("http")) {
                                        window.open(activeSlide.link, "_blank");
                                    } else {
                                        navigate(activeSlide.link);
                                    }
                                } else if (activeSlide?.listingId) {
                                    navigate(`/anuncio/${activeSlide.listingId}`);
                                }
                            }}
                            className={`absolute inset-0 w-full h-full ${
                                dynamicSlides[currentSlide]?.link || dynamicSlides[currentSlide]?.listingId ? "cursor-pointer" : ""
                            }`}
                        >
                            <img
                                src={dynamicSlides[currentSlide].image}
                                alt={dynamicSlides[currentSlide].title || "Banner Aqkianda"}
                                className="w-full h-full object-cover object-center select-none"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
                
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent z-10 pointer-events-none" />

                {/* Show floating card if title OR subtitle is present */}
                {dynamicSlides[currentSlide] && (dynamicSlides[currentSlide].title || dynamicSlides[currentSlide].subtitle) && (
                    <div className="container mx-auto px-4 h-full relative z-20 pointer-events-none">
                        <div className="absolute top-1/2 left-4 md:left-8 lg:left-12 -translate-y-1/2 bg-white/95 dark:bg-gray-900/95 p-4 sm:p-8 md:p-10 rounded-xl shadow-2xl max-w-[220px] sm:max-w-md border border-border/20 pointer-events-auto">
                            {dynamicSlides[currentSlide].title && (
                                <h1 className="font-sans font-bold text-xs sm:text-2xl md:text-3xl text-gray-900 dark:text-white leading-tight mb-1 sm:mb-2">
                                    {dynamicSlides[currentSlide].title}
                                </h1>
                            )}
                            {dynamicSlides[currentSlide].subtitle && (
                                <p className="text-muted-foreground text-[10px] sm:text-sm mb-2.5 sm:mb-6 leading-relaxed line-clamp-3">
                                    {dynamicSlides[currentSlide].subtitle}
                                </p>
                            )}
                            {(dynamicSlides[currentSlide].link || dynamicSlides[currentSlide].listingId) && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const activeSlide = dynamicSlides[currentSlide];
                                        if (activeSlide?.link) {
                                            if (activeSlide.link.startsWith("http")) {
                                                window.open(activeSlide.link, "_blank");
                                            } else {
                                                navigate(activeSlide.link);
                                            }
                                        } else if (activeSlide?.listingId) {
                                            navigate(`/anuncio/${activeSlide.listingId}`);
                                        }
                                    }}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-1.5 sm:py-3 px-3 sm:px-6 rounded-lg text-[10px] sm:text-sm transition-all duration-200 shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                    <span>{dynamicSlides[currentSlide].buttonText || "Ver Mais"}</span>
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Carousel navigation indicators */}
                {dynamicSlides.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
                        {dynamicSlides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentSlide(idx)}
                                className={`h-2 rounded-full transition-all ${
                                    currentSlide === idx ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                                }`}
                                aria-label={`Slide ${idx + 1}`}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Product Feed Grid */}
            <section className="container mx-auto px-4 py-10 sm:py-14">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
                    <div>
                        <h2 className="font-bold text-2xl text-foreground">
                            Artigos recomendados
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Baseado nas últimas tendências de moda e lifestyle</p>
                    </div>
                    <Link to="/explorar" className="text-primary hover:underline font-bold text-sm flex items-center gap-1 shrink-0">
                        Ver todos os anúncios <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                {/* Vinted Grid Layout using the updated ListingCard */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                    {listings.slice(0, 12).map((item, idx) => (
                        <ListingCard key={item.id} listing={item} index={idx} />
                    ))}
                </div>
            </section>

            {/* Safety banner box */}
            <section className="container mx-auto px-4 py-6 md:py-10">
                <div className="bg-card text-card-foreground rounded-sm p-6 sm:p-10 border border-border/40 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                    <div className="space-y-3 max-w-xl text-center md:text-left">
                        <div className="inline-flex items-center gap-1.5 bg-primary/5 text-primary px-2.5 py-0.5 rounded text-xs font-bold border border-primary/10">
                            <Shield className="h-3.5 w-3.5 animate-pulse" /> Compra e Venda Segura
                        </div>
                        <h2 className="font-bold text-xl sm:text-2xl text-foreground">Fazer compras em segurança</h2>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                            O Aqkianda é uma plataforma gratuita onde podes contactar os vendedores diretamente para negociar e combinar pontos de entrega presenciais de forma cómoda e segura. Utiliza as mensagens internas e lê as nossas dicas!
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                        <Link to="/termos" className="w-full sm:w-auto text-center border border-border hover:border-foreground/20 text-foreground font-semibold px-6 py-3 rounded text-xs sm:text-sm transition-colors bg-background">
                            Ler dicas de segurança
                        </Link>
                        <Link to="/publicar" className="w-full sm:w-auto text-center bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-3 rounded text-xs sm:text-sm transition-colors shadow-sm">
                            Começar a vender agora
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer with original texts kept exactly as requested */}
            <footer className="mt-24 border-t border-border/60 bg-secondary text-secondary-foreground py-14">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10 text-xs sm:text-sm">
                        <div className="space-y-4 md:col-span-1">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="h-8 w-8 rounded bg-primary text-white flex items-center justify-center font-bold text-sm">
                                    A
                                </div>
                                <span className="font-display font-bold text-xl text-secondary-foreground">Aqkianda</span>
                            </div>
                            <p className="text-xs sm:text-sm text-secondary-foreground/70 max-w-xs leading-relaxed">
                                O marketplace que conecta compradores e vendedores em toda a Angola — novo ou usado, encontras tudo aqui.
                            </p>
                        </div>
                        
                        <div className="md:col-span-3 grid grid-cols-3 gap-2 sm:gap-6">
                            <div>
                                <h4 className="font-display font-semibold mb-3 text-xs sm:text-sm">Mercado</h4>
                                <ul className="space-y-2.5 text-xs sm:text-sm text-secondary-foreground/70">
                                    <li><Link to="/explorar" className="hover:text-primary transition-colors">Explorar</Link></li>
                                    <li><Link to="/explorar" className="hover:text-primary transition-colors">Categorias</Link></li>
                                    <li><Link to="/publicar" className="hover:text-primary transition-colors">Publicar</Link></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h4 className="font-display font-semibold mb-3 text-xs sm:text-sm">Conta</h4>
                                <ul className="space-y-2.5 text-xs sm:text-sm text-secondary-foreground/70">
                                    <li><Link to="/entrar" className="hover:text-primary transition-colors">Entrar</Link></li>
                                    <li><Link to="/perfil" className="hover:text-primary transition-colors">Perfil</Link></li>
                                    <li><Link to="/mensagens" className="hover:text-primary transition-colors">Mensagens</Link></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h4 className="font-display font-semibold mb-3 text-xs sm:text-sm">Sobre</h4>
                                <ul className="space-y-2.5 text-xs sm:text-sm text-secondary-foreground/70">
                                    <li className="cursor-pointer hover:text-primary transition-colors">Funcionamento</li>
                                    <li className="cursor-pointer hover:text-primary transition-colors">Segurança</li>
                                    <li className="cursor-pointer hover:text-primary transition-colors">Termos</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div className="border-t border-secondary-foreground/10 py-6 text-center text-xs text-secondary-foreground/50">
                        © {new Date().getFullYear()} Aqkianda. Feito com <span className="text-primary font-bold">♥</span> em Angola.
                    </div>
                </div>
            </footer>

        </div>
    );
};

export default TemplateAlibabaV4;
