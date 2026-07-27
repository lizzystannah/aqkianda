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

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-left flex items-start gap-2.5">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                <strong>Criação rápida em 1 clique com o Google:</strong> podes aceder imediatamente e tens até 7 dias para verificar o teu e-mail e completar o teu perfil.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                type="button"
                onClick={() => loginWithGoogle(location.pathname)}
                className="w-full h-12 rounded-2xl bg-white dark:bg-gray-900 border border-primary/30 text-gray-900 dark:text-white font-bold text-sm shadow-sm hover:border-primary transition-all flex items-center justify-center gap-3"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                  <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                  <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                  <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
                </svg>
                Continuar com o Google
              </Button>

              <div className="grid grid-cols-2 gap-2.5">
                <Link to={`/entrar?redirect=${encodeURIComponent(location.pathname)}`}>
                  <Button variant="outline" className="w-full h-11 rounded-2xl font-bold text-xs">
                    Entrar
                  </Button>
                </Link>
                <Link to={`/registar?redirect=${encodeURIComponent(location.pathname)}`}>
                  <Button className="w-full h-11 rounded-2xl bg-primary text-white font-bold text-xs">
                    Criar Conta <ArrowRight className="h-3.5 w-3.5 ml-1" />
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
