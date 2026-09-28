import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, ShieldCheck, Clock } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, openAuthModal, loginWithGoogle } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      openAuthModal(location.pathname);
    }
  }, [isAuthenticated, location.pathname, openAuthModal]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4 py-12">
          <div className="max-w-md w-full bg-card border border-border/60 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-500 flex items-center justify-center">
              <Lock className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h2 className="font-display font-bold text-2xl tracking-tight text-foreground">
                Acesso Restrito
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Esta página requer início de sessão. Apenas utilizadores autenticados podem enviar mensagens e publicar anúncios na Aqkianda.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2.5">
                <Link to={`/entrar?redirect=${encodeURIComponent(location.pathname)}`}>
                  <Button variant="outline" className="w-full h-12 rounded-2xl font-bold text-xs sm:text-sm">
                    Fazer Login
                  </Button>
                </Link>
                <Link to={`/registar?redirect=${encodeURIComponent(location.pathname)}`}>
                  <Button className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs sm:text-sm shadow-sm">
                    Criar Conta <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
