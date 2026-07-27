import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Heart, MessageCircle, User, Plus, Menu, X, LogOut, Settings, Package, Sun, Moon, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<{ name: string; email: string; phone?: string } | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const isHome = loc.pathname === "/";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      nav(`/explorar?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
    setIsProfileMenuOpen(false);
    setIsMobileMenuOpen(false);
    nav("/");
  };

  // Close menus on route change and load current user from localStorage
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsProfileMenuOpen(false);

    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [loc.pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="container mx-auto px-4 flex h-16 items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <span className="font-display font-black text-2xl sm:text-[29px] tracking-tighter select-none leading-none">
            <span className="text-foreground">A</span>
            <span className="text-rose-600">qk</span>
            <span className="text-foreground">ianda</span>
          </span>
        </Link>

        {/* Global Search (Hidden on home) */}
        {!isHome && (
          <form onSubmit={handleSearch} className="hidden lg:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="O que procuras hoje?"
                className="pl-10 h-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary/20 transition-all"
              />
            </div>
          </form>
        )}

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary transition-smooth" onClick={toggleTheme} aria-label="Alternar tema">
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Link to="/favoritos">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary transition-smooth">
              <Heart className="h-5 w-5" />
            </Button>
          </Link>
          <Link to="/mensagens">
            <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-primary/10 hover:text-primary transition-smooth">
              <MessageCircle className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary border-2 border-background" />
            </Button>
          </Link>

          {/* Profile Dropdown Trigger */}
          {user ? (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className={`rounded-full transition-smooth ${isProfileMenuOpen ? 'bg-primary/10 text-primary' : ''}`}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              >
                <User className="h-5 w-5" />
              </Button>

              <AnimatePresence>
                {isProfileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[-1]" onClick={() => setIsProfileMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 rounded-2xl bg-card border border-border/60 shadow-elevated p-2 z-50"
                    >
                      <div className="p-3 border-b border-border/40 mb-1">
                        <p className="text-sm font-semibold">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <div className="space-y-1">
                        <Link to="/perfil" className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted text-sm transition-smooth">
                          <User className="h-4 w-4" /> Meu Perfil
                        </Link>
                        <Link to="/perfil?tab=anuncios" className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted text-sm transition-smooth">
                          <Package className="h-4 w-4" /> Meus Anúncios
                        </Link>
                        {user.email === "elizangelomanuel@gmail.com" && (
                          <Link to="/admin" className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted text-sm text-[#DC2626] dark:text-red-400 font-bold transition-smooth">
                            <ShieldAlert className="h-4 w-4" /> Painel de Admin
                          </Link>
                        )}
                        <Link to="/perfil?tab=config" className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted text-sm transition-smooth">
                          <Settings className="h-4 w-4" /> Configurações
                        </Link>
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center gap-2 p-2 rounded-xl hover:bg-destructive/10 text-destructive text-sm transition-smooth"
                        >
                          <LogOut className="h-4 w-4" /> Sair
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Link to="/entrar">
                <Button variant="ghost" className="rounded-full text-xs sm:text-sm font-semibold text-foreground/80 hover:text-primary transition-smooth px-3">
                  Entrar
                </Button>
              </Link>
              <Link to="/registar">
                <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm font-semibold px-4 py-1.5 transition-smooth">
                  Registar
                </Button>
              </Link>
            </div>
          )}

          <Link to="/publicar" className="ml-2 shrink-0 hidden sm:block">
            <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-4 py-2 flex items-center gap-1.5 shadow-sm active:scale-95 text-xs sm:text-sm whitespace-nowrap">
              <Plus className="h-4 w-4" /> criar anúncio
            </Button>
          </Link>
        </nav>

        {/* Mobile Menu Trigger */}
        <button
          className="md:hidden ml-auto p-2 rounded-full hover:bg-muted transition-smooth"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
    </header>

    {/* Mobile Drawer (Menu Lateral) */}
    <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-[280px] border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 md:hidden"
              style={{ backgroundColor: isDark ? "#090d16" : "#ffffff" }}
            >
              <div className="flex flex-col h-full p-6">
                <div className="flex items-center justify-between mb-8">
                  <span className="font-display font-bold text-xl">Menu</span>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-full hover:bg-muted">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1 mb-8">
                  {user ? (
                    <>
                      <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full gradient-hero flex items-center justify-center font-bold text-primary-foreground">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{user.name}</p>
                            <p className="text-xs text-muted-foreground">Ver perfil</p>
                          </div>
                        </div>
                        <Link to="/publicar">
                          <Button className="w-full rounded-full gradient-hero text-primary-foreground font-semibold">
                            <Plus className="h-4 w-4 mr-1.5" /> Publicar Anúncio
                          </Button>
                        </Link>
                      </div>

                      <Link to="/" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <Search className="h-5 w-5" /> Explorar
                      </Link>
                      <Link to="/favoritos" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <Heart className="h-5 w-5" /> Favoritos
                      </Link>
                      <Link to="/termos" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <ShieldAlert className="h-5 w-5" /> Termos & Segurança
                      </Link>
                      <Link to="/mensagens" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <MessageCircle className="h-5 w-5" /> Mensagens
                      </Link>
                      <Link to="/perfil" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <User className="h-5 w-5" /> Meu Perfil
                      </Link>
                      {user.email === "elizangelomanuel@gmail.com" && (
                        <Link to="/admin" className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 font-bold transition-smooth">
                          <ShieldAlert className="h-5 w-5" /> Painel de Admin
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-muted/50 mb-4 text-center">
                        <p className="text-sm font-semibold mb-1">Cria uma conta grátis</p>
                        <p className="text-xs text-muted-foreground mb-4">Negocie em segurança com milhares de angolanos.</p>
                        <div className="flex flex-col gap-2">
                          <Link to="/entrar">
                            <Button className="w-full rounded-full bg-primary text-primary-foreground font-semibold">
                              Entrar
                            </Button>
                          </Link>
                          <Link to="/registar">
                            <Button variant="outline" className="w-full rounded-full font-semibold">
                              Criar conta
                            </Button>
                          </Link>
                        </div>
                      </div>

                      <Link to="/" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <Search className="h-5 w-5" /> Explorar
                      </Link>
                      <Link to="/favoritos" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <Heart className="h-5 w-5" /> Favoritos
                      </Link>
                      <Link to="/termos" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted font-medium transition-smooth">
                        <ShieldAlert className="h-5 w-5" /> Termos & Segurança
                      </Link>
                    </>
                  )}
                </div>

                {user && (
                  <div className="mt-auto border-t border-border/60 pt-6 space-y-4">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-destructive/10 text-destructive font-medium transition-smooth"
                    >
                      <LogOut className="h-5 w-5" /> Sair da conta
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
