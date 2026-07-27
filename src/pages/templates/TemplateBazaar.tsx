import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Heart, MapPin, Star, ChevronRight, ChevronLeft,
    Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench,
    Plus, Tag, Flame, Clock, ShieldCheck, MessageCircle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = {
    Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench
};

const sectionColors: Record<string, string> = {
    eletronica: "from-orange-500 to-amber-400",
    viaturas: "from-blue-500 to-cyan-400",
    casa: "from-emerald-500 to-teal-400",
    moda: "from-pink-500 to-rose-400",
    moveis: "from-violet-500 to-purple-400",
    desporto: "from-lime-500 to-green-400",
    emprego: "from-indigo-500 to-blue-400",
    servicos: "from-yellow-500 to-orange-400",
};

const TemplateBazaar = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const [heroIndex, setHeroIndex] = useState(0);
    const heroItems = listings.filter(l => l.featured).slice(0, 4);

    const nextHero = () => setHeroIndex(p => (p + 1) % heroItems.length);
    const prevHero = () => setHeroIndex(p => (p - 1 + heroItems.length) % heroItems.length);

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/60">
                <div className="container flex h-16 items-center gap-4">
                    <Link to="/" className="flex items-center gap-2 shrink-0">
                        <div className="h-9 w-9 rounded-xl gradient-hero shadow-glow flex items-center justify-center">
                            <span className="font-display font-bold text-primary-foreground text-lg">A</span>
                        </div>
                        <span className="font-display font-bold text-xl tracking-tight hidden sm:inline-block">Aqkianda</span>
                    </Link>
                    <form className="hidden lg:flex flex-1 max-w-md mx-4">
                        <div className="relative w-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="O que procuras hoje?" className="pl-11 h-10 rounded-full bg-muted/50 border-transparent" />
                        </div>
                    </form>
                    <nav className="hidden md:flex items-center gap-1 ml-auto">
                        <Link to="/favoritos">
                            <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary">
                                <Heart className="h-5 w-5" />
                            </Button>
                        </Link>
                        <Link to="/mensagens">
                            <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary relative">
                                <MessageCircle className="h-5 w-5" />
                                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary border-2 border-background" />
                            </Button>
                        </Link>
                        <Link to="/publicar" className="ml-2">
                            <Button className="rounded-full gradient-hero text-primary-foreground hover:opacity-95 shadow-glow font-semibold px-5">
                                <Plus className="h-4 w-4 mr-1.5" /> Publicar
                            </Button>
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero — Carrossel grande com controles */}
            <section className="container pt-8 pb-10">
                <div className="relative rounded-[2.5rem] overflow-hidden shadow-elevated border border-border/40 bg-muted" style={{ aspectRatio: "16/7" }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={heroItems[heroIndex].id}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0"
                        >
                            <img src={heroItems[heroIndex].image} alt={heroItems[heroIndex].title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="bg-gold text-secondary text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Destaque</span>
                                    <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${heroItems[heroIndex].condition === "novo" ? "bg-accent text-accent-foreground" : "bg-white/20 text-white backdrop-blur-sm"}`}>
                                        {heroItems[heroIndex].condition}
                                    </span>
                                </div>
                                <h2 className="font-display font-bold text-2xl md:text-4xl text-white leading-tight max-w-2xl">{heroItems[heroIndex].title}</h2>
                                <div className="flex items-center gap-6 mt-4">
                                    <span className="font-display font-bold text-xl md:text-2xl text-primary-glow">{formatPrice(heroItems[heroIndex].price, heroItems[heroIndex].currency)}</span>
                                    <span className="flex items-center gap-1 text-sm text-white/70"><MapPin className="h-3.5 w-3.5" /> {heroItems[heroIndex].location}</span>
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Controles */}
                    <button onClick={prevHero} className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-smooth z-10">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={nextHero} className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-smooth z-10">
                        <ChevronRight className="h-5 w-5" />
                    </button>

                    {/* Dots */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                        {heroItems.map((_, i) => (
                            <button key={i} onClick={() => setHeroIndex(i)} className={`h-2 rounded-full transition-all ${i === heroIndex ? "w-8 gradient-hero" : "w-2 bg-white/40 hover:bg-white/60"}`} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Categorias com cor por secção */}
            <section className="container pb-10">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                    {categories.map((c, i) => {
                        const Icon = iconMap[c.icon];
                        const colorClass = sectionColors[c.slug] || "from-primary to-primary-glow";
                        return (
                            <motion.div key={c.slug} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
                                <Link to={`/explorar?cat=${c.slug}`} className="group flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border/40 hover:border-primary/40 hover:shadow-card transition-smooth">
                                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center shadow-md group-hover:scale-110 transition-spring`}>
                                        <Icon className="h-6 w-6 text-white" />
                                    </div>
                                    <span className="text-xs font-semibold text-center">{c.name}</span>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Barra de confiança */}
            <section className="container pb-10">
                <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-3 py-4 rounded-2xl bg-muted/50 border border-border/40">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 text-accent" /> Compra protegida</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><MessageCircle className="h-5 w-5 text-accent" /> Chat directo</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><Zap className="h-5 w-5 text-accent" /> Publicação grátis</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-5 w-5 text-accent" /> Entrega rápida</span>
                </div>
            </section>

            {/* Todos os anúncios em grid enorme */}
            <section className="container pb-16">
                <div className="flex items-center gap-2 mb-6">
                    <Flame className="h-5 w-5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Descobre</span>
                    <h2 className="font-display font-bold text-2xl ml-2">Tudo à venda</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {listings.slice(0, 15).map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated border border-border/40 transition-smooth">
                                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                        <div className="absolute top-2 left-2 flex gap-1">
                                            {l.featured && <span className="bg-gold text-secondary text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full">Dest.</span>}
                                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${l.condition === "novo" ? "bg-accent text-accent-foreground" : "bg-secondary/90 text-secondary-foreground"}`}>{l.condition}</span>
                                        </div>
                                        <button onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/90 backdrop-blur flex items-center justify-center hover:scale-110 transition-spring">
                                            <Heart className={`h-3 w-3 transition-smooth ${isFavorite(l.id) ? "fill-primary text-primary" : "text-foreground"}`} />
                                        </button>
                                    </div>
                                    <div className="p-2.5 space-y-1">
                                        <h3 className="font-display font-semibold text-xs leading-tight line-clamp-2 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="font-display font-bold text-sm text-primary">{formatPrice(l.price, l.currency)}</div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> {l.location}</span>
                                            <span className="flex items-center gap-0.5"><Star className="h-2.5 w-2.5 fill-gold text-gold" /> {l.rating}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
                <div className="text-center mt-8">
                    <Link to="/explorar">
                        <Button variant="outline" className="rounded-full px-8 h-11">Ver mais anúncios <ChevronRight className="h-4 w-4 ml-1" /></Button>
                    </Link>
                </div>
            </section>

            {/* CTA final */}
            <section className="container pb-16">
                <div className="relative rounded-3xl gradient-dark p-10 md:p-14 text-secondary-foreground overflow-hidden">
                    <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full gradient-hero opacity-20 blur-3xl" />
                    <div className="absolute -left-10 -bottom-10 h-60 w-60 rounded-full gradient-mint opacity-15 blur-3xl" />
                    <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="max-w-lg">
                            <span className="text-xs font-bold uppercase tracking-widest text-primary-glow">Para vendedores</span>
                            <h2 className="font-display font-bold text-3xl md:text-4xl mt-3">Tens algo para vender?</h2>
                            <p className="mt-4 text-secondary-foreground/70">Publicação gratuita, sem comissões. Recebe mensagens directamente dos compradores.</p>
                        </div>
                        <Link to="/publicar">
                            <Button className="rounded-full gradient-hero text-primary-foreground shadow-glow font-bold px-10 h-14 text-base shrink-0">
                                <Tag className="h-5 w-5 mr-2" /> Publicar agora
                            </Button>
                        </Link>
                    </div>
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

export default TemplateBazaar;
