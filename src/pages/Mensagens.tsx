import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Send, Search, ArrowLeft, X, Paperclip, ZoomIn, Lock, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth, getAuthHeaders } from "@/context/AuthContext";
import { compressImage } from "@/utils/imageCompression";
import { useToast } from "@/hooks/use-toast";

type Msg = {
  from: "me" | "them";
  text?: string;
  image?: string;
  time: string;
};

type Conversation = {
  id: string;
  name: string;
  otherEmail: string;
  last: string;
  time: string;
  unread: number;
  avatar: string;
  product: string;
  listingId?: string;
};

type RouteState = {
  sellerName?: string;
  productName?: string;
  sellerEmail?: string;
  receiverEmail?: string;
  sellerId?: string;
  receiverId?: string;
  listingId?: string;
} | null;

type ServerMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverId?: string;
  receiverEmail?: string;
  listingId?: string;
  productName?: string;
  content: string;
  image?: string;
  createdAt: string;
};

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "vendedor";
}

// ID de conversa determinístico: ambas as partes geram o mesmo ID,
// por isso a mensagem aparece nos dois lados.
function buildConversationId(listingId: string | undefined, emailA: string, emailB: string): string {
  const a = (emailA || "").trim().toLowerCase();
  const b = (emailB || "").trim().toLowerCase();
  const lid = (listingId || "geral").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "geral";
  if (!b) return `dm_${a}_${lid}`.slice(0, 120);
  const sorted = [a, b].sort();
  return `lst_${lid}__${sorted[0]}__${sorted[1]}`.slice(0, 128);
}

function buildFallbackConversationId(listingId: string | undefined, sellerName: string, buyerEmail: string): string {
  const lid = (listingId || "geral").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "geral";
  return `seller_${slugifyName(sellerName)}_${lid}__${buyerEmail.trim().toLowerCase()}`.slice(0, 128);
}

function avatarFor(name: string): string {
  const parts = name.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
  return parts || name.charAt(0).toUpperCase() || "?";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso || "";
  }
}

