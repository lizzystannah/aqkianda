import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Calendar, Eye, Clock, ArrowRight, BookOpen, Sparkles, User, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AdSenseBanner from "@/components/AdSenseBanner";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  category: string;
  authorName: string;
  authorAvatar?: string;
  viewsCount?: number;
  isPublished: boolean;
  createdAt: string;
}

const DEFAULT_BLOG_POSTS: BlogPost[] = [
  {
    id: "blog-1",
    slug: "guia-de-compras-e-vendas-seguras-em-luanda",
    title: "Guia Definitivo para Comprar e Vender em Segurança em Luanda",
    summary: "Aprenda as melhores dicas para negociar presencialmente, verificar produtos e evitar problemas comuns em plataformas de compra e venda online em Angola.",
    content: "Conteúdo...",
    coverImage: "https://images.unsplash.com/photo-1556742049-0a67dd3a921d?auto=format&fit=crop&w=1200&q=80",
    category: "Dicas de Segurança",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-15 10:00"
  },
  {
    id: "blog-2",
    slug: "como-fotografar-produtos-para-vender-mais-rapido",
    title: "Como Fotografar os seus Produtos para Vender 3x Mais Rápido",
    summary: "Descubra como uma boa iluminação, ângulos corretos e detalhes limpos podem transformar o seu anúncio e atrair compradores em poucos minutos.",
    content: "Conteúdo...",
    coverImage: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80",
    category: "Guias de Venda",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-20 14:30"
  },
  {
    id: "blog-3",
    slug: "tendencias-de-tecnologia-e-smartphones-em-angola-2026",
    title: "Tendências de Tecnologia e Eletrónica em Angola em 2026",
    summary: "Análise dos modelos de smartphones, laptops e gadgets mais procurados no mercado angolano neste trimestre.",
    content: "Conteúdo...",
    coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
    category: "Notícias & Tendências",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-25 09:15"
  }
];

