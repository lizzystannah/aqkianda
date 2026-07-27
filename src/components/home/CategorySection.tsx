import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench } from "lucide-react";
import { categories } from "@/data/listings";

const iconMap: Record<string, any> = { Smartphone, Car, Home, Shirt, Sofa, Dumbbell, Briefcase, Wrench };

const CategorySection = () => {
  return (
    <section className="container py-12">
      <div className="relative rounded-[2.5rem] overflow-hidden shadow-glow border border-primary/20 min-h-[400px] flex flex-col items-center justify-center p-6 md:p-10 gradient-hero">
        
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/bg-categories.png" 
            alt="Explorar categorias" 
            className="w-full h-full object-cover opacity-30 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display font-bold text-4xl md:text-5xl lg:text-6xl tracking-tight text-white"
          >
            Explora por categoria
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-white/80 mt-4 text-lg md:text-xl max-w-2xl mx-auto"
          >
            O que procuras hoje? Temos milhares de anúncios à tua espera.
          </motion.p>
        </div>

        {/* Categories Grid - Centralized */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 w-full max-w-6xl">
          {categories.map((c, i) => {
            const Icon = iconMap[c.icon];
            return (
              <motion.div
                key={c.slug}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  to={`/explorar?cat=${c.slug}`}
                  className="group flex flex-col items-center gap-4 p-6 rounded-[2rem] bg-background/60 backdrop-blur-md border border-white/20 hover:border-primary/40 hover:shadow-glow hover:bg-background transition-smooth h-full"
                >
                  <div className="h-14 w-14 rounded-2xl bg-muted group-hover:gradient-hero flex items-center justify-center transition-smooth shadow-sm group-hover:shadow-glow">
                    <Icon className="h-7 w-7 group-hover:text-primary-foreground transition-smooth" />
                  </div>
                  <span className="text-sm font-bold text-center tracking-tight">{c.name}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CategorySection;
