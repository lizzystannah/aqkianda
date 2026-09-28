import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MessageSquare, PlusCircle, ArrowRight, Loader2, Sparkles, Clock } from "lucide-react";

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, openGoogleModal, authModalRedirect } = useAuth();
  const navigate = useNavigate();

  const handleGoogleClick = () => {
    openGoogleModal(authModalRedirect || undefined);
  };

  const handleGoToLogin = () => {
    closeAuthModal();
    if (authModalRedirect) {
      navigate(`/entrar?redirect=${encodeURIComponent(authModalRedirect)}`);
    } else {
      navigate("/entrar");
    }
  };

  const handleGoToRegister = () => {
    closeAuthModal();
    if (authModalRedirect) {
      navigate(`/registar?redirect=${encodeURIComponent(authModalRedirect)}`);
    } else {
      navigate("/registar");
    }
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      <DialogContent className="w-[92vw] max-w-md rounded-2xl sm:rounded-3xl p-5 sm:p-8 bg-card border border-border/60 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center space-y-2 sm:space-y-3">
          <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-500 flex items-center justify-center mb-1">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <DialogTitle className="font-display font-bold text-xl sm:text-2xl tracking-tight text-foreground">
            Inicia sessão para continuar
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Para conversares com vendedores, enviar mensagens e publicar anúncios em Angola, precisas de estar autenticado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 my-2">
          {/* Fast Google Login Option */}
          <Button
            type="button"
            onClick={handleGoogleClick}
            className="w-full h-12 sm:h-13 rounded-xl sm:rounded-2xl bg-white dark:bg-gray-900 border-2 border-primary/30 hover:border-primary text-gray-900 dark:text-white font-bold text-xs sm:text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2.5 relative group overflow-hidden active:scale-[0.98]"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
              </g>
            </svg>
            <span>Continuar com o Google</span>
          </Button>

          {/* 7-Day Grace Period Informational Badge */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-center flex items-center justify-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              Acesso instantâneo! Tens até <strong>7 dias</strong> para verificar o teu e-mail e concluir o perfil.
            </p>
          </div>

          <div className="relative flex py-1 items-center text-xs text-muted-foreground uppercase">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-3 text-[10px] font-semibold tracking-wider">ou continua com conta</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              onClick={handleGoToLogin}
              className="h-11 rounded-xl font-semibold text-xs border-border hover:bg-accent"
            >
              Fazer Login
            </Button>
            <Button
              onClick={handleGoToRegister}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90"
            >
              Criar Conta <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={closeAuthModal}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline"
            >
              Continuar como visitante (fechar)
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
