import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, Heart, MapPin,
  Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench,
  UserCircle, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listings, categories, formatPrice } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";

const iconMap: Record<string, any> = {
  Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench
};

export default function TemplateMinimal() {
  const { isFavorite, toggleFavorite } = useFavorites();

  return (
    <div className="min-h-screen bg-[#FDFCFB] font-sans">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/5">
        <div className="container flex h-20 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center">
              <span className="font-display font-light text-primary text-3xl tracking-tighter">Aq.</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-secondary/70">
            <Link to="/explorar" className="hover:text-primary transition-colors">Explorar</Link>
            <Link to="/vendedores" className="hover:text-primary transition-colors">Vendedores</Link>
            <Link to="/sobre" className="hover:text-primary transition-colors">Como funciona</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/favoritos" className="text-secondary/70 hover:text-primary transition-colors">
              <Heart className="h-6 w-6" />
            </Link>
            <Link to="/perfil" className="text-secondary/70 hover:text-primary transition-colors">
              <UserCircle className="h-6 w-6" />
            </Link>
            <Link to="/publicar">
              <Button className="rounded-full bg-primary hover:bg-primary/90 text-white font-medium h-10 px-6">
                Vender
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Center Search */}
      <section className="container py-20 md:py-32 flex flex-col items-center text-center relative">
        <div className="absolute top-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent -z-10" />
        
        <h1 className="font-display text-5xl md:text-7xl font-light text-secondary tracking-tight mb-6">
          O que procuras hoje?
        </h1>
        <p className="text-lg text-secondary/60 mb-12 max-w-2xl">
          Conectamos compradores e vendedores de forma simples, elegante e segura.
        </p>

        <form className="w-full max-w-3xl relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-secondary/40" />
          <Input 
            placeholder="Carros, imóveis, electrónica..." 
            className="pl-16 h-16 rounded-full bg-white border border-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-visible:ring-1 focus-visible:ring-primary/30 text-lg" 
          />
          <Button type="button" className="absolute right-2 top-2 h-12 rounded-full px-8 bg-secondary hover:bg-secondary/90 text-white">
            Buscar
          </Button>
        </form>

        {/* Minimal Categories */}
        <div className="flex flex-wrap justify-center gap-8 mt-16">
          {categories.slice(0, 6).map((c, i) => {
            const Icon = iconMap[c.icon];
            return (
              <motion.div key={c.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Link to={`/explorar?cat=${c.slug}`} className="flex flex-col items-center gap-3 group">
                  <div className="h-16 w-16 rounded-2xl bg-white border border-black/5 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                    <Icon className="h-6 w-6 text-secondary/60 group-hover:text-primary transition-colors" strokeWidth={1.5} />
                  </div>
                  <span className="text-sm font-medium text-secondary/80 group-hover:text-primary transition-colors">{c.name}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Elegant Grid */}
      <section className="container py-16">
        <h2 className="font-display text-3xl font-light text-secondary mb-10 text-center">Descobertas Recentes</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-12">
          {listings.slice(0, 9).map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}>
              <div className="group block h-full">
                <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/5 mb-4">
                  <img src={l.image} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                  
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
                  
                  <button 
                    onClick={(e) => { e.preventDefault(); toggleFavorite(l.id); }} 
                    className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white"
                  >
                    <Heart className={`h-5 w-5 ${isFavorite(l.id) ? "fill-primary text-primary" : "text-secondary"}`} />
                  </button>

                  <div className="absolute bottom-4 left-4">
                     <span className="bg-white/80 backdrop-blur-md text-secondary text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                       {l.condition}
                     </span>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-display text-lg text-secondary/90 leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-1">{l.title}</h3>
                  <div className="flex justify-between items-center">
                    <span className="font-display text-xl font-medium text-secondary">{formatPrice(l.price, l.currency)}</span>
                    <span className="text-sm text-secondary/50 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{l.location.split(',')[0]}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        
        <div className="flex justify-center mt-16">
          <Button variant="outline" className="rounded-full h-12 px-8 border-secondary/20 text-secondary hover:bg-secondary hover:text-white transition-colors duration-300">
            Ver todas as publicações
          </Button>
        </div>
      </section>
    </div>
  );
}
