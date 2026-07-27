import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Search, Heart, MapPin, Star, ChevronRight, Shield, Truck, DollarSign,
    Phone, Building2, BadgeCheck, ArrowUpRight, Factory, Globe, Clock,
    CheckCircle, X, Menu, User, ShoppingBag, Filter, SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";

const iconMap: Record<string, any> = {
    Smartphone: "📱", Car: "🚗", Home: "🏠", Shirt: "👕",
    Sofa: "🛋️", Dumbbell: "💪", Briefcase: "💼", Wrench: "🔧"
};

const alibabaCategories = [
    { slug: "eletronica", name: "Electrónica", count: 1240 },
    { slug: "viaturas", name: "Veículos & Auto", count: 890 },
    { slug: "imoveis", name: "Imóveis", count: 560 },
    { slug: "moda", name: "Têxtil & Moda", count: 2340 },
    { slug: "moveis", name: "Mobiliário", count: 780 },
    { slug: "desporto", name: "Desporto & Lazer", count: 450 },
    { slug: "maquinas", name: "Máquinas Indústria", count: 320 },
    { slug: "alimentos", name: "Alimentos & Bebidas", count: 670 },
];

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

const TemplateAlibaba = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Bar */}
            <div className="bg-[#FF6A00] text-white text-xs">
                <div className="container mx-auto px-4 flex items-center justify-between h-8">
                    <div className="hidden md:flex items-center gap-4">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Sourcing Solutions</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> AJuda & Suporte</span>
                        <span>Vender no Alibaba Angola</span>
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
                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-2 shrink-0">
                            <div className="bg-[#FF6A00] text-white font-bold text-2xl px-3 py-1.5 rounded-lg tracking-tighter">
                                Aq
                            </div>
                            <div className="hidden lg:block">
                                <div className="font-bold text-xl text-[#FF6A00] leading-none">Aqkianda</div>
                                <div className="text-[10px] text-gray-400 font-medium tracking-widest uppercase">Trade Platform</div>
                            </div>
                        </Link>

                        {/* Search Bar */}
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
                            <div className="flex gap-3 mt-2 text-[11px] text-gray-400 px-2">
                                <span>Populares:</span>
                                <span className="text-[#FF6A00] cursor-pointer hover:underline">Smartphones</span>
                                <span className="text-[#FF6A00] cursor-pointer hover:underline">Peças Automóvel</span>
                                <span className="text-[#FF6A00] cursor-pointer hover:underline">Têxteis</span>
                                <span className="text-[#FF6A00] cursor-pointer hover:underline">Construção</span>
                            </div>
                        </div>

                        {/* Nav Actions */}
                        <div className="hidden md:flex items-center gap-2 shrink-0">
                            <Link to="/entrar" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors">
                                <User className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Conta</span>
                            </Link>
                            <Link to="/mensagens" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors relative">
                                <Phone className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Mensagens</span>
                                <span className="absolute -top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">3</span>
                            </Link>
                            <Link to="/favoritos" className="flex flex-col items-center px-3 py-1 text-gray-500 hover:text-[#FF6A00] transition-colors">
                                <Heart className="h-5 w-5" />
                                <span className="text-[10px] mt-0.5">Favoritos</span>
                            </Link>
                            <Link to="/publicar" className="bg-[#FF6A00] hover:bg-[#e55f00] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors ml-2">
                                Fazer Pedido
                            </Link>
                        </div>

                        {/* Mobile Menu */}
                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
                            <Menu className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Navigation Bar */}
                    <div className="flex items-center gap-6 mt-3 text-sm overflow-x-auto pb-1">
                        <div className="flex items-center gap-1 text-[#FF6A00] font-bold text-base shrink-0">
                            <Building2 className="h-5 w-5" /> Categorias
                        </div>
                        {["Dashboard", "Pedidos", "Protegido Comércio", "Sourcing RFQ", "Serviços", "Loja Premium"].map((item) => (
                            <span key={item} className="cursor-pointer hover:text-[#FF6A00] whitespace-nowrap transition-colors text-gray-600">{item}</span>
                        ))}
                    </div>
                </div>
            </header>

            {/* Hero Banner */}
            <section className="bg-gradient-to-r from-[#FF6A00] via-[#FF8533] to-[#FFB366]">
                <div className="container mx-auto px-4 py-10 md:py-14">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 text-white">
                            <div className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-2">Plataforma B2B #1 em Angola</div>
                            <h1 className="font-bold text-3xl md:text-5xl leading-tight mb-4">
                                Compre para o seu negócio com <span className="underline decoration-yellow-300 decoration-4">confiança</span>
                            </h1>
                            <p className="text-white/80 text-sm md:text-base mb-6 max-w-lg">
                                Conectamos os melhores fornecedores angolanos com compradores de todo o país. Preços competitivos, verificação de qualidade e proteção ao pagamento.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <button className="bg-white text-[#FF6A00] font-bold px-6 py-3 rounded-full text-sm hover:bg-gray-100 transition-colors flex items-center gap-2">
                                    <Search className="h-4 w-4" /> Explorar Produtos
                                </button>
                                <button className="border-2 border-white text-white font-bold px-6 py-3 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2">
                                    <Factory className="h-4 w-4" /> Sou Fornecedor
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center text-white border border-white/20">
                                <div className="font-bold text-2xl">50K+</div>
                                <div className="text-xs opacity-80">Produtos</div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center text-white border border-white/20">
                                <div className="font-bold text-2xl">12K+</div>
                                <div className="text-xs opacity-80">Fornecedores</div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center text-white border border-white/20">
                                <div className="font-bold text-2xl">98%</div>
                                <div className="text-xs opacity-80">Satisfação</div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center text-white border border-white/20">
                                <div className="font-bold text-2xl">18</div>
                                <div className="text-xs opacity-80">Províncias</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories Strip */}
            <section className="bg-white border-b">
                <div className="container mx-auto px-4 py-5">
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                        {alibabaCategories.map((cat) => (
                            <Link key={cat.slug} to={`/explorar?cat=${cat.slug}`} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-orange-50 transition-colors group cursor-pointer">
                                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                    {iconMap[cat.slug] || "📦"}
                                </div>
                                <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">{cat.name}</span>
                                <span className="text-[9px] text-gray-400">{cat.count}+</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Product Grid */}
            <section className="container mx-auto px-4 py-8">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="font-bold text-2xl text-gray-900">Produtos Recomendados</h2>
                        <p className="text-sm text-gray-500 mt-1">Seleção curada para o mercado angolano</p>
                    </div>
                    <Link to="/explorar" className="text-[#FF6A00] text-sm font-semibold flex items-center gap-1 hover:underline">
                        Ver tudo <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {listings.slice(0, 10).map((item) => (
                        <Link key={item.id} to={`/anuncio/${item.id}`} className="bg-white rounded-xl border border-gray-200 hover:border-[#FF6A00] hover:shadow-lg transition-all overflow-hidden group block">
                            {/* Image */}
                            <div className="relative aspect-square bg-gray-100 overflow-hidden">
                                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {item.featured && (
                                    <span className="absolute top-2 left-2 bg-[#FF6A00] text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                        Verified
                                    </span>
                                )}
                                <button onClick={(e) => e.preventDefault()} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors shadow-sm">
                                    <Heart className="h-3.5 w-3.5 text-gray-400" />
                                </button>
                            </div>
                            {/* Info */}
                            <div className="p-3">
                                <h3 className="font-medium text-xs text-gray-800 line-clamp-2 leading-tight mb-2 group-hover:text-[#FF6A00] transition-colors">{item.title}</h3>
                                <div className="text-[#FF6A00] font-bold text-sm mb-1">
                                    {item.price > 0 ? formatPrice(item.price, "AOA") : "Grátis"}
                                </div>
                                {item.price > 0 && (
                                    <div className="text-[10px] text-gray-400">MOQ: 1 unidade</div>
                                )}
                                <div className="flex items-center gap-1 mt-2">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    <span className="text-[11px] text-gray-500">{item.rating}</span>
                                    <span className="text-[10px] text-gray-300">|</span>
                                    <MapPin className="h-3 w-3 text-gray-300" />
                                    <span className="text-[10px] text-gray-400 truncate">{item.location.split(",")[0]}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Verified Suppliers */}
            <section className="bg-white py-8 border-t border-b">
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
                            <span className="text-xs text-gray-500">| Trade Platform</span>
                        </div>
                        <p className="text-xs"> 2026 Aqkianda Trade Co. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default TemplateAlibaba;