import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Crown, LayoutGrid, Flame, Feather, Building2,
  Grid3X3, Newspaper, ShoppingBag, Wind, X, Check, Sliders, Info
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  gradient: string;
  textColor: string;
  badge: string;
  category: "all" | "modern" | "classic" | "editorial" | "ecommerce";
  icon: React.ComponentType<{ className?: string }>;
}

const templates: TemplateOption[] = [
  {
    id: "classic",
    name: "Classic Aqkianda",
    description: "Layout original refinado com slider grande em destaque e categorias coloridas.",
    gradient: "from-orange-500 to-amber-500",
    textColor: "text-amber-500",
    badge: "Original",
    category: "classic",
    icon: Sparkles
  },
  {
    id: "premium",
    name: "Onyx Premium",
    description: "Design editorial luxuoso em tons de preto e dourado, tipografia serifada e curadoria.",
    gradient: "from-[#c9a96e] to-[#8a6f3e]",
    textColor: "text-[#c9a96e]",
    badge: "Luxo",
    category: "editorial",
    icon: Crown
  },
  {
    id: "modern",
    name: "Sleek Bento",
    description: "Layout limpo com bento-cards arredondados, fontes modernas e azul cobalto profundo.",
    gradient: "from-blue-600 to-cyan-500",
    textColor: "text-blue-500",
    badge: "Moderno",
    category: "modern",
    icon: LayoutGrid
  },
  {
    id: "vibrant",
    name: "Neon Glassmorphism",
    description: "Fundo gradiente místico escuro com glows brilhantes, desfoque de vidro e neon fuchsia.",
    gradient: "from-fuchsia-500 to-pink-500",
    textColor: "text-pink-500",
    badge: "Vibrante",
    category: "modern",
    icon: Flame
  },
  {
    id: "minimal",
    name: "Nordic Sand",
    description: "Aparência minimalista leve, fundo areia quente, linhas finas e calmaria visual.",
    gradient: "from-amber-800 to-stone-500",
    textColor: "text-amber-900",
    badge: "Minimal",
    category: "classic",
    icon: Feather
  },
  {
    id: "b2b",
    name: "B2B Glassmorphic",
    description: "Foco comercial com fornecedores verificados, rotas comerciais globais e estatísticas dinâmicas.",
    gradient: "from-emerald-500 to-teal-500",
    textColor: "text-emerald-500",
    badge: "Industrial",
    category: "ecommerce",
    icon: Building2
  },
  {
    id: "grid",
    name: "Visual Grid",
    description: "Organização geométrica em grelha limpa com foco máximo em fotos de anúncios.",
    gradient: "from-indigo-500 to-purple-500",
    textColor: "text-indigo-500",
    badge: "Visual",
    category: "modern",
    icon: Grid3X3
  },
  {
    id: "magazine",
    name: "Editorial Paper",
    description: "Visual de jornal impresso contemporâneo com margens largas e títulos fortes.",
    gradient: "from-stone-800 to-stone-900",
    textColor: "text-stone-800",
    badge: "Jornal",
    category: "editorial",
    icon: Newspaper
  },
  {
    id: "bazaar",
    name: "Soco Bazaar",
    description: "Inspirado em bazares locais tradicionais com densidade de grelha otimizada.",
    gradient: "from-rose-500 to-orange-500",
    textColor: "text-rose-500",
    badge: "Bazaar",
    category: "ecommerce",
    icon: ShoppingBag
  },
  {
    id: "clean",
    name: "Pure Breeze",
    description: "Design arejado com margens ultra generosas e esquema de cores carvão sobre branco.",
    gradient: "from-sky-500 to-indigo-500",
    textColor: "text-sky-600",
    badge: "Limpo",
    category: "classic",
    icon: Wind
  }
];

export default function TemplateCustomizer() {
  const { activeTemplate, setActiveTemplate } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | "modern" | "classic" | "editorial" | "ecommerce">("all");

  const filteredTemplates = activeCategory === "all"
    ? templates
    : templates.filter(t => t.category === activeCategory);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Trigger Button */}
      <motion.button
        id="template-customizer-trigger"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 h-12 px-5 rounded-full bg-primary text-primary-foreground shadow-glow font-bold border border-primary-glow/20 relative group overflow-hidden"
      >
        <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <Sliders className="h-5 w-5 animate-pulse" />
        <span className="text-sm font-semibold tracking-wide">Direcção Visual</span>
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
        </span>
      </motion.button>

      {/* Slide-Up Customizer Deck */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop overlay for focus */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-background/30 backdrop-blur-sm z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 180 }}
              className="fixed bottom-24 right-6 left-6 md:left-auto md:w-[680px] bg-card border border-border/80 rounded-3xl shadow-elevated p-6 z-50 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-primary" />
                    <h3 className="font-display font-bold text-lg">Direcções Visuais de Aqkianda</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Info className="h-3 w-3 text-primary/60 shrink-0" />
                    Escolha um tema. Toda a página inicial se transforma instantaneamente!
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-smooth"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 mb-5 p-1 bg-muted/50 rounded-xl w-fit">
                {(["all", "classic", "modern", "editorial", "ecommerce"] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-smooth ${
                      activeCategory === cat
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat === "all" ? "Todos os Estilos" : cat}
                  </button>
                ))}
              </div>

              {/* Grid of Templates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredTemplates.map((t) => {
                  const Icon = t.icon;
                  const isSelected = activeTemplate === t.id;

                  return (
                    <motion.button
                      key={t.id}
                      onClick={() => {
                        setActiveTemplate(t.id);
                        // Optional scroll-to-top on change
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      whileHover={{ scale: 1.01, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      className={`flex gap-3.5 p-4 rounded-2xl text-left border-2 transition-all duration-300 relative overflow-hidden group ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border/40 hover:border-border-hover bg-card/50 hover:bg-card hover:shadow-sm"
                      }`}
                    >
                      {/* Visual Icon Box */}
                      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shadow-sm shrink-0`}>
                        <Icon className="h-5.5 w-5.5 text-white" />
                      </div>

                      <div className="flex-1 space-y-1 pr-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-display font-bold text-sm tracking-tight">{t.name}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gradient-to-r ${t.gradient} text-white shrink-0`}>
                            {t.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug font-medium line-clamp-2">
                          {t.description}
                        </p>
                      </div>

                      {/* Selected Indicator Check */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>Total: 10 Modelos de Design Prontos</span>
                <span className="text-primary font-semibold">Tons Angolanos 2026 🇦🇴</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
