import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, Heart, MapPin, Star,
  Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench,
  Flame, Plus, Tag, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = {
  Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench
};

export default function TemplateModern() {
  const { isFavorite, toggleFavorite } = useFavorites();
  const heroItem = listings.find(l => l.featured) || listings[0];

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container flex h-16 items-center gap-6">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-10 w-10 rounded-2xl bg-primary shadow-glow flex items-center justify-center">
              <span className="font-display font-bold text-white text-xl">A</span>
            </div>
            <span className="font-display font-bold text-xl tracking-tight hidden sm:block">Aqkianda <span className="text-primary text-sm uppercase ml-1">Modern</span></span>
          </Link>

          <form className="hidden lg:flex flex-1 max-w-xl">
            <div className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Pesquisar por carros, telefones, casas..." 
                className="pl-12 h-12 rounded-full bg-white border-2 border-border/50 focus-visible:ring-primary focus-visible:border-primary shadow-sm" 
              />
              <Button type="button" className="absolute right-1 top-1 h-10 rounded-full px-6 gradient-hero shadow-sm">
                Buscar
              </Button>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/publicar">
              <Button className="rounded-full bg-secondary hover:bg-secondary/90 text-white shadow-sm font-semibold h-11 px-6">
                <Plus className="h-5 w-5 mr-2" /> Vender
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-8 md:py-12">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              <Flame className="h-4 w-4" /> O maior marketplace de Angola
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.1] text-secondary">
              Encontra o que precisas. <br />
              <span className="text-transparent bg-clip-text gradient-hero">Vende o que não usas.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Mais de 10.000 anúncios novos todos os dias. Negocia directamente, sem intermediários.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Button size="lg" className="rounded-full h-14 px-8 text-lg gradient-hero shadow-glow font-bold">
                Explorar Anúncios <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
          
          <div className="relative h-[400px] md:h-[500px] rounded-[2rem] overflow-hidden shadow-elevated group">
            <div className="absolute inset-0 bg-primary/20 blur-3xl -z-10 animate-wave-float" />
            <img 
              src={heroItem.image} 
              alt={heroItem.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-spring duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            <div className="absolute bottom-6 left-6 right-6 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <div className="flex gap-2 mb-2">
                <span className="bg-primary text-white text-[10px] font-bold uppercase px-2 py-1 rounded-full">Anúncio do dia</span>
              </div>
              <h3 className="font-display font-bold text-2xl text-white truncate">{heroItem.title}</h3>
              <div className="flex justify-between items-end mt-2">
                <span className="font-display font-bold text-3xl text-gold">{formatPrice(heroItem.price, heroItem.currency)}</span>
                <span className="text-white/80 text-sm flex items-center gap-1"><MapPin className="h-4 w-4" />{heroItem.location}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories - Pill shaped */}
      <section className="container py-8">
        <h2 className="font-display font-bold text-2xl mb-6 flex items-center gap-2 text-secondary">
          <Tag className="h-6 w-6 text-primary" /> Categorias Populares
        </h2>
        <div className="flex overflow-x-auto pb-4 gap-4 hide-scrollbar">
          {categories.map((c, i) => {
            const Icon = iconMap[c.icon];
            return (
              <motion.div key={c.slug} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/explorar?cat=${c.slug}`} className="flex items-center gap-3 px-6 py-4 rounded-full bg-white border-2 border-border/40 hover:border-primary hover:shadow-card transition-smooth whitespace-nowrap group min-w-[160px]">
                  <div className="p-2 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-5 w-5 text-secondary group-hover:text-primary transition-colors" />
                  </div>
                  <span className="font-bold text-sm text-secondary group-hover:text-primary">{c.name}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Modern Grid */}
      <section className="container py-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="font-display font-bold text-3xl text-secondary">Recomendações</h2>
            <p className="text-muted-foreground mt-1">Anúncios seleccionados para ti</p>
          </div>
          <Button variant="ghost" className="text-primary font-bold hidden sm:flex">
            Ver todos <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {listings.slice(0, 8).map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <div className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-elevated border border-border/60 transition-spring group h-full flex flex-col">
                <div className="relative aspect-[4/3] p-2">
                  <div className="w-full h-full rounded-2xl overflow-hidden relative">
                    <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-spring duration-500" />
                    
                    <button 
                      onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }} 
                      className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white/90 backdrop-blur shadow-sm flex items-center justify-center hover:scale-110 transition-spring z-10"
                    >
                      <Heart className={`h-5 w-5 transition-smooth ${isFavorite(l.id) ? "fill-primary text-primary" : "text-secondary"}`} />
                    </button>
                    
                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                       {l.featured && <span className="bg-gradient-to-r from-gold to-amber-500 text-white text-xs font-bold uppercase px-3 py-1 rounded-full shadow-sm">Destacado</span>}
                       <span className="bg-secondary/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase px-2 py-1 rounded-full w-fit">{l.condition}</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 pt-3 flex flex-col flex-1">
                  <h3 className="font-display font-bold text-secondary text-lg leading-tight line-clamp-2 mb-2 group-hover:text-primary transition-colors">{l.title}</h3>
                  <div className="font-display font-extrabold text-2xl text-primary mb-auto">{formatPrice(l.price, l.currency)}</div>
                  
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/60">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <MapPin className="h-4 w-4" /> {l.location}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-secondary">
                      <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {l.rating}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
