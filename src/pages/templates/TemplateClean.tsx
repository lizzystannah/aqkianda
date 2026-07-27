import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, Heart, MapPin, Star, Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Plus, ShieldCheck, Zap, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const TemplateClean = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const featured = listings.filter(l => l.featured).slice(0, 3);
    const recent = listings.slice(0, 8);

    return (
        <div className="min-h-screen bg-white text-slate-900 font-sans">
            {/* Header minimalista */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
                <div className="container flex h-16 items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                            <span className="font-bold text-white text-sm">A</span>
                        </div>
                        <span className="font-semibold text-lg tracking-tight">Aqkianda</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
                        <Link to="/explorar" className="hover:text-slate-900 transition-colors">Explorar</Link>
                        <Link to="/favoritos" className="hover:text-slate-900 transition-colors">Favoritos</Link>
                        <Link to="/mensagens" className="hover:text-slate-900 transition-colors">Mensagens</Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link to="/entrar" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Entrar</Link>
                        <Link to="/publicar">
                            <Button className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-5 h-9 text-sm">
                                <Plus className="h-4 w-4 mr-1" /> Publicar
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Clean */}
            <section className="container pt-20 pb-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="max-w-3xl mx-auto text-center"
                >
                    <span className="inline-block px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold tracking-wide mb-6">
                        MARKETPLACE #1 DE ANGOLA
                    </span>
                    <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-[1.1] mb-6">
                        Compra e vende <br />
                        <span className="font-semibold">com simplicidade.</span>
                    </h1>
                    <p className="text-slate-500 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                        Milhares de anúncios verificados. Encontra o que procuras em segundos, de forma segura e gratuita.
                    </p>

                    <form onSubmit={(e) => { e.preventDefault(); }} className="max-w-xl mx-auto">
                        <div className="flex gap-2 p-1.5 rounded-full border border-slate-200 bg-slate-50">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="O que procuras?"
                                    className="pl-11 h-11 rounded-full border-0 bg-transparent focus-visible:ring-0 text-base"
                                />
                            </div>
                            <Button className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-6 h-11">
                                Buscar
                            </Button>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 mt-10 text-xs font-medium text-slate-400">
                        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Verificado</span>
                        <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Grátis</span>
                        <span className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Chat</span>
                    </div>
                </motion.div>
            </section>

            {/* Categorias em lista horizontal clean */}
            <section className="container pb-16">
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide justify-start md:justify-center">
                    {categories.map((c) => {
                        const Icon = iconMap[c.icon];
                        return (
                            <Link
                                key={c.slug}
                                to={`/explorar?cat=${c.slug}`}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 bg-white hover:border-slate-900 hover:bg-slate-900 hover:text-white transition-all duration-300 text-sm font-medium shrink-0"
                            >
                                <Icon className="h-4 w-4" />
                                {c.name}
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* Destaques grid minimalista */}
            <section className="container pb-20">
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Em destaque</p>
                        <h2 className="text-3xl font-light">Anúncios escolhidos</h2>
                    </div>
                    <Link to="/explorar" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors">
                        Ver todos <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {featured.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 mb-4">
                                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <button
                                        onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }}
                                        className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:scale-110 transition-transform"
                                    >
                                        <Heart className={`h-3.5 w-3.5 ${isFavorite(l.id) ? "fill-red-500 text-red-500" : "text-slate-600"}`} />
                                    </button>
                                </div>
                                <div className="space-y-1.5">
                                    <h3 className="font-medium text-slate-900 leading-snug group-hover:text-slate-600 transition-colors">{l.title}</h3>
                                    <p className="text-lg font-semibold">{formatPrice(l.price, l.currency)}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {l.location}</span>
                                        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {l.rating}</span>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Recentes em grid mais denso */}
            <section className="container pb-20">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Novidades</p>
                <h2 className="text-3xl font-light mb-10">Acabou de chegar</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {recent.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: Math.min(i * 0.05, 0.3) }}
                        >
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 mb-3">
                                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                                <h3 className="text-sm font-medium text-slate-900 leading-snug group-hover:text-slate-600 transition-colors line-clamp-2">{l.title}</h3>
                                <p className="text-sm font-semibold mt-1">{formatPrice(l.price, l.currency)}</p>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* CTA minimalista */}
            <section className="container pb-20">
                <div className="bg-slate-50 rounded-3xl p-12 md:p-16 text-center">
                    <h2 className="text-3xl md:text-4xl font-light mb-4">Tens algo para vender?</h2>
                    <p className="text-slate-500 mb-8 max-w-md mx-auto">Junta-te a milhares de vendedores em Angola. É gratuito e leva menos de 2 minutos.</p>
                    <Link to="/publicar">
                        <Button className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 text-base">
                            Publicar anúncio <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Footer clean */}
            <footer className="border-t border-slate-100 py-12">
                <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-slate-900 flex items-center justify-center">
                            <span className="font-bold text-white text-[10px]">A</span>
                        </div>
                        <span className="font-medium text-slate-600">Aqkianda</span>
                    </div>
                    <p> 2026 Aqkianda. Todos os direitos reservados.</p>
                </div>
            </footer>
        </div>
    );
};

export default TemplateClean;
