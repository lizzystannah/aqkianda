import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, Heart, MapPin, Star, Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Plus, Flame, Sparkles, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const TemplateVibrant = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const featured = listings.filter(l => l.featured).slice(0, 4);
    const recent = listings.slice(0, 8);

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-fuchsia-950 text-white overflow-x-hidden">
            {/* Header glass */}
            <header className="sticky top-0 z-50 bg-white/5 backdrop-blur-xl border-b border-white/10">
                <div className="container flex h-16 items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-orange-400 to-pink-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <span className="font-bold text-white text-lg">A</span>
                        </div>
                        <span className="font-bold text-xl tracking-tight">Aqkianda</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/60">
                        <Link to="/explorar" className="hover:text-white transition-colors">Explorar</Link>
                        <Link to="/favoritos" className="hover:text-white transition-colors">Favoritos</Link>
                        <Link to="/mensagens" className="hover:text-white transition-colors">Mensagens</Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link to="/entrar" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Entrar</Link>
                        <Link to="/publicar">
                            <Button className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white px-5 h-9 text-sm font-semibold shadow-lg shadow-orange-500/25">
                                <Plus className="h-4 w-4 mr-1" /> Publicar
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero vibrante com glassmorphism */}
            <section className="relative pt-16 pb-20 overflow-hidden">
                {/* Background glows */}
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-[120px]" />

                <div className="container relative">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="max-w-3xl mx-auto text-center"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 backdrop-blur-md text-xs font-bold text-orange-300 mb-8">
                            <Sparkles className="h-3.5 w-3.5" /> +12.000 anúncios activos
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                            O teu próximo <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400">achado</span> está aqui.
                        </h1>
                        <p className="text-white/50 text-lg max-w-xl mx-auto mb-10">
                            Eletrónica, viaturas, casa, moda e muito mais. Tudo num só lugar, com segurança e sem comissões.
                        </p>

                        <form onSubmit={(e) => { e.preventDefault(); }} className="max-w-2xl mx-auto">
                            <div className="flex gap-2 p-2 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                                    <Input
                                        placeholder="Procura iPhone, Toyota, apartamento..."
                                        className="pl-12 h-14 rounded-xl border-0 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-orange-400/50 text-base"
                                    />
                                </div>
                                <Button className="rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white px-8 h-14 text-base font-bold shadow-lg shadow-orange-500/25">
                                    Explorar <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            </section>

            {/* Categorias em cards glass */}
            <section className="container pb-20">
                <h2 className="text-center text-xl font-bold mb-8 text-white/80">Explora por categoria</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {categories.map((c, i) => {
                        const Icon = iconMap[c.icon];
                        return (
                            <motion.div
                                key={c.slug}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <Link
                                    to={`/explorar?cat=${c.slug}`}
                                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-105 transition-all duration-300 backdrop-blur-sm"
                                >
                                    <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-orange-400/20 to-pink-500/20 flex items-center justify-center group-hover:from-orange-400 group-hover:to-pink-500 transition-all duration-300">
                                        <Icon className="h-6 w-6 text-orange-300 group-hover:text-white transition-colors" />
                                    </div>
                                    <span className="text-xs font-semibold text-center">{c.name}</span>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Destaques com cards glass grandes */}
            <section className="container pb-20">
                <div className="flex items-end justify-between mb-10">
                    <div className="flex items-center gap-3">
                        <Flame className="h-6 w-6 text-orange-400" />
                        <h2 className="text-2xl font-bold">Tendências</h2>
                    </div>
                    <Link to="/explorar" className="text-sm font-medium text-white/50 hover:text-white flex items-center gap-1 transition-colors">
                        Ver tudo <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {featured.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-white/5 border border-white/10 mb-4">
                                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                    <button
                                        onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }}
                                        className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
                                    >
                                        <Heart className={`h-4 w-4 ${isFavorite(l.id) ? "fill-pink-500 text-pink-500" : "text-white"}`} />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 p-4">
                                        <span className="inline-block px-2.5 py-1 rounded-full bg-orange-400 text-black text-[10px] font-bold">DESTAQUE</span>
                                    </div>
                                </div>
                                <h3 className="font-semibold text-white/90 leading-snug group-hover:text-orange-300 transition-colors">{l.title}</h3>
                                <p className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-400 mt-1">{formatPrice(l.price, l.currency)}</p>
                                <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                                    <MapPin className="h-3 w-3" /> {l.location}
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Recentes grid */}
            <section className="container pb-20">
                <h2 className="text-2xl font-bold mb-8">Novidades</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {recent.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: Math.min(i * 0.05, 0.3) }}
                        >
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 mb-3">
                                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <h3 className="text-sm font-medium text-white/80 group-hover:text-white transition-colors line-clamp-2">{l.title}</h3>
                                <p className="text-sm font-bold text-orange-300 mt-1">{formatPrice(l.price, l.currency)}</p>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* CTA vibrante */}
            <section className="container pb-20">
                <div className="relative rounded-3xl overflow-hidden p-12 md:p-16 text-center border border-white/10 bg-white/5 backdrop-blur-xl">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-pink-500/10" />
                    <div className="relative">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">Vende o que já não usas</h2>
                        <p className="text-white/50 mb-8 max-w-md mx-auto">Transforma objetos parados em dinheiro. Publicar é 100% gratuito.</p>
                        <Link to="/publicar">
                            <Button className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 hover:opacity-90 text-white px-10 h-14 text-base font-bold shadow-xl shadow-orange-500/25">
                                <Plus className="mr-2 h-5 w-5" /> Publicar agora
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/10 py-12">
                <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/30">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-orange-400 to-pink-500 flex items-center justify-center">
                            <span className="font-bold text-white text-xs">A</span>
                        </div>
                        <span className="font-semibold text-white/60">Aqkianda</span>
                    </div>
                    <p> 2026 Aqkianda. Todos os direitos reservados.</p>
                </div>
            </footer>
        </div>
    );
};

export default TemplateVibrant;
