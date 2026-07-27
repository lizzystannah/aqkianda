import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Search, Heart, MapPin, Star, ChevronRight, ChevronLeft, Tag,
    Percent, Zap, Gift, Truck, ShieldCheck, Flame, Clock,
    Menu, User, ShoppingBag, Filter, ArrowRight, Award,
    Sparkles, TrendingUp, CircleHelp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const aliCategories = [
    { slug: "eletronica", name: "Telefone & Eletrônicos", icon: "📱", bg: "bg-blue-500" },
    { slug: "viaturas", name: "Automóveis", icon: "🚗", bg: "bg-red-500" },
    { slug: "imoveis", name: "Imóveis", icon: "🏠", bg: "bg-green-500" },
    { slug: "moda", name: "Moda", icon: "👗", bg: "bg-pink-500" },
    { slug: "moveis", name: "Casa & Jardim", icon: "🛋️", bg: "bg-yellow-500" },
    { slug: "desporto", name: "Esportes", icon: "⚽", bg: "bg-purple-500" },
    { slug: "beleza", name: "Beleza", icon: "💄", bg: "bg-rose-500" },
    { slug: "brinquedos", name: "Brinquedos", icon: "🎮", bg: "bg-indigo-500" },
];

const flashDeals = [
    { id: "f1", title: "Fone Bluetooth TWS", originalPrice: 25000, salePrice: 8900, sold: 847, image: "https://images.unsplash.com/photo-1590658268037-6bf12167a837?auto=format&fit=crop&w=400&q=80" },
    { id: "f2", title: "Smartwatch Fitness", originalPrice: 45000, salePrice: 15900, sold: 1203, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80" },
    { id: "f3", title: "Capa iPhone MagSafe", originalPrice: 12000, salePrice: 3500, sold: 2891, image: "https://images.unsplash.com/photo-1601784859495-58f10ca864ff?auto=format&fit=crop&w=400&q=80" },
    { id: "f4", title: "Carregador Rápido 65W", originalPrice: 18000, salePrice: 6500, sold: 567, image: "https://images.unsplash.com/photo-1619952003049-b418b801d374?auto=format&fit=crop&w=400&q=80" },
    { id: "f5", title: "Teclado Mecânico RGB", originalPrice: 35000, salePrice: 12900, sold: 389, image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80" },
];

const coupons = [
    { value: "5.000", min: "Compras +30.000", color: "bg-red-500", claimed: 12400 },
    { value: "15.000", min: "Compras +100.000", color: "bg-orange-500", claimed: 8900 },
    { value: "50.000", min: "Compras +300.000", color: "bg-yellow-500", claimed: 3200 },
];

const TemplateAliExpress = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const [heroIndex, setHeroIndex] = useState(0);
    const heroBanners = [
        { bg: "from-red-600 via-red-500 to-orange-400", title: "Super Promoção de Inverno", subtitle: "Até 80% em milhares de produtos", cta: "Comprar Agora" },
        { bg: "from-blue-600 via-purple-500 to-pink-400", title: "Novos Chegados 2026", subtitle: "As últimas tendências com envio rápido", cta: "Explorar" },
        { bg: "from-green-600 via-emerald-500 to-teal-400", title: "Cupões Exclusivos", subtitle: "Economize ainda mais com cupões extras", cta: "Reclamar Cupão" },
    ];

    const featuredItems = listings.filter(l => l.featured);

    return (
        <div className="min-h-screen bg-[#f5f5f5]">
            {/* Top Promo Bar */}
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white text-xs overflow-hidden">
                <div className="container mx-auto px-4 flex items-center justify-between h-9">
                    <div className="flex items-center gap-4 animate-marquee">
                        <span className="flex items-center gap-1 shrink-0"><Gift className="h-3.5 w-3.5" /> Cupão de Boas-Vindas</span>
                        <span className="hidden sm:inline shrink-0">•</span>
                        <span className="hidden sm:inline shrink-0">Frete Grátis para Angola</span>
                        <span className="hidden sm:inline shrink-0">•</span>
                        <span className="hidden md:inline shrink-0"><Zap className="h-3.5 w-3.5" /> Flash Sales</span>
                        <span className="hidden md:inline shrink-0">•</span>
                        <span className="hidden md:inline shrink-0">Devolução 15 dias</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline">📱 App</span>
                        <span>PT | AOA</span>
                    </div>
                </div>
            </div>

            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-red-100">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu */}
                        <button className="md:hidden p-1">
                            <Menu className="h-6 w-6 text-gray-600" />
                        </button>

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-2 shrink-0">
                            <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white font-black text-xl px-3 py-1.5 rounded-lg shadow-lg shadow-red-200">
                                Aq
                            </div>
                            <div className="hidden lg:block">
                                <div className="font-black text-xl bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent leading-none">Aqkianda</div>
                            </div>
                        </Link>

                        {/* Search Bar */}
                        <div className="flex-1 max-w-xl mx-4">
                            <div className="flex rounded-full overflow-hidden border-2 border-red-500">
                                <input
                                    type="text"
                                    placeholder="Pesquisar produtos, marcas..."
                                    className="flex-1 px-5 py-2.5 text-sm outline-none bg-white"
                                />
                                <button className="bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-90 text-white px-7 font-bold flex items-center gap-2 transition-opacity">
                                    <Search className="h-4.5 w-4.5" />
                                    <span className="hidden sm:inline">Pesquisar</span>
                                </button>
                            </div>
                            <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400 pl-2">
                                <span>🔥 Frete Grátis</span>
                                <span>⭐ Mais Vendidos</span>
                                <span className="hidden sm:inline">🎁 Novos Usuários</span>
                                <span className="hidden sm:inline">💎 Premium</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="hidden md:flex items-center gap-1 shrink-0">
                            <Link to="/entrar" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-red-500 transition-colors group">
                                <User className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] mt-0.5">Conta</span>
                            </Link>
                            <Link to="/favoritos" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-red-500 transition-colors group relative">
                                <Heart className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] mt-0.5">Wishlist</span>
                            </Link>
                            <Link to="/mensagens" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-red-500 transition-colors group relative">
                                <CircleHelp className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] mt-0.5">Apoio</span>
                            </Link>
                            <Link to="/publicar" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-red-500 transition-colors group relative">
                                <ShoppingBag className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] mt-0.5">Carrinho</span>
                                <span className="absolute -top-1 right-0 h-4.5 w-4.5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold border-2 border-white">0</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Carousel */}
            <section className="container mx-auto px-4 pt-5">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "21/7" }}>
                    {heroBanners.map((banner, i) => (
                        <div
                            key={i}
                            className={`absolute inset-0 bg-gradient-to-r ${banner.bg} transition-opacity duration-500 ${i === heroIndex ? "opacity-100" : "opacity-0"}`}
                        >
                            <div className="absolute inset-0 bg-black/10" />
                            <div className="relative h-full flex items-center">
                                <div className="container mx-auto px-8 md:px-12">
                                    <div className="max-w-lg">
                                        <div className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                                            <Sparkles className="h-3.5 w-3.5" /> Oferta Limitada
                                        </div>
                                        <h2 className="font-black text-3xl md:text-5xl text-white leading-tight mb-3">{banner.title}</h2>
                                        <p className="text-white/80 text-sm md:text-lg mb-6">{banner.subtitle}</p>
                                        <button className="bg-white text-red-600 font-bold px-8 py-3 rounded-full text-sm hover:bg-gray-100 transition-colors shadow-lg inline-flex items-center gap-2">
                                            {banner.cta} <ArrowRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setHeroIndex(p => (p - 1 + heroBanners.length) % heroBanners.length)} className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 z-10">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={() => setHeroIndex(p => (p + 1) % heroBanners.length)} className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 z-10">
                        <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                        {heroBanners.map((_, i) => (
                            <button key={i} onClick={() => setHeroIndex(i)} className={`h-2 rounded-full transition-all ${i === heroIndex ? "w-8 bg-white" : "w-2 bg-white/40"}`} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Category Icons */}
            <section className="container mx-auto px-4 py-6">
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-4">
                        {aliCategories.map((cat) => (
                            <Link key={cat.slug} to={`/explorar?cat=${cat.slug}`} className="flex flex-col items-center gap-2 group cursor-pointer">
                                <div className={`w-14 h-14 ${cat.bg} rounded-full flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all`}>
                                    {cat.icon}
                                </div>
                                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Coupons Strip */}
            <section className="container mx-auto px-4 py-4">
                <div className="flex items-center gap-4 overflow-x-auto pb-2">
                    <div className="flex items-center gap-2 shrink-0">
                        <Tag className="h-5 w-5 text-red-500" />
                        <span className="font-bold text-sm text-gray-800 whitespace-nowrap">Cupões do Dia</span>
                    </div>
                    {coupons.map((coupon, i) => (
                        <button key={i} className={`shrink-0 ${coupon.color} text-white rounded-xl p-4 flex items-center gap-3 min-w-[200px] hover:shadow-lg hover:scale-105 transition-all`}>
                            <div className="text-center">
                                <div className="text-[10px] opacity-80">-{coupon.value}</div>
                                <div className="font-black text-xl">AOA</div>
                                <div className="text-[9px] opacity-80 mt-0.5">{coupon.min}</div>
                            </div>
                            <div className="h-10 w-[1px] bg-white/30" />
                            <div className="text-right">
                                <div className="text-[10px] opacity-80">{coupon.claimed.toLocaleString()} usados</div>
                                <div className="font-bold text-xs mt-1">RECLAMAR</div>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* Flash Deals */}
            <section className="container mx-auto px-4 py-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <Flame className="h-6 w-6 text-red-500" />
                            <h2 className="font-black text-xl text-red-600">Flash Deals</h2>
                            <Clock className="h-4 w-4 text-orange-500" />
                            <div className="flex items-center gap-1">
                                <span className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded">05</span>
                                <span className="text-gray-900 font-bold">:</span>
                                <span className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded">23</span>
                                <span className="text-gray-900 font-bold">:</span>
                                <span className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded">47</span>
                            </div>
                        </div>
                        <Link to="/explorar" className="text-red-500 text-sm font-semibold flex items-center gap-1 hover:underline">
                            Ver tudo <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                        {flashDeals.map((deal) => {
                            const discount = Math.round((1 - deal.salePrice / deal.originalPrice) * 100);
                            return (
                                <div key={deal.id} className="group cursor-pointer">
                                    <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 mb-2">
                                        <img src={deal.image} alt={deal.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                        <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                                            -{discount}%
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-2">
                                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(deal.sold / 1500) * 100}%` }} />
                                            </div>
                                            <div className="text-[9px] text-white font-medium mt-0.5">{deal.sold} vendidos</div>
                                        </div>
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="font-bold text-red-600 text-base">
                                            {formatPrice(deal.salePrice, "AOA")}
                                        </div>
                                        <div className="text-[11px] text-gray-400 line-through">
                                            {formatPrice(deal.originalPrice, "AOA")}
                                        </div>
                                        <div className="text-[10px] text-gray-500 line-clamp-1">{deal.title}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Trust Badges */}
            <section className="container mx-auto px-4 py-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { icon: Truck, title: "Envio Rápido", desc: "Para todo Angola", color: "text-blue-500", bg: "bg-blue-50" },
                        { icon: ShieldCheck, title: "Compra Segura", desc: "Pagamento protegido", color: "text-green-500", bg: "bg-green-50" },
                        { icon: Award, title: "Qualidade", desc: "Produtos verificados", color: "text-purple-500", bg: "bg-purple-50" },
                        { icon: Gift, title: "Devoluções Grátis", desc: "Em 15 dias", color: "text-orange-500", bg: "bg-orange-50" },
                    ].map((badge, i) => (
                        <div key={i} className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className={`w-10 h-10 ${badge.bg} rounded-lg flex items-center justify-center shrink-0`}>
                                <badge.icon className={`h-5 w-5 ${badge.color}`} />
                            </div>
                            <div>
                                <div className="font-semibold text-xs text-gray-800">{badge.title}</div>
                                <div className="text-[10px] text-gray-400">{badge.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Featured Products Grid */}
            <section className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-red-500" />
                        <h2 className="font-black text-xl">Recomendados para Si</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="rounded-full text-xs h-8 border-red-200 text-red-500 hover:bg-red-50">
                            <Filter className="h-3.5 w-3.5 mr-1" /> Filtros
                        </Button>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {listings.slice(0, 10).map((item) => (
                        <Link key={item.id} to={`/anuncio/${item.id}`} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all group block">
                            <div className="relative aspect-square bg-gray-100 overflow-hidden">
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {item.featured && (
                                    <span className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                        <Zap className="h-3 w-3" /> Top
                                    </span>
                                )}
                                <button
                                    onClick={(e) => { e.preventDefault(); toggleFavorite(item.id); }}
                                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
                                >
                                    <Heart className={`h-3.5 w-3.5 transition-colors ${isFavorite(item.id) ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                                </button>
                                {item.condition === "novo" && (
                                    <span className="absolute bottom-2 left-2 bg-blue-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Novo</span>
                                )}
                            </div>
                            <div className="p-3">
                                <h3 className="text-xs text-gray-800 line-clamp-2 leading-tight mb-2 group-hover:text-red-500 transition-colors">{item.title}</h3>
                                <div className="flex items-center justify-between">
                                    <div className="font-black text-red-600 text-sm">
                                        {item.price > 0 ? formatPrice(item.price, "AOA") : "Grátis"}
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                        <span className="text-[11px] text-gray-500">{item.rating}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate">{item.location.split(",")[0]}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* CTA Banner */}
            <section className="container mx-auto px-4 py-6">
                <div className="relative bg-gradient-to-r from-red-600 via-pink-500 to-purple-500 rounded-2xl p-8 overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-400 rounded-full opacity-20 -translate-y-10 translate-x-10" />
                    <div className="absolute bottom-0 left-20 w-24 h-24 bg-white rounded-full opacity-10 translate-y-8" />
                    <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-white text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                                <Gift className="h-5 w-5" />
                                <span className="text-xs font-bold uppercase tracking-widest">Oferta Especial</span>
                            </div>
                            <h2 className="font-black text-2xl md:text-3xl">Publique o seu produto</h2>
                            <p className="text-white/80 text-sm mt-2">100% grátis • Sem comissão • Alcance milhares de compradores</p>
                        </div>
                        <Link to="/publicar">
                            <Button className="bg-white text-red-600 hover:bg-gray-100 font-black px-8 h-12 rounded-full shadow-lg shrink-0">
                                <Tag className="h-4 w-4 mr-2" /> Publicar Agora
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-10">
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
                        <div className="col-span-2 md:col-span-1">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white font-black text-lg px-2 py-0.5 rounded-lg shadow-lg">Aq</div>
                                <span className="font-black text-white text-lg">Aqkianda</span>
                            </div>
                            <p className="text-xs leading-relaxed">Marketplace online líder em Angola. Compre e venda milhões de produtos com segurança e confiança.</p>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3 text-sm">Comprar</h4>
                            <div className="space-y-2 text-xs">
                                <p className="hover:text-white cursor-pointer">Categorias</p>
                                <p className="hover:text-white cursor-pointer">Flash Deals</p>
                                <p className="hover:text-white cursor-pointer">Frete Grátis</p>
                                <p className="hover:text-white cursor-pointer">Cupões</p>
                                <p className="hover:text-white cursor-pointer">Novidades</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3 text-sm">Vender</h4>
                            <div className="space-y-2 text-xs">
                                <p className="hover:text-white cursor-pointer">Começar a Vender</p>
                                <p className="hover:text-white cursor-pointer">Vendedor Premium</p>
                                <p className="hover:text-white cursor-pointer">Analytics</p>
                                <p className="hover:text-white cursor-pointer">Marketing</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-3 text-sm">Apoio</h4>
                            <div className="space-y-2 text-xs">
                                <p className="hover:text-white cursor-pointer">Centro Ajuda</p>
                                <p className="hover:text-white cursor-pointer">Devoluções</p>
                                <p className="hover:text-white cursor-pointer">Segurança</p>
                                <p className="hover:text-white cursor-pointer">FAQ</p>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-xs"> 2026 Aqkianda. Todos os direitos reservados.</p>
                        <div className="flex items-center gap-4 text-xs">
                            <span className="hover:text-white cursor-pointer">Privacidade</span>
                            <span className="hover:text-white cursor-pointer">Termos</span>
                            <span className="hover:text-white cursor-pointer">Cookies</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default TemplateAliExpress;