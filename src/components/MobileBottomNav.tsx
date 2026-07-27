import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Search, PlusCircle, MessageSquare, Heart } from "lucide-react";

export const MobileBottomNav = () => {
  const location = useLocation();
  const path = location.pathname;

  const isActive = (targetPath: string) => {
    if (targetPath === "/") return path === "/";
    return path.startsWith(targetPath);
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/60 shadow-lg px-2 py-1 transition-all">
      <nav className="grid grid-cols-5 items-center justify-items-center max-w-sm mx-auto w-full">
        {/* Início */}
        <Link
          to="/"
          className={`flex flex-col items-center justify-center py-0.5 w-full rounded-lg transition-colors ${
            isActive("/") && !path.startsWith("/explorar")
              ? "text-primary font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="h-4 w-4" />
          <span className="text-[9px] mt-0.5 tracking-tight">Início</span>
        </Link>

        {/* Explorar */}
        <Link
          to="/explorar"
          className={`flex flex-col items-center justify-center py-0.5 w-full rounded-lg transition-colors ${
            isActive("/explorar")
              ? "text-primary font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-4 w-4" />
          <span className="text-[9px] mt-0.5 tracking-tight">Explorar</span>
        </Link>

        {/* Publicar (Center Highlight Button) */}
        <Link
          to="/publicar"
          className="flex flex-col items-center justify-center -mt-2.5 w-full relative z-10"
        >
          <div className="h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center shadow-md shadow-primary/30 active:scale-90 transition-transform border-2 border-background">
            <PlusCircle className="h-4.5 w-4.5" />
          </div>
          <span className={`text-[9px] mt-0.5 font-bold tracking-tight ${isActive("/publicar") ? "text-primary" : "text-muted-foreground"}`}>
            Vender
          </span>
        </Link>

        {/* Mensagens */}
        <Link
          to="/mensagens"
          className={`flex flex-col items-center justify-center py-0.5 w-full rounded-lg transition-colors ${
            isActive("/mensagens")
              ? "text-primary font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-[9px] mt-0.5 tracking-tight">Mensagens</span>
        </Link>

        {/* Favoritos */}
        <Link
          to="/favoritos"
          className={`flex flex-col items-center justify-center py-0.5 w-full rounded-lg transition-colors ${
            isActive("/favoritos")
              ? "text-primary font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="h-4 w-4" />
          <span className="text-[9px] mt-0.5 tracking-tight">Favoritos</span>
        </Link>
      </nav>
    </div>
  );
};

export default MobileBottomNav;
