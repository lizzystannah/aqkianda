import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, Heart, MapPin, Star, Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Plus, Crown, Gem, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const TemplatePremium = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const featured = listings.filter(l => l.featured).slice(0, 3);
    const recent = listings.slice(0, 6);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-[#e8e4dc] font-serif">
            {/* Header premium escuro */}
            <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#1a1a1a]">
                <div className="container flex h-20 items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full border-2 border-[#c9a96e] flex items-center justify-center">
                            <Crown className="h-5 w-5 text-[#c9a96e]" />
                        </div>
                        <div>
                            <span className="font-serif text-xl tracking-widest text-[#c9a96e]">AQKIANDA</span>
                            <span className="block text-[8px] tracking-[0.3em] text-[#666] uppercase -mt-1">Premium Marketplace</span>
                        </div>
                    </Link>
                    <nav className="hidden md:flex items-center gap-10 text-xs tracking-widest uppercase text-[#666]">
                        <Link to="/explorar" className="hover:text-[#c9a96e] transition-colors duration-300">Explorar</Link>
                        <Link to="/favoritos" className="hover:text-[#c9a96e] transition-colors duration-300">Favoritos</Link>
                        <Link to="/mensagens" className="hover:text-[#c9a96e] transition-colors duration-300">Mensagens</Link>
                    </nav>
                    <div className="flex items-center gap-4">
                        <Link to="/entrar" className="text-xs tracking-widest uppercase text-[#666] hover:text-[#c9a96e] transition-colors duration-300">Entrar</Link>
                        <Link to="/publicar">
                            <Button className="rounded-none border border-[#c9a96e] bg-transparent hover:bg-[#c9a96e] hover:text-[#0a0a0a] text-[#c9a96e] px-6 h-10 text-xs tracking-widest uppercase transition-all duration-300">
                                <Plus className="h-3 w-3 mr-2" /> Publicar
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero premium editorial */}
            <section className="relative">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=2000&q=80')] bg-cover bg-center opacity-10" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-transparent to-[#0a0a0a]" />

                <div className="container relative pt-24 pb-32">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1 }}
                        className="max-w-4xl"
                    >
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-px w-12 bg-[#c9a96e]" />
                            <span className="text-xs tracking-[0.4em] uppercase text-[#c9a96e]">Angola · 2026</span>
                        </div>

                        <h1 className="text-6xl md:text-8xl font-serif font-light leading-[0.95] mb-8">
                            O luxo de <br />
                            <span className="italic text-[#c9a96e]">encontrar</span> <br />
                            o essencial.
                        </h1>

                        <p className="text-[#666] text-lg max-w-md leading-relaxed mb-12 font-light">
                            Uma curadoria exclusiva dos melhores produtos e serviços de Angola. Para quem valoriza o extraordinário.
                        </p>

                        <form onSubmit={(e) => { e.preventDefault(); }} className="max-w-lg">
                            <div className="flex border-b border-[#333] pb-2">
                                <Search className="h-5 w-5 text-[#444] mr-4 mt-3" />
                                <Input
                                    placeholder="O que procuras?"
                                    className="border-0 bg-transparent focus-visible:ring-0 text-lg text-[#e8e4dc] placeholder:text-[#444] h-12 rounded-none"
                                />
                                <Button className="rounded-none bg-[#c9a96e] hover:bg-[#b8985d] text-[#0a0a0a] px-8 h-12 text-sm tracking-widest uppercase font-semibold">
                                    Buscar
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            </section>

            {/* Categorias estilo galeria */}
            <section className="container pb-24">
                <div className="flex items-center gap-3 mb-12">
                    <Gem className="h-4 w-4 text-[#c9a96e]" />
                    <span className="text-xs tracking-[0.3em] uppercase text-[#666]">Categorias</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a1a1a]">
                    {categories.map((c, i) => {
                        const Icon = iconMap[c.icon];
                        return (
                            <motion.div
                                key={c.slug}
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="bg-[#0a0a0a] group"
                            >
                                <Link
                                    to={`/explorar?cat=${c.slug}`}
                                    className="flex flex-col items-center justify-center gap-4 p-10 hover:bg-[#111] transition-colors duration-500"
                                >
                                    <Icon className="h-7 w-7 text-[#444] group-hover:text-[#c9a96e] transition-colors duration-500" />
                                    <span className="text-xs tracking-[0.2em] uppercase text-[#666] group-hover:text-[#e8e4dc] transition-colors duration-500">{c.name}</span>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Destaques estilo editorial */}
            <section className="container pb-24">
                <div className="flex items-end justify-between mb-16">
                    <div>
                        <span className="text-xs tracking-[0.3em] uppercase text-[#c9a96e] block mb-3">Selecção exclusiva</span>
                        <h2 className="text-4xl font-serif font-light">Em destaque</h2>
                    </div>
                    <Link to="/explorar" className="text-xs tracking-[0.2em] uppercase text-[#666] hover:text-[#c9a96e] flex items-center gap-2 transition-colors duration-300">
                        Ver colecção <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {featured.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.15, duration: 0.6 }}
                            className="group"
                        >
                            <Link to={`/anuncio/${l.id}`} className="block">
                                <div className="relative aspect-[3/4] overflow-hidden bg-[#111] mb-6">
                                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-500" />
                                    <button
                                        onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }}
                                        className="absolute top-4 right-4 h-10 w-10 border border-white/20 flex items-center justify-center hover:border-[#c9a96e] hover:bg-[#c9a96e] transition-all duration-300"
                                    >
                                        <Heart className={`h-4 w-4 ${isFavorite(l.id) ? "fill-[#c9a96e] text-[#c9a96e]" : "text-white/60"}`} />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 p-6">
                                        <span className="text-[10px] tracking-[0.3em] uppercase text-[#c9a96e] border border-[#c9a96e]/30 px-3 py-1">Destaque</span>
                                    </div>
                                </div>
                                <h3 className="text-xl font-serif font-light text-[#e8e4dc] group-hover:text-[#c9a96e] transition-colors duration-300 leading-snug">{l.title}</h3>
                                <div className="flex items-center justify-between mt-3">
                                    <p className="text-lg text-[#c9a96e] font-light">{formatPrice(l.price, l.currency)}</p>
                                    <div className="flex items-center gap-3 text-xs text-[#444]">
                                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {l.location}</span>
                                        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-[#c9a96e] text-[#c9a96e]" /> {l.rating}</span>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Recentes linha horizontal */}
            <section className="container pb-24">
                <div className="border-t border-[#1a1a1a] pt-16">
                    <div className="flex items-end justify-between mb-12">
                        <div>
                            <span className="text-xs tracking-[0.3em] uppercase text-[#666] block mb-3">Acabou de chegar</span>
                            <h2 className="text-3xl font-serif font-light">Novidades</h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                        {recent.map((l, i) => (
                            <motion.div
                                key={l.id}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: Math.min(i * 0.1, 0.4) }}
                                className="group"
                            >
                                <Link to={`/anuncio/${l.id}`} className="block">
                                    <div className="relative aspect-[4/3] overflow-hidden bg-[#111] mb-4">
                                        <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                    </div>
                                    <h3 className="text-sm font-serif text-[#999] group-hover:text-[#e8e4dc] transition-colors duration-300 leading-snug">{l.title}</h3>
                                    <p className="text-sm text-[#c9a96e] mt-2 font-light">{formatPrice(l.price, l.currency)}</p>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA premium */}
            <section className="container pb-24">
                <div className="relative border border-[#1a1a1a] p-16 md:p-24 text-center overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-[#c9a96e] to-transparent" />
                    <div className="relative">
                        <span className="text-xs tracking-[0.4em] uppercase text-[#666] block mb-6">Para vendedores exclusivos</span>
                        <h2 className="text-4xl md:text-6xl font-serif font-light mb-6">
                            Tens algo <span className="italic text-[#c9a96e]">extraordinário</span>?
                        </h2>
                        <p className="text-[#666] max-w-md mx-auto mb-10 font-light leading-relaxed">
                            Partilha com uma comunidade que aprecia o melhor. A tua peça pode ser o tesouro de alguém.
                        </p>
                        <Link to="/publicar">
                            <Button className="rounded-none border border-[#c9a96e] bg-[#c9a96e] hover:bg-transparent hover:text-[#c9a96e] text-[#0a0a0a] px-10 h-12 text-xs tracking-[0.3em] uppercase font-semibold transition-all duration-300">
                                Publicar agora
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer premium */}
            <footer className="border-t border-[#1a1a1a] py-16">
                <div className="container flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full border border-[#c9a96e] flex items-center justify-center">
                            <Crown className="h-4 w-4 text-[#c9a96e]" />
                        </div>
                        <div>
                            <span className="font-serif text-sm tracking-[0.2em] text-[#c9a96e]">AQKIANDA</span>
                        </div>
                    </div>
                    <p className="text-xs tracking-[0.2em] text-[#333] uppercase"> 2026 · Todos os direitos reservados</p>
                </div>
            </footer>
        </div>
    );
};

export default TemplatePremium;