const Mensagens = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, openAuthModal, user } = useAuth();
  const { toast } = useToast();
  const routeState = location.state as RouteState;

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const routeConsumedRef = useRef<string | null>(null);

  const myEmail = (user?.email || "").trim().toLowerCase();

  // Meta cache (apenas nomes/produtos — as mensagens vêm sempre do servidor)
  const getMetaKey = useCallback(
    () => (myEmail ? `aqkianda-convmeta_${myEmail}` : "aqkianda-convmeta_guest"),
    [myEmail]
  );

  const [conversationsList, setConversationsList] = useState<Conversation[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, Msg[]>>({});
  const [convMeta, setConvMeta] = useState<Record<string, { name: string; product: string; otherEmail: string; listingId?: string }>>({});
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [mobileActiveView, setMobileActiveView] = useState<"list" | "chat">("list");
  const [text, setText] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);

  // Carrega meta cache
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getMetaKey());
      if (raw) setConvMeta(JSON.parse(raw));
      else setConvMeta({});
    } catch {
      setConvMeta({});
    }
  }, [getMetaKey]);

  const persistMeta = useCallback(
    (meta: Record<string, { name: string; product: string; otherEmail: string; listingId?: string }>) => {
      try {
        localStorage.setItem(getMetaKey(), JSON.stringify(meta));
      } catch {
        // quota cheia — ignora, servidor continua fonte de verdade
      }
    },
    [getMetaKey]
  );

  const loadMessages = useCallback(async () => {
    if (!myEmail) return;
    try {
      const res = await fetch(`/api/messages?user=${encodeURIComponent(myEmail)}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        if (!loading) return;
        setLoading(false);
        return;
      }
      const data: ServerMessage[] = await res.json();
      const grouped: Record<string, ServerMessage[]> = {};
      for (const m of Array.isArray(data) ? data : []) {
        const cid = (m.conversationId || "").trim().toLowerCase();
        if (!cid) continue;
        if (!grouped[cid]) grouped[cid] = [];
        grouped[cid].push(m);
      }
      for (const cid of Object.keys(grouped)) {
        grouped[cid].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }

      setConvMeta((prevMeta) => {
        const nextMeta = { ...prevMeta };
        const convs: Conversation[] = Object.entries(grouped).map(([cid, msgs]) => {
          const first = msgs[0];
          const lastMsg = msgs[msgs.length - 1];
          // Descobre a outra parte
          let otherEmail = "";
          if (first.senderEmail?.toLowerCase() === myEmail) {
            otherEmail = (first.receiverEmail || "").toLowerCase();
          } else {
            otherEmail = (first.senderEmail || "").toLowerCase();
          }
          const cached = nextMeta[cid] || prevMeta[cid];
          // Nome: usa cache (nome do vendedor) ou nome do remetente real
          let name = cached?.name || "";
          if (!name) {
            name = first.senderEmail?.toLowerCase() === myEmail
              ? (otherEmail || "Vendedor")
              : (first.senderName || otherEmail || "Utilizador");
          }
          const product = cached?.product || first.productName || "Geral";
          const listingId = cached?.listingId || first.listingId;
          if (!cached) {
            nextMeta[cid] = { name, product, otherEmail, listingId };
          } else {
            // completa otherEmail se faltava
            if (!cached.otherEmail && otherEmail) {
              nextMeta[cid] = { ...cached, otherEmail };
            }
          }
          const preview = lastMsg.image && !lastMsg.content?.trim() ? "📷 [Imagem enviada]" : (lastMsg.content || "").slice(0, 80);
          return {
            id: cid,
            name,
            otherEmail: nextMeta[cid]?.otherEmail || otherEmail,
            last: preview || (lastMsg.image ? "📷 [Imagem]" : "—"),
            time: formatTime(lastMsg.createdAt),
            unread: 0,
            avatar: avatarFor(name),
            product,
            listingId,
          };
        });
        // Ordena pela última mensagem
        convs.sort((a, b) => {
          const ta = grouped[a.id][grouped[a.id].length - 1]?.createdAt || "";
          const tb = grouped[b.id][grouped[b.id].length - 1]?.createdAt || "";
          return new Date(tb).getTime() - new Date(ta).getTime();
        });
        persistMeta(nextMeta);

        const nextMsgs: Record<string, Msg[]> = {};
        for (const [cid, msgs] of Object.entries(grouped)) {
          nextMsgs[cid] = msgs.map((m) => ({
            from: (m.senderEmail || "").toLowerCase() === myEmail ? "me" : "them",
            text: m.content || undefined,
            image: m.image || undefined,
            time: formatTime(m.createdAt),
          }));
        }

        setMessagesMap((prev) => {
          // Preserva conversa pendente local (sem mensagens no servidor ainda)
          const merged = { ...nextMsgs };
          for (const [cid, localMsgs] of Object.entries(prev)) {
            if (!merged[cid] && localMsgs.length === 0) merged[cid] = localMsgs;
          }
          return merged;
        });
        setConversationsList((prev) => {
          // Preserva conversa pendente que ainda não tem mensagens no servidor
          const pending = prev.filter((c) => !grouped[c.id]);
          const all = [...pending.filter((p) => (messagesMap[p.id] || []).length === 0 || true), ...convs];
          // dedupe por id
          const seen = new Set<string>();
          return all.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
        });
        return nextMeta;
      });
      setLoading(false);
    } catch (e) {
      console.debug("Erro ao carregar mensagens:", e);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

  // Carga inicial + polling (5s) para receber mensagens do outro lado
  useEffect(() => {
    if (!isAuthenticated || !myEmail) return;
    setLoading(true);
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [isAuthenticated, myEmail, loadMessages]);

  // Consome o state vindo de Anúncio/Vendedor UMA única vez
  useEffect(() => {
    if (!routeState?.sellerName || !myEmail) return;
    const key = JSON.stringify(routeState);
    if (routeConsumedRef.current === key) return;
    routeConsumedRef.current = key;

    const sellerName = routeState.sellerName;
    const productName = routeState.productName || "Geral";
    const sellerEmail = (routeState.sellerEmail || routeState.receiverEmail || "").trim().toLowerCase();
    const listingId = routeState.listingId;

    if (sellerEmail && sellerEmail === myEmail) {
      toast({ title: "É o teu próprio anúncio", description: "Não podes enviar mensagem a ti próprio." });
      window.history.replaceState({}, document.title);
      return;
    }

    const cid = sellerEmail
      ? buildConversationId(listingId, myEmail, sellerEmail)
      : buildFallbackConversationId(listingId, sellerName, myEmail);

    setConvMeta((prev) => {
      if (!prev[cid]) {
        const next = { ...prev, [cid]: { name: sellerName, product: productName, otherEmail: sellerEmail, listingId } };
        persistMeta(next);
        return next;
      }
      return prev;
    });

    setConversationsList((prev) => {
      if (prev.some((c) => c.id === cid)) return prev;
      const nc: Conversation = {
        id: cid,
        name: sellerName,
        otherEmail: sellerEmail,
        last: "Clique para enviar uma mensagem.",
        time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        unread: 0,
        avatar: avatarFor(sellerName),
        product: productName,
        listingId,
      };
      return [nc, ...prev];
    });
    setMessagesMap((prev) => (prev[cid] ? prev : { ...prev, [cid]: [] }));
    setActiveId(cid);
    setMobileActiveView("chat");
    window.history.replaceState({}, document.title);
  }, [routeState, myEmail, persistMeta, toast]);

  // Seleciona a primeira conversa quando carrega
  useEffect(() => {
    if (!activeId && conversationsList.length > 0) {
      setActiveId(conversationsList[0].id);
    }
  }, [conversationsList, activeId]);

  const active = conversationsList.find((c) => c.id === activeId) || conversationsList[0];
  const msgs = (active && messagesMap[active.id]) || [];

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messagesMap, attachedImage, activeId]);

  const handleSelectConversation = (c: Conversation) => {
    setActiveId(c.id);
    setAttachedImage(null);
    setMobileActiveView("chat");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, { maxDimension: 1200, quality: 0.82 });
        if (!compressed) return;
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: compressed, name: file.name }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              setAttachedImage(data.url);
              return;
            }
          }
        } catch (uploadErr) {
          console.debug("Chat image upload fallback:", uploadErr);
        }
        setAttachedImage(compressed);
      } catch (err) {
        console.error("Erro ao comprimir imagem de mensagem:", err);
      }
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !attachedImage) || !active || sending) return;
    if (!isAuthenticated) {
      openAuthModal("/mensagens");
      return;
    }

    const content = text.trim() || (attachedImage ? "[Imagem]" : "");
    if (!content && !attachedImage) return;

    // Sem email do destinatário não há entrega — avisa em vez de simular
    if (!active.otherEmail) {
      toast({
        variant: "destructive",
        title: "Vendedor sem email registado",
        description: "Este anúncio ainda não tem conta associada. A mensagem ficará guardada mas o vendedor só a verá quando registar esse email.",
      });
    }

    const currentTime = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    const optimistic: Msg = { from: "me", text: content || undefined, image: attachedImage || undefined, time: currentTime };

    setMessagesMap((prev) => ({ ...prev, [active.id]: [...(prev[active.id] || []), optimistic] }));
    setConversationsList((prev) => {
      const updated = prev.map((c) => (c.id === active.id ? { ...c, last: attachedImage && !text.trim() ? "📷 [Imagem enviada]" : content, time: currentTime } : c));
      const idx = updated.findIndex((c) => c.id === active.id);
      if (idx > 0) {
        const [conv] = updated.splice(idx, 1);
        updated.unshift(conv);
      }
      return updated;
    });
    setText("");
    const imgToSend = attachedImage;
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setSending(true);
    try {
      const meta = convMeta[active.id];
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          conversationId: active.id,
          receiverEmail: active.otherEmail || undefined,
          receiverId: routeState?.receiverId || routeState?.sellerId || undefined,
          listingId: active.listingId || meta?.listingId || routeState?.listingId || undefined,
          productName: active.product || "Geral",
          content,
          image: imgToSend || undefined,
          isFromBuyer: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Falha ao enviar");
      }
      // Recarrega para confirmar persistência no servidor
      loadMessages();
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      toast({ variant: "destructive", title: "Não foi possível entregar", description: "Verifica a ligação e tenta novamente." });
      // Reverte otimismo em caso de falha
      setMessagesMap((prev) => ({ ...prev, [active.id]: (prev[active.id] || []).filter((m) => m !== optimistic) }));
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversationsList.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.product.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 sm:py-16 flex flex-col items-center justify-center text-center">
          <div className="w-full max-w-sm sm:max-w-md bg-card border border-border/60 rounded-3xl p-6 sm:p-8 shadow-card flex flex-col items-center text-center">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5 shadow-sm border border-primary/20">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Mensagens Privadas</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mb-6 leading-relaxed">
              Para veres o teu histórico de conversas, negociar artigos e comunicar em segurança com vendedores ou compradores em Angola, inicia sessão.
            </p>
            <div className="w-full space-y-3">
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => navigate("/entrar?redirect=/mensagens")} className="w-full h-10 font-semibold rounded-xl text-xs">
                  Fazer Login
                </Button>
                <Button onClick={() => navigate("/registar?redirect=/mensagens")} className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs shadow-sm">
                  Criar Conta
                </Button>
              </div>
              <Button variant="ghost" onClick={() => navigate("/")} className="w-full h-9 font-medium text-xs text-muted-foreground hover:text-foreground mt-2">
                Voltar à Página Inicial
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <section className="w-full max-w-7xl mx-auto px-0 sm:px-4 py-1 sm:py-6 flex-1 flex flex-col">
        <div className="px-3 sm:px-0 flex items-center gap-3 mb-2 sm:mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 border border-border/40 bg-card shadow-sm flex items-center justify-center shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display font-bold text-xl sm:text-3xl">Mensagens</h1>
        </div>
        <div className="flex-1 grid md:grid-cols-[320px_1fr] bg-card rounded-none sm:rounded-3xl border-y sm:border border-border/40 shadow-card overflow-hidden h-[calc(100vh-130px)] sm:h-[650px]">
          <aside className={`border-r border-border/40 flex flex-col h-full ${mobileActiveView === "list" ? "flex w-full" : "hidden md:flex"}`}>
            <div className="p-4 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Procurar conversa..."
                  className="pl-9 h-10 rounded-full bg-muted border-transparent text-foreground"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">A carregar conversas…</div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <MessageSquare className="h-8 w-8 opacity-30" />
                  {searchQuery ? "Nenhuma conversa encontrada" : "Ainda não tens conversas. Abre um anúncio e clica em “Falar com o vendedor”."}
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectConversation(c)}
                    className={`w-full flex items-center gap-3 p-4 text-left border-b border-border/40 hover:bg-muted/50 transition-smooth ${active && active.id === c.id ? "bg-muted" : ""}`}
                  >
                    <div className="h-12 w-12 rounded-full gradient-hero flex items-center justify-center font-display font-bold text-primary-foreground shrink-0">
                      {c.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate text-sm text-foreground">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{c.time}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{c.last}</div>
                      <div className="text-[10px] text-primary mt-0.5 truncate">📦 {c.product}</div>
                    </div>
                    {c.unread > 0 && (
                      <span className="h-5 w-5 rounded-full gradient-hero text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {c.unread}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          {active ? (
            <div className={`flex flex-col h-full flex-1 ${mobileActiveView === "chat" ? "flex w-full" : "hidden md:flex"}`}>
              <header className="flex items-center gap-3 p-4 border-b border-border/40 bg-card">
                <button
                  onClick={() => setMobileActiveView("list")}
                  className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Voltar para a lista"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="h-10 w-10 rounded-full gradient-hero flex items-center justify-center font-display font-bold text-primary-foreground shrink-0">
                  {active.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm sm:text-base truncate text-foreground">{active.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[220px] sm:max-w-xs">
                    📦 {active.product}
                    {active.otherEmail ? ` · ${active.otherEmail}` : " · sem email do vendedor"}
                  </div>
                </div>
              </header>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-muted/20">
                {msgs.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    Sem mensagens ainda. Escreve a primeira mensagem — ela será entregue à conta {active.otherEmail || "do vendedor"}.
                  </div>
                ) : (
                  msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] p-3 sm:p-4 rounded-2xl ${
                          m.from === "me"
                            ? "bg-primary text-primary-foreground rounded-br-sm shadow-sm"
                            : "bg-card text-foreground rounded-bl-sm shadow-sm border border-border/20"
                        }`}
                      >
                        {m.image && (
                          <div className="relative group mb-2 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-sm">
                            <img
                              src={m.image}
                              alt="Imagem enviada"
                              className="w-full h-auto max-h-72 object-cover rounded-xl cursor-pointer transition-transform duration-200 group-hover:scale-105"
                              onClick={() => setZoomedImage(m.image!)}
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedImage(m.image!)}
                              className="absolute bottom-2 right-2 bg-black/60 text-white p-1.5 rounded-full backdrop-blur-md opacity-80 hover:opacity-100 transition-opacity"
                              title="Expandir imagem"
                            >
                              <ZoomIn className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        {m.text && <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>}
                        <span className="text-[9px] opacity-70 mt-1 block text-right">{m.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {attachedImage && (
                <div className="px-4 pt-3 bg-card border-t border-border/20 flex items-center gap-3">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-border shadow-sm group bg-muted shrink-0">
                    <img src={attachedImage} alt="Anexo" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachedImage(null)}
                      className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full hover:bg-rose-600 transition-colors"
                      title="Remover imagem"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground flex-1">
                    <span className="font-semibold text-foreground block">Imagem pronta para envio</span>
                    Clique em enviar ou digite uma legenda adicional.
                  </div>
                </div>
              )}

              <form onSubmit={send} className="flex items-center gap-2 p-3 sm:p-4 border-t border-border/40 bg-card">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full border-border/60 hover:bg-primary/10 hover:text-primary shrink-0 transition-colors"
                  title="Enviar Imagem ou Print"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={attachedImage ? "Adicionar legenda à imagem..." : "Escreva uma mensagem..."}
                  className="flex-1 h-11 rounded-full bg-muted border-transparent text-foreground text-xs sm:text-sm px-4 focus-visible:ring-primary/20"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!text.trim() && !attachedImage) || sending}
                  className="h-11 w-11 rounded-full bg-primary hover:bg-primary/90 text-white shrink-0 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <p>Selecione uma conversa para começar a falar</p>
            </div>
          )}
        </div>
      </section>

      {zoomedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
            <img src={zoomedImage} alt="Imagem ampliada" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-12 right-0 bg-white/20 text-white p-2 rounded-full hover:bg-white/40 transition-colors"
              title="Fechar"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Mensagens;
