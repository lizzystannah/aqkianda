import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Send, Search, ArrowLeft, Image as ImageIcon, X, Paperclip, ZoomIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Msg = { 
  from: "me" | "them"; 
  text?: string; 
  image?: string; 
  time: string; 
};

const DEFAULT_CONVERSATIONS = [
  { id: "1", name: "Tech Luanda", last: "Boa tarde, ainda está disponível?", time: "14:32", unread: 2, avatar: "TL", product: "iPhone 13 Pro Max 256GB" },
  { id: "2", name: "Kalandula Motors", last: "Posso negociar o preço.", time: "12:18", unread: 0, avatar: "KM", product: "Toyota Hilux 2020 4x4" },
  { id: "3", name: "Fashion Store", last: "Tenho do tamanho 42 sim 👟", time: "Ontem", unread: 0, avatar: "FS", product: "Ténis Nike Air Max" },
  { id: "4", name: "Imobiliária Futuro", last: "Posso enviar mais fotos", time: "Seg", unread: 1, avatar: "IF", product: "Apartamento T3 Kilamba" },
];

const DEFAULT_MESSAGES: Record<string, Msg[]> = {
  "1": [
    { from: "them", text: "Boa tarde! Ainda tem disponível?", time: "14:30" },
    { from: "me", text: "Olá! Sim, ainda está disponível.", time: "14:31" },
    { from: "them", text: "Aceita troca por outro modelo?", time: "14:32" },
  ],
  "2": [
    { from: "them", text: "Olá! Estou interessado no seu Toyota Hilux. Aceita negociar o preço?", time: "12:10" },
    { from: "me", text: "Olá! Sim, posso negociar ligeiramente.", time: "12:15" },
    { from: "them", text: "Posso negociar o preço.", time: "12:18" },
  ],
  "3": [
    { from: "them", text: "Tem o Nike Air Max em tamanho 42?", time: "Ontem 10:00" },
    { from: "me", text: "Sim, temos sim!", time: "Ontem 10:15" },
    { from: "them", text: "Tenho do tamanho 42 sim 👟", time: "Ontem 10:16" },
  ],
  "4": [
    { from: "them", text: "Olá! Gostaria de ver mais fotos do T3 Kilamba.", time: "Seg 11:20" },
    { from: "me", text: "Olá! Vou providenciar as fotos.", time: "Seg 11:30" },
    { from: "them", text: "Posso enviar mais fotos", time: "Seg 11:35" },
    { from: "them", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80", text: "Aqui está uma foto da sala de estar.", time: "Seg 11:36" }
  ]
};

const Mensagens = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as { sellerName?: string; productName?: string } | null;

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll window to top on page mount, state transition or view change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeState]);

  const [searchQuery, setSearchQuery] = useState("");
  const [conversationsList, setConversationsList] = useState<typeof DEFAULT_CONVERSATIONS>(() => {
    const saved = localStorage.getItem("aqkianda-conversations");
    return saved ? JSON.parse(saved) : DEFAULT_CONVERSATIONS;
  });

  const [messagesMap, setMessagesMap] = useState<Record<string, Msg[]>>(() => {
    const saved = localStorage.getItem("aqkianda-messages");
    return saved ? JSON.parse(saved) : DEFAULT_MESSAGES;
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem("aqkianda-conversations");
    const list = saved ? JSON.parse(saved) : DEFAULT_CONVERSATIONS;
    return list[0]?.id || "1";
  });

  const [mobileActiveView, setMobileActiveView] = useState<"list" | "chat">("list");
  const [text, setText] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const active = conversationsList.find((c) => c.id === activeId) || conversationsList[0];
  const msgs = messagesMap[activeId] || [];

  // Scroll to bottom when msgs change
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [msgs, attachedImage, activeId]);

  // Check route state on load/change
  useEffect(() => {
    if (routeState && routeState.sellerName && routeState.productName) {
      const { sellerName, productName } = routeState;
      const existing = conversationsList.find(
        (c) =>
          c.name.toLowerCase() === sellerName.toLowerCase() &&
          c.product.toLowerCase() === productName.toLowerCase()
      );

      if (existing) {
        setActiveId(existing.id);
        setMobileActiveView("chat");
      } else {
        const newId = `custom-${Date.now()}`;
        const newConv = {
          id: newId,
          name: sellerName,
          last: "Clique para enviar uma mensagem.",
          time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          unread: 0,
          avatar: sellerName
            .split(" ")
            .map((w) => w.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase() || sellerName.charAt(0).toUpperCase(),
          product: productName,
        };

        const newMsgs: Msg[] = [
          {
            from: "them",
            text: `Olá! Sou o(a) vendedor(a) de: "${productName}". Como posso ajudar?`,
            time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          },
        ];

        const updatedConversations = [newConv, ...conversationsList];
        const updatedMessagesMap = { ...messagesMap, [newId]: newMsgs };

        setConversationsList(updatedConversations);
        setMessagesMap(updatedMessagesMap);
        setActiveId(newId);
        setMobileActiveView("chat");

        localStorage.setItem("aqkianda-conversations", JSON.stringify(updatedConversations));
        localStorage.setItem("aqkianda-messages", JSON.stringify(updatedMessagesMap));
      }

      // Clear router state from history
      window.history.replaceState({}, document.title);
    }
  }, [routeState, conversationsList, messagesMap]);

  const handleSelectConversation = (c: typeof DEFAULT_CONVERSATIONS[0]) => {
    setActiveId(c.id);
    setAttachedImage(null);
    
    // Clear unread count on select
    if (c.unread > 0) {
      const updated = conversationsList.map((conv) => (conv.id === c.id ? { ...conv, unread: 0 } : conv));
      setConversationsList(updated);
      localStorage.setItem("aqkianda-conversations", JSON.stringify(updated));
    }
    
    setMobileActiveView("chat");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        alert("A imagem deve ter no máximo 8MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !attachedImage) || !active) return;

    const currentTime = new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    const newMsg: Msg = { 
      from: "me", 
      text: text.trim() || undefined, 
      image: attachedImage || undefined,
      time: currentTime 
    };

    const updatedMsgs = [...msgs, newMsg];
    const newMessagesMap = { ...messagesMap, [active.id]: updatedMsgs };
    
    setMessagesMap(newMessagesMap);
    localStorage.setItem("aqkianda-messages", JSON.stringify(newMessagesMap));

    const lastPreview = attachedImage ? "📷 [Imagem enviada]" : text.trim();

    // Update conversation last text and time
    const updatedList = conversationsList.map((c) => {
      if (c.id === active.id) {
        return {
          ...c,
          last: lastPreview,
          time: currentTime,
          unread: 0,
        };
      }
      return c;
    });

    // Bring active conversation to top
    const activeIndex = updatedList.findIndex((c) => c.id === active.id);
    if (activeIndex > -1) {
      const [activeConv] = updatedList.splice(activeIndex, 1);
      updatedList.unshift(activeConv);
    }

    setConversationsList(updatedList);
    localStorage.setItem("aqkianda-conversations", JSON.stringify(updatedList));
    setText("");
    setAttachedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredConversations = conversationsList.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.product.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <section className="container py-4 md:py-6 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 border border-border/40 bg-card shadow-sm flex items-center justify-center shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display font-bold text-2xl md:text-3xl">Mensagens</h1>
        </div>
        <div className="flex-1 grid md:grid-cols-[320px_1fr] bg-card rounded-3xl border border-border/40 shadow-card overflow-hidden min-h-[500px] md:min-h-[600px] h-[calc(100vh-220px)] md:h-[650px]">
          
          {/* Conversas Sidebar (List) */}
          <aside
            className={`border-r border-border/40 flex flex-col h-full ${
              mobileActiveView === "list" ? "flex w-full" : "hidden md:flex"
            }`}
          >
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
              {filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada</div>
              ) : (
                filteredConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectConversation(c)}
                    className={`w-full flex items-center gap-3 p-4 text-left border-b border-border/40 hover:bg-muted/50 transition-smooth ${
                      active && active.id === c.id ? "bg-muted" : ""
                    }`}
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

          {/* Janela de Chat Ativo */}
          {active ? (
            <div
              className={`flex flex-col h-full flex-1 ${
                mobileActiveView === "chat" ? "flex w-full" : "hidden md:flex"
              }`}
            >
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
                  <div className="text-[10px] text-accent flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> Online ·{" "}
                    <span className="text-muted-foreground truncate block max-w-[150px] sm:max-w-xs">{active.product}</span>
                  </div>
                </div>
              </header>

              {/* Balões de Mensagem */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-muted/20">
                {msgs.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] p-3 sm:p-4 rounded-2xl ${
                        m.from === "me"
                          ? "bg-primary text-primary-foreground rounded-br-sm shadow-sm"
                          : "bg-card text-foreground rounded-bl-sm shadow-sm border border-border/20"
                      }`}
                    >
                      {/* Image render if attached */}
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

                      {m.text && (
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                      )}
                      <span className="text-[9px] opacity-70 mt-1 block text-right">{m.time}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Attached Image Preview Bar */}
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

              {/* Input Form */}
              <form onSubmit={send} className="flex items-center gap-2 p-3 sm:p-4 border-t border-border/40 bg-card">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

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
                  disabled={!text.trim() && !attachedImage}
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

      {/* Modal Lightbox para Zoom na Imagem */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
            <img 
              src={zoomedImage} 
              alt="Imagem ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
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
