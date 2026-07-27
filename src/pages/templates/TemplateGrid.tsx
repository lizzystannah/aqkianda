import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Heart, MapPin, Star, Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench, Plus, Filter, TrendingUp, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const TemplateGrid = () => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const featured = listings.filter(l => l.featured);
    const recent = listings.slice(0, 12);

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
                    <form className="hidden lg:flex flex-1 max-w-lg mx-4">
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
                        <Link to="/publicar" className="ml-2">
                            <Button className="rounded-full gradient-hero text-primary-foreground hover:opacity-95 shadow-glow font-semibold px-5">
                                <Plus className="h-4 w-4 mr-1.5" /> Publicar
                            </Button>
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero com busca grande e stats */}
            <section className="container pt-10 pb-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-2xl mx-auto mb-8">
                    <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mb-3">
                        Tudo o que precisas, <span className="text-primary">num só lugar</span>
                    </h1>
                    <p className="text-muted-foreground">Eletrónica, viaturas, casa, moda e muito mais em Angola</p>
                </motion.div>

                <form className="max-w-xl mx-auto mb-8">
                    <div className="flex gap-2 p-2 rounded-[2rem] bg-card border border-border/40 shadow-elevated">
                        <div className="relative flex-1">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input placeholder="iPhone, Toyota, apartamento..." className="pl-14 h-12 rounded-full border-0 bg-transparent focus-visible:ring-0 text-base" />
                        </div>
                        <Button className="h-12 rounded-full gradient-hero text-primary-foreground px-8 font-semibold">Buscar</Button>
                    </div>
                </form>

                {/* Stats rápidas */}
                <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> +12.000 anúncios</span>
                    <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-accent" /> Compra protegida</span>
                    <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-gold" /> Novos todos os dias</span>
                </div>
            </section>

            {/* Categorias em grid largo */}
            <section className="container pb-8">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                    {categories.map((c, i) => {
                        const Icon = iconMap[c.icon];
                        return (
                            <motion.div key={c.slug} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
                                <Link to={`/explorar?cat=${c.slug}`} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border/40 hover:border-primary/40 hover:shadow-card transition-smooth">
                                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center group-hover:gradient-hero">
                                        <Icon className="h-6 w-6 text-primary" />
                                    </div>
                                    <span className="text-xs font-semibold text-center">{c.name}</span>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>

            {/* Filtros rápidos */}
            <section className="container pb-6">
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    <Button variant="outline" size="sm" className="rounded-full gap-2 shrink-0">
                        <Filter className="h-3.5 w-3.5" /> Filtrar
                    </Button>
                    {["Novo", "Usado", "Preço baixo", "Com entrega", "Troca"].map((f) => (
                        <Button key={f} variant="ghost" size="sm" className="rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary shrink-0 text-xs">
                            {f}
                        </Button>
                    ))}
                </div>
            </section>

            {/* Destaques em grid largo 4 colunas */}
            <section className="container pb-10">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Em destaque</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {featured.map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <article className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-smooth border border-border/40">
                                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                        <div className="absolute top-2 left-2 flex gap-1.5">
                                            <span className="bg-gold text-secondary text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">Destaque</span>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${l.condition === "novo" ? "bg-accent text-accent-foreground" : "bg-secondary/90 text-secondary-foreground"}`}>{l.condition}</span>
                                        </div>
                                        <button onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center hover:scale-110 transition-spring">
                                            <Heart className={`h-3.5 w-3.5 transition-smooth ${isFavorite(l.id) ? "fill-primary text-primary" : "text-foreground"}`} />
                                        </button>
                                    </div>
                                    <div className="p-3 space-y-1.5">
                                        <h3 className="font-display font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="font-display font-bold text-lg text-primary">{formatPrice(l.price, l.currency)}</div>
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {l.location}</span>
                                            <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {l.rating}</span>
                                        </div>
                                    </div>
                                </article>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Recentes em grid denso 5 colunas */}
            <section className="container pb-16">
                <div className="flex items-center gap-2 mb-6">
                    <Clock className="h-4 w-4 text-accent" />
                    <span className="text-xs font-bold uppercase tracking-widest text-accent">Acabou de chegar</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {recent.map((l, i) => (
                        <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
                            <Link to={`/anuncio/${l.id}`} className="group block">
                                <div className="bg-card rounded-xl overflow-hidden shadow-card hover:shadow-elevated transition-smooth border border-border/40">
                                    <div className="relative aspect-square overflow-hidden bg-muted">
                                        <img src={l.image} alt={l.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-spring" />
                                    </div>
                                    <div className="p-2.5 space-y-1">
                                        <h3 className="font-display font-medium text-xs leading-tight line-clamp-2 group-hover:text-primary transition-smooth">{l.title}</h3>
                                        <div className="font-display font-bold text-sm text-primary">{formatPrice(l.price, l.currency)}</div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="container pb-16">
                <div className="relative rounded-3xl gradient-dark p-10 md:p-14 text-secondary-foreground overflow-hidden">
                    <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full gradient-hero opacity-20 blur-3xl" />
                    <div className="relative max-w-xl">
                        <span className="text-xs font-bold uppercase tracking-widest text-primary-glow">Vende já</span>
                        <h2 className="font-display font-bold text-3xl md:text-4xl mt-3">Tens algo para vender?</h2>
                        <p className="mt-4 text-secondary-foreground/70">Publica grátis e recebe propostas em minutos.</p>
                        <Link to="/publicar">
                            <Button className="mt-6 h-12 rounded-full gradient-hero text-primary-foreground shadow-glow font-semibold px-8">
                                <Plus className="h-5 w-5 mr-2" /> Publicar anúncio grátis
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

export default TemplateGrid;
