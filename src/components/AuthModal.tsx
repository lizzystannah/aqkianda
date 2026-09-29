import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MessageSquare, PlusCircle, ArrowRight, Loader2, Sparkles, Clock } from "lucide-react";

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalRedirect } = useAuth();
  const navigate = useNavigate();

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
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              onClick={handleGoToLogin}
              className="h-12 rounded-xl font-bold text-xs sm:text-sm border-border hover:bg-accent"
            >
              Fazer Login
            </Button>
            <Button
              onClick={handleGoToRegister}
              className="h-12 rounded-xl bg-primary text-primary-foreground font-bold text-xs sm:text-sm hover:bg-primary/90 shadow-sm"
            >
              Criar Conta <ArrowRight className="h-4 w-4 ml-1" />
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
