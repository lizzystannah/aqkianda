/**
 * Template Aqkianda - Versão 3 (Melhoria 2)
 * - Filtros laterais funcionais
 * - Cards de produto aprimorados com badge de preço e faixa
 * - Sidebar com filtros por categoria, preço e localização
 * - Removidas referências Alibaba
 */
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    Search, Heart, MapPin, Star, ChevronRight, ChevronLeft, Shield, Truck, DollarSign,
    Phone, Building2, BadgeCheck, Factory, Globe, Clock,
    Menu, User, SlidersHorizontal, Filter, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice, matchesListingSearch } from "@/data/listings";

const heroBgImage = "https://images.unsplash.com/photo-1556742049-0cfed2f2a5d2?auto=format&fit=crop&w=1920&q=80";

const verifiedSuppliers = [
    { name: "TechImport LDA", products: 86, verified: true, years: 5, location: "Luanda" },
    { name: "AutoParts Angola", products: 234, verified: true, years: 8, location: "Benguela" },
    { name: "Moda Africana SA", products: 156, verified: true, years: 3, location: "Huambo" },
    { name: "BuildTech Materiais", products: 412, verified: true, years: 12, location: "Luanda" },
];

const tradeData = [
    { country: "China", products: "34.2K", icon: "🇨🇳" },
    { country: "Portugal", products: "12.8K", icon: "🇵🇹" },
    { country: "Turquia", products: "8.5K", icon: "🇹🇷" },
    { country: "Índia", products: "6.1K", icon: "🇮🇳" },
    { country: "Brasil", products: "4.3K", icon: "🇧🇷" },
];

const priceRanges = [
    { label: "Até 50.000 AOA", min: 0, max: 50000 },
    { label: "50.000 - 200.000 AOA", min: 50000, max: 200000 },
    { label: "200.000 - 1.000.000 AOA", min: 200000, max: 1000000 },
    { label: "Acima de 1.000.000 AOA", min: 1000000, max: Infinity },
];

const locations = ["Luanda", "Benguela", "Huambo", "Lobito", "Talantona", "Kilamba"];

