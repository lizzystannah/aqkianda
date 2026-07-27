import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShieldCheck, Zap, MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

const SearchBarSection = () => {
  const [query, setQuery] = useState("");
  const nav = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      nav(`/explorar?q=${encodeURIComponent(query.trim())}`);
    } else {
      nav("/explorar");
    }
  };

  return (
    <section className="container py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto"
      >
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 shadow-elevated rounded-[2rem] p-2 bg-card border border-border/40">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="O que procuras? iPhone, Toyota, apartamento..."
              className="pl-14 h-14 text-base rounded-full bg-transparent border-none focus-visible:ring-0 shadow-none"
            />
          </div>
          <Button type="submit" size="lg" className="h-14 rounded-full gradient-hero text-primary-foreground hover:opacity-95 shadow-glow text-base font-semibold px-10">
            Explorar <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </form>

        <div className="mt-8 flex flex-wrap justify-center items-center gap-x-10 gap-y-4 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2 hover:text-accent transition-smooth">
            <ShieldCheck className="h-5 w-5 text-accent" /> Compra protegida
          </div>
          <div className="flex items-center gap-2 hover:text-accent transition-smooth">
            <MessageCircle className="h-5 w-5 text-accent" /> Chat directo
          </div>
          <div className="flex items-center gap-2 hover:text-accent transition-smooth">
            <Zap className="h-5 w-5 text-accent" /> Publicação grátis
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default SearchBarSection;
