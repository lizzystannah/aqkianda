import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ListingCard from "@/components/ListingCard";
import { listings, categories, getCategories, matchesListingSearch, useListingsVersion } from "@/data/listings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, MapPin, X, ArrowUpDown, Clock, TrendingUp, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const Explorar = () => {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const cat = params.get("cat") || "todos";
  const [cond, setCond] = useState<"todos" | "novo" | "usado">("todos");
  const [priceRange, setPriceRange] = useState({ min: 0, max: 100000000 });
  const [location, setLocation] = useState("Angola");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"recente" | "preco-baixo" | "preco-alto" | "destaque">("recente");
  // Recalcula quando chegam anúncios novos do servidor (sem refresh manual)
  const listingsVersion = useListingsVersion();

  // Keep state synced if URL params change externally
  useEffect(() => {
    const urlQ = params.get("q") || "";
    if (urlQ !== q) {
      setQ(urlQ);
    }
  }, [params]);

  const allCategories = getCategories();
  const selectedCategoryName = allCategories.find(c => c.slug === cat || c.id === cat)?.name;
  const searchQuery = q.trim();

  let dynamicTitle = "Explorar Anúncios";
  let dynamicDesc = "Explora anúncios de eletrónica, moda, viaturas, imóveis e muito mais na Aqkianda.";

  if (selectedCategoryName) {
    dynamicTitle = `Comprar ${selectedCategoryName}`;
    dynamicDesc = `Descobre os melhores anúncios de ${selectedCategoryName} na Aqkianda em Angola.`;
  } else if (searchQuery) {
    dynamicTitle = `Pesquisa por "${searchQuery}"`;
    dynamicDesc = `Resultados de pesquisa para "${searchQuery}" na Aqkianda Angola.`;
  }

  useDocumentMetadata({
    title: dynamicTitle,
    description: dynamicDesc,
  });

  const filtered = useMemo(() => {
    let result = listings.filter(l => {
      if (cat !== "todos" && l.categoryId !== cat) return false;
      if (cond !== "todos" && l.condition !== cond) return false;
      if (q.trim() && !matchesListingSearch(l, q.trim())) return false;
      if (l.price < priceRange.min || l.price > priceRange.max) return false;
      if (location !== "Angola" && !l.location.toLowerCase().includes(location.toLowerCase())) return false;
      return true;
    });

    switch (sortBy) {
      case "recente":
        result = [...result].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
        break;
      case "preco-baixo":
        result = [...result].sort((a, b) => a.price - b.price);
        break;
      case "preco-alto":
        result = [...result].sort((a, b) => b.price - a.price);
        break;
      case "destaque":
        result = [...result].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, cond, q, priceRange, location, sortBy, listingsVersion]);

  const setCat = (c: string) => {
    const newParams = new URLSearchParams(params);
    if (c === "todos") {
      newParams.delete("cat");
    } else {
      newParams.set("cat", c);
    }
    setParams(newParams);
  };

  const handleSearchChange = (newQ: string) => {
    setQ(newQ);
    const newParams = new URLSearchParams(params);
    if (newQ.trim()) {
      newParams.set("q", newQ.trim());
    } else {
      newParams.delete("q");
    }
    setParams(newParams, { replace: true });
  };

  const provinces = ["Angola", "Luanda", "Benguela", "Huambo", "Lubango", "Cabinda", "Namibe"];

  const sortOptions = [
    { key: "recente" as const, label: "Mais recente", icon: Clock },
    { key: "preco-baixo" as const, label: "Preço ↓", icon: ArrowUpDown },
    { key: "preco-alto" as const, label: "Preço ↑", icon: ArrowUpDown },
    { key: "destaque" as const, label: "Destaques", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl md:text-4xl">Explorar anúncios</h1>
            <p className="text-muted-foreground mt-1">{filtered.length} resultados encontrados em {location}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`rounded-full gap-2 border-border/60 ${isFilterOpen ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros Avançados
          </Button>
        </div>

        {/* Advanced Filters Panel */}
        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-8"
            >
              <div className="bg-card rounded-3xl p-6 border border-border/40 shadow-card grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Price Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Preço (AOA)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      className="rounded-xl bg-muted/50 border-transparent"
                      onChange={(e) => setPriceRange(prev => ({ ...prev, min: Number(e.target.value) || 0 }))}
                    />
                    <span className="text-muted-foreground">—</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      className="rounded-xl bg-muted/50 border-transparent"
                      onChange={(e) => setPriceRange(prev => ({ ...prev, max: Number(e.target.value) || 100000000 }))}
                    />
                  </div>
                </div>

                {/* Location Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Localização</label>
                  <div className="flex flex-wrap gap-2">
                    {provinces.map(p => (
                      <button
                        key={p}
                        onClick={() => setLocation(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth ${location === p ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/50 border-transparent hover:border-border'
                          }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Condition Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Condição</label>
                  <div className="flex gap-2">
                    {(["todos", "novo", "usado"] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setCond(c)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-smooth ${cond === c ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/50 border-transparent hover:border-border'
                          }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ordenar por</label>
                  <div className="flex flex-wrap gap-2">
                    {sortOptions.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth ${sortBy === key ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/50 border-transparent hover:border-border'
                          }`}
                      >
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reset Filters */}
                <div className="flex items-end sm:col-span-2 lg:col-span-4">
                  <Button
                    variant="ghost"
                    className="w-full rounded-xl text-muted-foreground hover:text-destructive transition-smooth"
                    onClick={() => {
                      setCond("todos");
                      setPriceRange({ min: 0, max: 100000000 });
                      setLocation("Angola");
                      setQ("");
                      setSortBy("recente");
                    }}
                  >
                    <X className="h-4 w-4 mr-2" /> Limpar Filtros
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search and Category Bar */}
        <div className="flex flex-col gap-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Pesquisar por título, marca, ténis (calçado), tags, província..."
              className="pl-12 pr-12 h-14 text-base rounded-2xl bg-card border-border shadow-card focus-visible:ring-primary/20"
            />
            {q && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Limpar pesquisa"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick search tags */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide text-xs text-muted-foreground">
            <span className="font-semibold shrink-0 flex items-center gap-1 text-foreground/80">
              <Tag className="h-3.5 w-3.5 text-primary" /> Sugestões:
            </span>
            {["Ténis", "Calçado", "iPhone", "Toyota", "Apartamento", "Sofá", "Bicicleta", "Moda"].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSearchChange(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${
                  q.toLowerCase() === tag.toLowerCase()
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
            <Button
              variant={cat === "todos" ? "default" : "outline"}
              onClick={() => setCat("todos")}
              className={`rounded-full shrink-0 h-10 px-6 font-semibold transition-smooth ${cat === "todos" ? "gradient-hero text-primary-foreground border-transparent shadow-glow" : "border-border/60 hover:border-primary/40"}`}
            >Todas</Button>
            {allCategories.map(c => (
              <Button
                key={c.slug}
                variant={cat === c.slug ? "default" : "outline"}
                onClick={() => setCat(c.slug)}
                className={`rounded-full shrink-0 h-10 px-6 font-semibold transition-smooth ${cat === c.slug ? "gradient-hero text-primary-foreground border-transparent shadow-glow" : "border-border/60 hover:border-primary/40"}`}
              >{c.name}</Button>
            ))}
          </div>
        </div>

        {/* Grid Results */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filtered.map((l, i) => (
            <ListingCard key={l.id} listing={l} index={i} />
          ))}
        </div>

        {/* Empty State */}
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 px-4 bg-muted/30 rounded-3xl border border-dashed border-border"
          >
            <div className="h-16 w-16 bg-card rounded-2xl shadow-card flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <Search className="h-8 w-8" />
            </div>
            <h3 className="font-display font-bold text-xl">Nenhum anúncio encontrado</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto text-sm">
              Não encontramos resultados para a tua pesquisa. A pesquisa normaliza acentos e maiúsculas (ex: "tenis" ou "calçado").
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  handleSearchChange("");
                  setCat("todos");
                  setCond("todos");
                  setLocation("Angola");
                }}
                className="rounded-full text-xs font-semibold px-6"
              >
                Limpar todos os filtros / Ver todos os anúncios
              </Button>
            </div>
          </motion.div>
        )}
      </section>
      <Footer />
    </div>
  );
};

export default Explorar;
