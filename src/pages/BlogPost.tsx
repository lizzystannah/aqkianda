import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Eye, Clock, ArrowLeft, Facebook, MessageCircle, Copy, Check, BookOpen, Share2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AdSenseBanner from "@/components/AdSenseBanner";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BlogPost } from "./Blog";

const DEFAULT_POST: BlogPost = {
  id: "blog-1",
  slug: "guia-de-compras-e-vendas-seguras-em-luanda",
  title: "Guia Definitivo para Comprar e Vender em Segurança em Luanda",
  summary: "Aprenda as melhores dicas para negociar presencialmente, verificar produtos e evitar problemas comuns em plataformas de compra e venda online em Angola.",
  content: `
    <h2>Negociar com Confiança e Segurança no Aqkianda</h2>
    <p>O comércio eletrónico em Angola cresce a um ritmo acelerado. Comprar e vender artigos em segunda mão é uma excelente forma de economizar dinheiro e dar uma nova vida a objetos que já não utiliza. No entanto, é fundamental adotar medidas de segurança simples para proteger o seu dinheiro e integridade pessoal.</p>
    
    <h3>1. Marque Encontros Apenas em Locais Públicos e Movimentados</h3>
    <p>Nunca aceite encontrar-se com um comprador ou vendedor em locais isolados ou no interior de residências particulares de desconhecidos. Prefira pontos de referência seguros em Luanda, como:</p>
    <ul>
      <li>Centros comerciais (ex: Belas Shopping, Shopping Avennida, Kero Talatona)</li>
      <li>Postos de combustível conhecidos com movimento constante de pessoas</li>
      <li>Agências bancárias ou esquadras policiais próximas</li>
    </ul>

    <h3>2. Inspecione o Artigo com Atenção Antes de Pagar</h3>
    <p>Quando comprar telemóveis, computadores ou eletrónica, teste o dispositivo no momento do encontro. Verifique o estado da bateria, as câmeras, a ligação Wi-Fi e se o aparelho não tem bloqueios de conta ou palavras-passe ativas.</p>

    <h3>3. Cuidado com Sinais de Pagamento Antecipado</h3>
    <p>Desconfie de vendedores que exijam "sinal" ou transferência antecipada via Multicaixa Express antes de mostrar o produto pessoalmente. No Aqkianda, encorajamos que a transação ocorra no momento em que recebe e verifica o artigo.</p>

    <h3>4. Guarde as Conversas dentro da Plataforma</h3>
    <p>Utilize o sistema de mensagens integrado do Aqkianda para manter o registo das suas negociações. Assim, em caso de dúvida ou necessidade de suporte, a nossa equipa poderá auxiliar rapidamente.</p>
  `,
  coverImage: "https://images.unsplash.com/photo-1556742049-0a67dd3a921d?auto=format&fit=crop&w=1200&q=80",
  category: "Dicas de Segurança",
  authorName: "Equipa Aqkianda",
  authorAvatar: "AQ",
  viewsCount: 0,
  isPublished: true,
  createdAt: "2026-09-15 10:00"
};

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);

    fetch(`/api/blog/${slug}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Post não encontrado");
      })
      .then((data) => {
        setPost(data);
      })
      .catch(() => {
        setPost(DEFAULT_POST);
      })
      .finally(() => setLoading(false));

    // Fetch related articles
    fetch("/api/blog")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRelatedPosts(data.filter((p) => p.slug !== slug).slice(0, 3));
        }
      })
      .catch(() => {});
  }, [slug]);

  useDocumentMetadata({
    title: post ? `${post.title} — Blog Aqkianda` : "Artigo do Blog — Aqkianda",
    description: post ? post.summary : "Leia o artigo completo no Blog Aqkianda.",
  });

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    toast({
      title: "Link copiado! 🔗",
      description: "O link deste artigo foi copiado para a sua área de transferência.",
    });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleShareWhatsApp = () => {
    if (!post) return;
    const text = encodeURIComponent(`*${post.title}*\n\n${post.summary}\n\nLeia o artigo completo no Aqkianda:\n${currentUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleShareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <Header />
        <div className="container max-w-3xl my-16 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-xs sm:text-sm text-muted-foreground">A carregar artigo do blog...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <Header />
        <div className="container max-w-lg my-16 text-center px-4">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-xl font-bold">Artigo não encontrado</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-5">
            O artigo que procura pode ter sido removido ou o link está incorreto.
          </p>
          <Button onClick={() => navigate("/blog")} size="sm" className="rounded-full">Voltar ao Blog</Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-16 md:pb-0">
      <Header />

      <main className="flex-1 py-4 sm:py-10">
        <article className="container max-w-3xl px-3.5 sm:px-4">
          
          {/* Mobile Breadcrumb Back button */}
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-card border border-border/60 shadow-xs text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Voltar ao Blog</span>
          </Link>

          {/* Category Badge & Meta */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-muted-foreground mb-3">
            <span className="bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs">
              {post.category}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {post.createdAt.split(" ")[0]}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> 4 min
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {post.viewsCount || 0} visitas
            </span>
          </div>

          {/* Title */}
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl font-extrabold leading-snug sm:leading-tight tracking-tight">
            {post.title}
          </h1>

          {/* Author info & Quick Share Bar */}
          <div className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-card border border-border/50 my-4 sm:my-6">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs sm:text-sm">
                {post.authorAvatar || "AQ"}
              </div>
              <div>
                <div className="font-bold text-xs sm:text-sm text-foreground">{post.authorName}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Blog Aqkianda</div>
              </div>
            </div>

            {/* Desktop Share Buttons */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={handleShareWhatsApp}
                title="Partilhar no WhatsApp"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-green-500/10 text-green-600 hover:bg-green-500/20 flex items-center justify-center transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={handleShareFacebook}
                title="Partilhar no Facebook"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 flex items-center justify-center transition-colors"
              >
                <Facebook className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopyLink}
                title="Copiar Link"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 flex items-center justify-center transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Cover Image */}
          <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs my-4 sm:my-8 aspect-[16/10] sm:aspect-video">
            <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
          </div>

          {/* AdSense Banner before content */}
          <AdSenseBanner />

          {/* Article Summary Lead */}
          <div className="text-xs sm:text-base font-medium text-foreground/90 leading-relaxed border-l-4 border-primary pl-3 sm:pl-4 my-4 sm:my-6 italic bg-primary/5 py-2.5 sm:py-3 rounded-r-xl">
            {post.summary}
          </div>

          {/* Formatted Article Body with Responsive Mobile Prose Typography */}
          <div
            className="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-base leading-relaxed sm:leading-relaxed prose-headings:font-display prose-headings:font-bold prose-h2:text-lg sm:prose-h2:text-2xl prose-h2:mt-6 prose-h2:mb-2 prose-h3:text-base sm:prose-h3:text-xl prose-h3:mt-4 prose-h3:mb-2 prose-p:text-xs sm:prose-p:text-base prose-p:my-2.5 sm:prose-p:my-3.5 prose-ul:my-2 sm:prose-ul:my-3 prose-li:my-1 prose-img:rounded-xl my-6"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* AdSense Banner inside article bottom */}
          <AdSenseBanner className="my-6 sm:my-10" />

          {/* Share Box Bottom */}
          <div className="rounded-2xl bg-card border border-border/60 p-4 sm:p-6 my-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <h4 className="font-bold text-xs sm:text-sm">Gostou deste artigo?</h4>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Partilhe com os seus contactos e ajude a comunidade Aqkianda!</p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <Button onClick={handleShareWhatsApp} size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-full gap-1.5 text-xs h-9 px-4 flex-1 sm:flex-initial">
                <MessageCircle className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </Button>
              <Button onClick={handleCopyLink} size="sm" variant="outline" className="rounded-full gap-1.5 text-xs h-9 px-3.5">
                <Copy className="h-3.5 w-3.5" />
                <span>{copied ? "Copiado!" : "Copiar Link"}</span>
              </Button>
            </div>
          </div>

          {/* Related Articles */}
          {relatedPosts.length > 0 && (
            <div className="mt-10 sm:mt-14 pt-8 sm:pt-10 border-t border-border/60">
              <h3 className="font-display text-lg sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-2">
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span>Mais Artigos do Blog</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-6">
                {relatedPosts.map((rel) => (
                  <Link
                    key={rel.id}
                    to={`/blog/${rel.slug}`}
                    className="group rounded-xl overflow-hidden bg-card border border-border/50 hover:border-primary/40 transition-all flex flex-row sm:flex-col items-center sm:items-stretch"
                  >
                    <div className="w-28 sm:w-full aspect-[16/10] sm:aspect-video overflow-hidden shrink-0">
                      <img src={rel.coverImage} alt={rel.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <span className="text-[9px] font-bold uppercase text-primary block mb-0.5">{rel.category}</span>
                        <h4 className="font-bold text-xs sm:text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">{rel.title}</h4>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-2 block">{rel.createdAt.split(" ")[0]}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </article>
      </main>

      {/* Floating Share Bar on Mobile Screen Bottom */}
      <div className="md:hidden fixed bottom-14 left-3 right-3 z-40 bg-card/95 backdrop-blur-md border border-border/80 p-2.5 rounded-full shadow-lg flex items-center justify-between gap-2 px-4">
        <span className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">Partilhar artigo</span>
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleShareWhatsApp}
            className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm active:scale-95"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </button>
          <button
            onClick={handleCopyLink}
            className="bg-muted text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 active:scale-95"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default BlogPostPage;