const Blog = () => {
  useDocumentMetadata({
    title: "Blog Aqkianda — Dicas de Negócios, Segurança e Guias de Compra em Angola",
    description: "Fique por dentro das melhores dicas de compra e venda, guias de segurança, negócios em Luanda e tendências de mercado no Blog Aqkianda.",
  });

  const [posts, setPosts] = useState<BlogPost[]>(DEFAULT_BLOG_POSTS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");

  useEffect(() => {
    fetch("/api/blog")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPosts(data);
        }
      })
      .catch((err) => console.debug("Error loading blog posts:", err))
      .finally(() => setLoading(false));
  }, []);

  const categories = ["Todos", ...Array.from(new Set(posts.map((p) => p.category)))];

  const filteredPosts = posts.filter((post) => {
    const matchesCategory = selectedCategory === "Todos" || post.category === selectedCategory;
    const matchesQuery =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const featuredPost = filteredPosts[0] || posts[0];
  const regularPosts = filteredPosts.slice(1);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <main className="flex-1 py-5 sm:py-10">
        <div className="container max-w-6xl px-3.5 sm:px-4">
          
          {/* Mobile-Optimized Header Banner */}
          <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-10 px-1">
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full mb-2.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Blog & Guias Aqkianda</span>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Aprenda, Venda Melhor e Compre com Segurança
            </h1>
            <p className="text-muted-foreground mt-2 text-xs sm:text-base leading-relaxed">
              Dicas de segurança, guias para vendedores e novidades do comércio em Luanda.
            </p>

            {/* Mobile Touch-friendly Search Bar */}
            <div className="relative mt-4 sm:mt-6 max-w-md mx-auto">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Pesquisar artigos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-10 sm:h-11 text-xs sm:text-sm rounded-full border-border/60 bg-card shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* AdSense Top Header Banner */}
          <AdSenseBanner />

          {/* Mobile Bleed Horizontal Categories Filter */}
          <div className="-mx-3.5 px-3.5 sm:mx-0 sm:px-0 flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 no-scrollbar snap-x">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`snap-start px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95 ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Featured Hero Article - Mobile Refined */}
          {featuredPost && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 sm:mb-12 rounded-2xl sm:rounded-3xl overflow-hidden bg-card border border-border/60 shadow-sm sm:shadow-elevated grid grid-cols-1 lg:grid-cols-12 group hover:border-primary/40 transition-all"
            >
              <Link to={`/blog/${featuredPost.slug}`} className="lg:col-span-7 relative aspect-[16/10] sm:aspect-video lg:aspect-auto overflow-hidden block">
                <img
                  src={featuredPost.coverImage}
                  alt={featuredPost.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
                  <span className="bg-primary/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full shadow-md">
                    {featuredPost.category}
                  </span>
                </div>
              </Link>

              <div className="lg:col-span-5 p-4 sm:p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      {featuredPost.createdAt.split(" ")[0]}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> 4 min
                    </span>
                  </div>

                  <Link to={`/blog/${featuredPost.slug}`}>
                    <h2 className="font-display text-lg sm:text-2xl md:text-3xl font-extrabold hover:text-primary transition-colors leading-snug sm:leading-tight">
                      {featuredPost.title}
                    </h2>
                  </Link>

                  <p className="text-muted-foreground text-xs sm:text-sm mt-2 sm:mt-3 line-clamp-2 sm:line-clamp-3 leading-relaxed">
                    {featuredPost.summary}
                  </p>
                </div>

                <div className="pt-4 sm:pt-6 border-t border-border/40 mt-4 sm:mt-6 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] sm:text-xs font-bold">
                      {featuredPost.authorAvatar || "AQ"}
                    </div>
                    <span className="text-xs font-medium truncate max-w-[120px] sm:max-w-none">{featuredPost.authorName}</span>
                  </div>

                  <Button asChild size="sm" className="rounded-full gap-1 text-xs h-8 sm:h-9 px-3.5">
                    <Link to={`/blog/${featuredPost.slug}`}>
                      <span>Ler Artigo</span>
                      <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Regular Articles Grid - 2 columns on mobile, exactly like product cards */}
          {regularPosts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6">
              {regularPosts.map((post) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl sm:rounded-2xl overflow-hidden bg-card border border-border/60 shadow-xs hover:shadow-card hover:border-primary/40 transition-all flex flex-col group"
                >
                  <Link to={`/blog/${post.slug}`} className="relative aspect-[16/10] sm:aspect-video overflow-hidden block">
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 bg-black/75 backdrop-blur-sm text-white text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 rounded-full">
                      {post.category}
                    </span>
                  </Link>

                  <div className="p-2.5 sm:p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-[9px] sm:text-[11px] text-muted-foreground mb-1">
                        <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span>{post.createdAt.split(" ")[0]}</span>
                        <span className="hidden sm:inline">•</span>
                        <Eye className="h-2.5 w-2.5 sm:h-3 sm:w-3 hidden sm:inline" />
                        <span className="hidden sm:inline">{post.viewsCount || 0} visitas</span>
                      </div>

                      <Link to={`/blog/${post.slug}`}>
                        <h3 className="font-display font-bold text-xs sm:text-lg leading-tight sm:leading-snug hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </h3>
                      </Link>

                      <p className="text-muted-foreground text-[10px] sm:text-xs mt-1 line-clamp-2 leading-tight hidden sm:block">
                        {post.summary}
                      </p>
                    </div>

                    <div className="pt-2 sm:pt-3 border-t border-border/40 mt-2 sm:mt-3 flex items-center justify-between">
                      <span className="text-[9px] sm:text-[11px] text-muted-foreground font-medium flex items-center gap-0.5 sm:gap-1 truncate">
                        <User className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> <span className="truncate">{post.authorName}</span>
                      </span>
                      <Link
                        to={`/blog/${post.slug}`}
                        className="text-[10px] sm:text-xs font-bold text-primary flex items-center gap-0.5 shrink-0 group-hover:translate-x-1 transition-transform"
                      >
                        <span className="hidden sm:inline">Ler mais</span>
                        <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </Link>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          ) : (
            filteredPosts.length === 0 && (
              <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border my-6">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <h3 className="text-base font-bold">Nenhum artigo encontrado</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Tente pesquisar por outros termos ou selecione outra categoria.
                </p>
              </div>
            )
          )}

          {/* AdSense Mid-Page Banner */}
          <AdSenseBanner className="mt-8 sm:mt-12" />

          {/* Marketplace Call to Action Box - Mobile Optimized */}
          <div className="mt-8 sm:mt-12 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-primary via-orange-600 to-amber-600 text-primary-foreground p-5 sm:p-10 text-center shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-2xl mx-auto">
              <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] sm:text-xs font-bold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full uppercase tracking-wider mb-2.5 inline-block">
                Compre e Venda em Angola
              </span>
              <h2 className="font-display text-xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                Pronto para Anunciar no Aqkianda?
              </h2>
              <p className="text-white/90 text-xs sm:text-sm mt-2">
                Crie o seu anúncio gratuito e alcance milhares de compradores sem comissões!
              </p>
              <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <Button asChild size="default" variant="secondary" className="w-full sm:w-auto rounded-full font-bold shadow-md text-xs sm:text-sm h-10">
                  <Link to="/publicar">Publicar Anúncio Grátis</Link>
                </Button>
                <Button asChild size="default" variant="outline" className="w-full sm:w-auto rounded-full border-white/40 text-white hover:bg-white/10 text-xs sm:text-sm h-10">
                  <Link to="/explorar">Explorar Ofertas</Link>
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
