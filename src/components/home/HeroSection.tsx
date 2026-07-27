import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, ShieldCheck, Zap, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const heroImg = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1536&q=80";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 gradient-radial pointer-events-none" />
      <div className="container relative pt-12 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 bg-muted rounded-full px-4 py-1.5 mb-6 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            +12.000 anúncios em toda Angola
          </div>
          <h1 className="font-display font-bold text-5xl md:text-7xl leading-[1.05] tracking-tight">
            Compra e vende{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-primary via-primary-glow to-gold bg-clip-text text-transparent">
                tudo
              </span>
            </span>{" "}
            num só lugar.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-lg leading-relaxed">
            Aqkianda é o marketplace angolano onde encontras produtos novos e usados — eletrónica, viaturas, casa, moda e muito mais.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="iPhone, Toyota, apartamento..."
                className="pl-12 h-14 text-base rounded-full bg-card shadow-card border-transparent"
              />
            </div>
            <Button asChild size="lg" className="h-14 rounded-full gradient-hero text-primary-foreground hover:opacity-95 shadow-glow text-base font-semibold px-8">
              <Link to="/explorar">Explorar <ArrowRight className="ml-1 h-5 w-5" /></Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> Compra protegida</div>
            <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent" /> Chat directo</div>
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-accent" /> Publicação grátis</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <div className="absolute -inset-4 gradient-hero opacity-30 blur-3xl rounded-full" />
          <div className="relative rounded-3xl overflow-hidden shadow-elevated border border-border/40 animate-float">
            <img src={heroImg} alt="Marketplace Aqkianda" width={1536} height={1024} className="w-full h-auto" />
          </div>
          <div className="absolute -bottom-4 -left-4 bg-card rounded-2xl shadow-elevated p-4 flex items-center gap-3 border border-border/40">
            <div className="h-10 w-10 rounded-full gradient-mint flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Vendedor verificado</div>
              <div className="font-display font-semibold text-sm">+98% satisfação</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