const TemplateAlibabaV3 = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [selectedPriceRange, setSelectedPriceRange] = useState<number | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<string>("all");
    const [sortBy, setSortBy] = useState<string>("relevance");
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

    const filteredListings = useMemo(() => {
        const filtered = listings.filter(item => {
            const matchesSearch = !searchQuery.trim() || matchesListingSearch(item, searchQuery.trim());
            const matchesCategory = selectedCategory === "all" || item.categoryId === selectedCategory;
            const matchesPrice = selectedPriceRange === null ||
                (item.price >= priceRanges[selectedPriceRange].min && item.price < priceRanges[selectedPriceRange].max);
            const matchesLocation = selectedLocation === "all" || item.location.toLowerCase().includes(selectedLocation.toLowerCase());
            return matchesSearch && matchesCategory && matchesPrice && matchesLocation;
        });

        switch (sortBy) {
            case "price-asc":
                return [...filtered].sort((a, b) => a.price - b.price);
            case "price-desc":
                return [...filtered].sort((a, b) => b.price - a.price);
            case "rating":
                return [...filtered].sort((a, b) => b.rating - a.rating);
            default:
                return filtered;
        }
    }, [searchQuery, selectedCategory, selectedPriceRange, selectedLocation, sortBy]);

    const clearFilters = () => {
        setSelectedCategory("all");
        setSelectedPriceRange(null);
        setSelectedLocation("all");
        setSortBy("relevance");
        setSearchQuery("");
    };

    const hasActiveFilters = selectedCategory !== "all" || selectedPriceRange !== null || selectedLocation !== "all";

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Bar */}
            <div className="bg-[#FF6A00] text-white text-xs">
                <div className="container mx-auto px-4 flex items-center justify-between h-8">
                    <div className="hidden md:flex items-center gap-4">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Sourcing Solutions</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Ajuda & Suporte</span>
                        <span>Vender no Aqkianda</span>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                        <span className="hidden sm:inline">App Móvel</span>
                        <span>PT-AO | AOA ₡</span>
                    </div>
                </div>
            </div>

            {/* Main Header */}
            <header className="bg-white border-b-2 border-[#FF6A00] sticky top-0 z-50">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="flex items-center gap-2 shrink-0">
                            <div className="bg-[#FF6A00] text-white font-bold text-2xl px-3 py-1.5 rounded-lg tracking-tighter">
                                Aq
                            </div>
                            <div className="hidden lg:block">
                                <div className="font-bold text-xl text-[#FF6A00] leading-none">Aqkianda</div>
                                <div className="text-[10px] text-gray-400 font-medium tracking-widest uppercase">Plataforma Comercial</div>
                            </div>
                        </Link>

                        <div className="flex-1 max-w-2xl mx-4">
                            <div className="flex border-2 border-[#FF6A00] rounded-full overflow-hidden">
                                <div className="hidden sm:flex items-center px-4 py-2 bg-gray-50 border-r border-gray-200 text-sm text-gray-500">
                                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" /> Produtos
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="O que procura para o seu negócio?"
                                    className="flex-1 px-4 py-2.5 text-sm outline-none bg-white"
                                />
                                <button className="bg-[#FF6A00] hover:bg-[#e55f00] text-white px-6 sm:px-8 font-semibold transition-colors flex items-center gap-2">
                                    <Search className="h-4.5 w-4.5" />
                                    <span className="hidden sm:inline">Pesquisar</span>
                                </button>
                            </div>
                        </div>

                        <div className="hidden md:flex items-center gap-2 shrink-0">
                            <Link to="/entrar" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors">
                                <User className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Conta</span>
                            </Link>
                            <Link to="/mensagens" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors relative">
                                <Phone className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Mensagens</span>
                            </Link>
                            <Link to="/favoritos" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors">
                                <Heart className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Favoritos</span>
                            </Link>
                            <Link to="/publicar" className="bg-[#FF6A00] hover:bg-[#e55f00] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors ml-2">
                                Fazer Pedido
                            </Link>
                        </div>

                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
                            <Menu className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex items-center gap-6 mt-3 text-sm overflow-x-auto pb-1">
                        <div className="flex items-center gap-1 text-[#FF6A00] font-bold text-base shrink-0">
                            <Building2 className="h-5 w-5" /> Categorias
                        </div>
                        {categories.map((cat) => (
                            <button
                                key={cat.slug}
                                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? "all" : cat.slug)}
                                className={`cursor-pointer whitespace-nowrap transition-colors ${selectedCategory === cat.slug ? "text-[#FF6A00] font-bold" : "text-gray-600 hover:text-[#FF6A00]"}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Hero Banner com imagem de fundo */}
            <section
                className="relative text-white overflow-hidden"
                style={{
                    backgroundImage: `url(${heroBgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-[#FF6A00]/90 via-[#FF8533]/80 to-[#FFB366]/70 z-0" />
                <div className="absolute inset-0 bg-black/20 z-[1]" />

                <div className="container mx-auto px-4 py-10 md:py-16 relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1">
                            <div className="text-xs font-semibold uppercase tracking-widest opacity-90 mb-2 flex items-center gap-2">
                                <span className="inline-block w-8 h-[2px] bg-white/80" />
                                Plataforma B2B #1 em Angola
                            </div>
                            <h1 className="font-bold text-3xl md:text-5xl leading-tight mb-4 drop-shadow-lg">
                                Compre para o seu negócio com <br />
                                <span className="text-yellow-200 underline decoration-yellow-300 decoration-4 underline-offset-4">confiança total</span>
                            </h1>
                            <p className="text-white/90 text-sm md:text-base mb-6 max-w-lg leading-relaxed drop-shadow">
                                Conectamos os melhores fornecedores angolanos com compradores de todo o país.
                                Preços competitivos, verificação de qualidade e proteção ao pagamento.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <button className="bg-white text-[#FF6A00] font-bold px-6 py-3 rounded-full text-sm hover:bg-gray-100 transition-colors flex items-center gap-2 shadow-lg">
                                    <Search className="h-4 w-4" /> Explorar Produtos
                                </button>
                                <button className="border-2 border-white text-white font-bold px-6 py-3 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2 backdrop-blur-sm">
                                    <Factory className="h-4 w-4" /> Sou Fornecedor
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div className="bg-white/20 backdrop-blur-md rounded-xl p-5 text-center border border-white/30 shadow-xl">
                                <div className="font-bold text-3xl">50K+</div>
                                <div className="text-xs opacity-90 mt-1 font-medium">Produtos</div>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md rounded-xl p-5 text-center border border-white/30 shadow-xl">
                                <div className="font-bold text-3xl">12K+</div>
                                <div className="text-xs opacity-90 mt-1 font-medium">Fornecedores</div>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md rounded-xl p-5 text-center border border-white/30 shadow-xl">
                                <div className="font-bold text-3xl">98%</div>
                                <div className="text-xs opacity-90 mt-1 font-medium">Satisfação</div>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md rounded-xl p-5 text-center border border-white/30 shadow-xl">
                                <div className="font-bold text-3xl">18</div>
                                <div className="text-xs opacity-90 mt-1 font-medium">Províncias</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Content with Sidebar */}
            <div className="container mx-auto px-4 py-8">
                <div className="flex gap-6">
                    {/* Mobile Filter Toggle */}
                    <button
                        onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                        className="lg:hidden fixed bottom-6 right-6 z-50 bg-[#FF6A00] text-white p-4 rounded-full shadow-lg hover:bg-[#e55f00] transition-colors"
                    >
                        <Filter className="h-5 w-5" />
                    </button>

                    {/* Sidebar Filters */}
                    <aside className={`lg:w-64 shrink-0 ${sidebarOpen ? 'block' : 'hidden lg:block'} ${mobileFilterOpen ? 'fixed inset-0 z-40 bg-white p-4 overflow-auto' : ''}`}>
                        {mobileFilterOpen && (
                            <button onClick={() => setMobileFilterOpen(false)} className="lg:hidden absolute top-4 right-4">
                                <X className="h-6 w-6" />
                            </button>
                        )}

                        <div className="sticky top-24 space-y-6">
                            {/* Filter Header */}
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    <Filter className="h-5 w-5 text-[#FF6A00]" /> Filtros
                                </h3>
                                {hasActiveFilters && (
                                    <button onClick={clearFilters} className="text-xs text-[#FF6A00] hover:underline font-medium">
                                        Limpar tudo
                                    </button>
                                )}
                            </div>

                            {/* Category Filter */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <h4 className="font-semibold text-sm text-gray-700 mb-3">Categoria</h4>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setSelectedCategory("all")}
                                        className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${selectedCategory === "all" ? "bg-[#FF6A00] text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                                    >
                                        Todas ({listings.length})
                                    </button>
                                    {categories.map((cat) => {
                                        const count = listings.filter(l => l.categoryId === cat.slug).length;
                                        return (
                                            <button
                                                key={cat.slug}
                                                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? "all" : cat.slug)}
                                                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${selectedCategory === cat.slug ? "bg-[#FF6A00] text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                <span>{cat.name}</span>
                                                <span className={`text-xs ${selectedCategory === cat.slug ? "text-white/80" : "text-gray-400"}`}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Price Range Filter */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <h4 className="font-semibold text-sm text-gray-700 mb-3">Faixa de Preço</h4>
                                <div className="space-y-2">
                                    {priceRanges.map((range, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedPriceRange(selectedPriceRange === i ? null : i)}
                                            className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${selectedPriceRange === i ? "bg-[#FF6A00] text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                                        >
                                            {range.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Location Filter */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <h4 className="font-semibold text-sm text-gray-700 mb-3">Localização</h4>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setSelectedLocation("all")}
                                        className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${selectedLocation === "all" ? "bg-[#FF6A00] text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                                    >
                                        Todas
                                    </button>
                                    {locations.map((loc) => (
                                        <button
                                            key={loc}
                                            onClick={() => setSelectedLocation(selectedLocation === loc ? "all" : loc)}
                                            className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${selectedLocation === loc ? "bg-[#FF6A00] text-white font-medium" : "text-gray-600 hover:bg-gray-100"}`}
                                        >
                                            <MapPin className="h-3.5 w-3.5" /> {loc}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Toggle Sidebar (Desktop) */}
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="hidden lg:flex w-full items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#FF6A00] transition-colors py-2"
                            >
                                {sidebarOpen ? <><ChevronLeft className="h-4 w-4" /> Ocultar filtros</> : <><ChevronRight className="h-4 w-4" /> Mostrar filtros</>}
                            </button>
                        </div>
                    </aside>

                    {/* Product Grid */}
                    <main className="flex-1 min-w-0">
                        {/* Results Bar */}
                        <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-gray-200 p-4">
                            <div>
                                <span className="text-sm text-gray-500">
                                    <span className="font-bold text-gray-900">{filteredListings.length}</span> produtos encontrados
                                </span>
                                {hasActiveFilters && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {selectedCategory !== "all" && (
                                            <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-[#FF6A00] px-2 py-1 rounded-full">
                                                {categories.find(c => c.slug === selectedCategory)?.name}
                                                <button onClick={() => setSelectedCategory("all")}><X className="h-3 w-3" /></button>
                                            </span>
                                        )}
                                        {selectedPriceRange !== null && (
                                            <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-[#FF6A00] px-2 py-1 rounded-full">
                                                {priceRanges[selectedPriceRange].label}
                                                <button onClick={() => setSelectedPriceRange(null)}><X className="h-3 w-3" /></button>
                                            </span>
                                        )}
                                        {selectedLocation !== "all" && (
                                            <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-[#FF6A00] px-2 py-1 rounded-full">
                                                {selectedLocation}
                                                <button onClick={() => setSelectedLocation("all")}><X className="h-3 w-3" /></button>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 hidden sm:inline">Ordenar:</span>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#FF6A00]"
                                >
                                    <option value="relevance">Relevância</option>
                                    <option value="price-asc">Menor preço</option>
                                    <option value="price-desc">Maior preço</option>
                                    <option value="rating">Melhor avaliação</option>
                                </select>
                            </div>
                        </div>

                        {filteredListings.length === 0 ? (
                            <div className="text-center py-16">
                                <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-500">Nenhum produto encontrado</h3>
                                <p className="text-sm text-gray-400 mt-2">Tente ajustar os filtros ou a pesquisa</p>
                                <button onClick={clearFilters} className="mt-4 text-[#FF6A00] text-sm font-medium hover:underline">
                                    Limpar todos os filtros
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredListings.map((item) => (
                                    <Link
                                        key={item.id}
                                        to={`/anuncio/${item.id}`}
                                        className="bg-white rounded-xl border border-gray-200 hover:border-[#FF6A00] hover:shadow-xl transition-all overflow-hidden group block"
                                    >
                                        <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                                            <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            {item.featured && (
                                                <span className="absolute top-3 left-3 bg-[#FF6A00] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                                                    <BadgeCheck className="h-3 w-3" /> Verificado
                                                </span>
                                            )}
                                            <span className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full ${item.condition === "novo" ? "bg-green-500 text-white" : "bg-blue-500 text-white"}`}>
                                                {item.condition === "novo" ? "Novo" : "Usado"}
                                            </span>
                                            <button onClick={(e) => e.preventDefault()} className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-[#FF6A00] hover:text-white transition-all shadow-sm">
                                                <Heart className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex items-center gap-1 mb-2">
                                                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {categories.find(c => c.slug === item.categoryId)?.name || item.categoryId}
                                                </span>
                                            </div>
                                            <h3 className="font-semibold text-sm text-gray-800 line-clamp-2 leading-tight mb-2 group-hover:text-[#FF6A00] transition-colors">{item.title}</h3>
                                            <div className="flex items-end justify-between mb-2">
                                                <div className="text-[#FF6A00] font-bold text-lg">
                                                    {item.price > 0 ? formatPrice(item.price, "AOA") : "Grátis"}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                                    <span className="text-xs font-medium text-gray-600">{item.rating}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-400">
                                                <MapPin className="h-3.5 w-3.5" />
                                                <span className="text-xs truncate">{item.location}</span>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                                                <span className="text-[10px] text-gray-400">{item.postedAt}</span>
                                                <span className="text-[10px] text-[#FF6A00] font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                                                    Ver detalhes <ChevronRight className="h-3 w-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {/* Verified Suppliers */}
            <section className="bg-white py-8 border-t border-b mt-8">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="font-bold text-2xl text-gray-900 flex items-center gap-2">
                                <BadgeCheck className="h-6 w-6 text-[#FF6A00]" /> Fornecedores Verificados
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Empresas certificadas com histórico comprovado</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {verifiedSuppliers.map((supplier, i) => (
                            <div key={i} className="border border-gray-200 rounded-xl p-5 hover:border-[#FF6A00] hover:shadow-md transition-all bg-white">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#FF6A00] to-orange-300 flex items-center justify-center text-white font-bold text-lg">
                                        {supplier.name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm truncate flex items-center gap-1">
                                            {supplier.name}
                                            {supplier.verified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
                                        </div>
                                        <div className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {supplier.location}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-lg py-2">
                                        <div className="font-bold text-sm">{supplier.products}</div>
                                        <div className="text-[9px] text-gray-400">Produtos</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg py-2">
                                        <div className="font-bold text-sm">{supplier.years}y</div>
                                        <div className="text-[9px] text-gray-400">Anos</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg py-2">
                                        <div className="font-bold text-sm text-green-600">✓</div>
                                        <div className="text-[9px] text-gray-400">Audiado</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Trade Protection Banner */}
            <section className="container mx-auto px-4 py-8">
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1">
                        <span className="text-[#FF6A00] text-xs font-bold uppercase tracking-widest">Protecção Total</span>
                        <h2 className="font-bold text-2xl md:text-3xl text-white mt-2">Comércio Protegido</h2>
                        <p className="text-gray-400 text-sm mt-3 mb-5 max-w-lg">
                            O seu pagamento fica seguro até confirmar o recebimento. Garantimos reembolso completo se algo correr mal.
                        </p>
                        <div className="flex flex-wrap gap-6">
                            <div className="flex items-center gap-2 text-white/80">
                                <Shield className="h-5 w-5 text-[#FF6A00]" /> Pagamento Seguro
                            </div>
                            <div className="flex items-center gap-2 text-white/80">
                                <Truck className="h-5 w-5 text-[#FF6A00]" /> Rastreamento
                            </div>
                            <div className="flex items-center gap-2 text-white/80">
                                <DollarSign className="h-5 w-5 text-[#FF6A00]" /> Reembolso
                            </div>
                        </div>
                    </div>
                    <Link to="/publicar" className="shrink-0">
                        <Button className="bg-[#FF6A00] hover:bg-[#e55f00] text-white font-bold px-8 h-12 rounded-full text-base">
                            Começar a Vender
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Global Sourcing */}
            <section className="bg-white py-8 border-t">
                <div className="container mx-auto px-4">
                    <h2 className="font-bold text-2xl text-gray-900 mb-6">Fornecedores Internacionais</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        {tradeData.map((d) => (
                            <div key={d.country} className="text-center p-4 border rounded-xl hover:border-[#FF6A00] transition-colors cursor-pointer">
                                <div className="text-3xl mb-2">{d.icon}</div>
                                <div className="font-semibold text-sm">{d.country}</div>
                                <div className="text-[11px] text-gray-400">{d.products} produtos</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-10">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <h4 className="text-white font-semibold mb-3">Sobre Nós</h4>
                            <div className="space-y-2 text-sm">
                                <p className="hover:text-white cursor-pointer">Quem Somos</p>
                                <p className="hover:text-white cursor-pointer">Política Privacidade</p>
                                <p className="hover:text-white cursor-pointer">Termos Uso</p>
                                <p className="hover:text-white cursor-pointer">Contactos</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3">Comprar</h4>
                            <div className="space-y-2 text-sm">
                                <p className="hover:text-white cursor-pointer">Categorias</p>
                                <p className="hover:text-white cursor-pointer">Protecção Cliente</p>
                                <p className="hover:text-white cursor-pointer">App Móvel</p>
                                <p className="hover:text-white cursor-pointer">RFQ Sourcing</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3">Vender</h4>
                            <div className="space-y-2 text-sm">
                                <p className="hover:text-white cursor-pointer">Começar a Vender</p>
                                <p className="hover:text-white cursor-pointer">Vendor Academy</p>
                                <p className="hover:text-white cursor-pointer">Publicidade</p>
                                <p className="hover:text-white cursor-pointer">Analytics</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3">Suporte</h4>
                            <div className="space-y-2 text-sm">
                                <p className="hover:text-white cursor-pointer">Centro Ajuda</p>
                                <p className="hover:text-white cursor-pointer">Resolver Disputas</p>
                                <p className="hover:text-white cursor-pointer">Denunciar</p>
                                <p className="hover:text-white cursor-pointer">FAQ</p>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="bg-[#FF6A00] text-white font-bold text-lg px-2 py-0.5 rounded">Aq</div>
                            <span className="font-bold text-white">Aqkianda</span>
                            <span className="text-xs text-gray-500">| Plataforma Comercial Angola</span>
                        </div>
                        <p className="text-xs">© 2026 Aqkianda. Todos os direitos reservados.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default TemplateAlibabaV3;