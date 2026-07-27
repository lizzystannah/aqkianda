import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Heart, MapPin, Star, ChevronLeft, ChevronRight, Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Plus, Tag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const TemplateMagazine = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const [heroIndex, setHeroIndex] = useState(0);
    const heroItems = listings.filter(l => l.featured).slice(0, 3);
    const eletronica = listings.filter(l => l.category === "eletronica").slice(0, 4);
    const viaturas = listings.filter(l => l.category === "viaturas").slice(0, 4);
    const casa = listings.filter(l => l.category === "casa").slice(0, 4);

    const nextHero = () => setHeroIndex((prev) => (prev + 1) % heroItems.length);
    const prevHero = () => setHeroIndex((prev) => (prev - 1 + heroItems.length) % heroItems.length);
    const hero = heroItems[heroIndex];

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/60">
                <div className="container flex h-16 items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl gradient-hero shadow-glow flex items-center justify-center">
                            <span className="font-display font-bold text-primary-foreground text-lg">A</span>
                        </div>
                        <span className="font-display font-bold text-xl tracking-tight">Aqkianda</span>
                    </Link>
                    <div className="hidden md:flex items-center gap-6">
                        <Link to="/explorar" className="text-sm font-medium hover:text-primary transition-smooth">Explorar</Link>
                        <Link to="/favoritos" className="text-sm font-medium hover:text-primary transition-smooth">Favoritos</Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/publicar">
                            <Button className="rounded-full gradient-hero text-primary-foreground shadow-glow font-semibold px-5">
                                <Plus className="h-4 w-4 mr-1.5" /> Publicar
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Magazine - Carrossel grande */}
            <section className="container pt-8 pb-10">
                <div className="relative rounded-[2.5rem] overflow-hidden bg-muted shadow-elevated border border-border/40" style={{ aspectRatio: "21/9" }}>
                    <AnimatePresence mode="wait">
                        <motion.div key={hero.id} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
                            <img src={hero.image} alt={hero.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                            <div className="absolute inset-0 flex items-center">
                                <div className="container">
                                    <div className="max-w-lg">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="bg-gold text-secondary text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Destaque da semana</span>
                                            <span className="bg-accent text-accent-foreground text-[10px] font-bold uppercase px-3 py-1 rounded-full">{hero.condition}</span>
                                        </div>
                                        <h2 className="font-display font-bold text-3xl md:text-5xl text-white leading-tight mb-3">{hero.title}</h2>
                                        <p className="text-white/80 text-lg mb-4 font-display font-bold">{formatPrice(hero.price, hero.currency)}</p>
                                        <div className="flex items-center gap-3">
                                            <Link to={`/anuncio/${hero.id}`}>
                                                <Button className="rounded-full gradient-hero text-primary-foreground px-6 h-11 font-semibold">Ver anúncio</Button>
                                            </Link>
                                            <Button variant="outline" className="rounded-full border-white/30 text-white bg-white/10 backdrop-blur hover:bg-white/20 px-6 h-11">Contactar</Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Navegação do hero */}
                    <div className="absolute bottom-6 right-6 flex items-center gap-2">
                        <button onClick={prevHero} className="h-10 w-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-smooth">
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button onClick={nextHero} className="h-10 w-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-smooth">
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Dots */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                        {heroItems.map((_, i) => (
                            <button key={i} onClick={() => setHeroIndex(i)} className={`h-2 rounded-full transition-all ${i === heroIndex ? "w-8 bg-primary" : "w-2 bg-white/40"}`} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Categorias circulares */}
            <section className="container pb-12">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {categories.map((c, i) => {
                        const Icon = iconMap[c.icon];
                        return (
                            <motion.div key={c.slug} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="shrink-0">
                                <Link to={`/explorar?cat=${c.slug}`} className="flex flex-col items-center gap-2 group">
                                    <div className="h-16 w-16 rounded-full bg-card border border-border/40 flex items-center justify-center group-hover:border-primary group-hover:shadow-glow transition-smooth">
                                        <Icon className="h-7 w-7 text-primary" />
                                    </div>
                                    <span className="text-xs font-semibold">{c.name}</span>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Secção Eletrónica */}
            <section className="container pb-12">
                <div className="flex items-end justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Smartphone className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Categoria</span>
                            <h2 className="font-display font-bold text-2xl">Eletrónica</h2>
                        </div>
                    </div>
                    <Link to="/explorar?cat=eletronica" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {eletronica.map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated border border-border/40 transition-smooth">
                                    <div className="relative aspect-square overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                        <button onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/90 flex items-center justify-center">
                                            <Heart className={`h-3.5 w-3.5 ${isFavorite(l.id) ? "fill-primary text-primary" : ""}`} />
                                        </button>
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-display font-semibold text-sm line-clamp-2 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="font-display font-bold text-primary">{formatPrice(l.price, l.currency)}</span>
                                            <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Banner promocional */}
            <section className="container pb-12">
                <div className="relative rounded-3xl overflow-hidden gradient-hero p-8 md:p-12 text-primary-foreground">
                    <div className="absolute -right-10 -top-10 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
                    <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="h-5 w-5" />
                                <span className="text-xs font-bold uppercase tracking-widest">Promoção</span>
                            </div>
                            <h3 className="font-display font-bold text-2xl md:text-3xl">Publica grátis. Vende rápido.</h3>
                            <p className="text-primary-foreground/80 mt-2 max-w-md">Milhares de compradores procuram o que tens para vender. Começa agora.</p>
                        </div>
                        <Link to="/publicar">
                            <Button className="rounded-full bg-white text-primary hover:bg-white/90 font-bold px-8 h-12 shadow-lg shrink-0">
                                <Tag className="h-4 w-4 mr-2" /> Criar anúncio
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Secção Viaturas */}
            <section className="container pb-12">
                <div className="flex items-end justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Car className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Categoria</span>
                            <h2 className="font-display font-bold text-2xl">Viaturas</h2>
                        </div>
                    </div>
                    <Link to="/explorar?cat=viaturas" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {viaturas.map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated border border-border/40 transition-smooth">
                                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                        <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${l.condition === "novo" ? "bg-accent text-accent-foreground" : "bg-secondary/90 text-secondary-foreground"}`}>{l.condition}</span>
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-display font-semibold text-sm line-clamp-1 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="font-display font-bold text-primary">{formatPrice(l.price, l.currency)}</span>
                                            <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" />{l.rating}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Secção Casa */}
            <section className="container pb-16">
                <div className="flex items-end justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Home className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Categoria</span>
                            <h2 className="font-display font-bold text-2xl">Casa & Jardim</h2>
                        </div>
                    </div>
                    <Link to="/explorar?cat=casa" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {casa.map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated border border-border/40 transition-smooth">
                                    <div className="relative aspect-square overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-display font-semibold text-sm line-clamp-2 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="font-display font-bold text-primary mt-1">{formatPrice(l.price, l.currency)}</div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border/60 py-10">
                <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl gradient-hero flex items-center justify-center">
                            <span className="font-bold text-primary-foreground text-sm">A</span>
                        </div>
                        <span className="font-display font-bold">Aqkianda</span>
                    </div>
                    <p> 2026 Aqkianda. Marketplace angolano.</p>
                </div>
            </footer>
        </div>
    );
};

export default TemplateMagazine;
