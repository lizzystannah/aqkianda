import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, UserCheck, ShieldCheck } from "lucide-react";

interface SavedGoogleAccount {
  name: string;
  email: string;
  avatar: string;
}

export const GoogleAuthModal: React.FC = () => {
  const { isGoogleModalOpen, closeGoogleModal, loginWithGoogle, authModalRedirect } = useAuth();
  
  const [savedAccounts, setSavedAccounts] = useState<SavedGoogleAccount[]>([]);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isGoogleModalOpen) {
      setErrorMsg("");
      try {
        const stored = localStorage.getItem("aqkianda-google-accounts");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSavedAccounts(parsed);
            setIsNewAccount(false);
            return;
          }
        }
      } catch (e) {
        console.error(e);
      }
      setIsNewAccount(true);
    }
  }, [isGoogleModalOpen]);

  const handleSelectAccount = async (account: SavedGoogleAccount) => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      await loginWithGoogle(authModalRedirect || undefined, {
        name: account.name,
        email: account.email,
        avatar: account.avatar
      });
      closeGoogleModal();
    } catch (err) {
      setErrorMsg("Ocorreu um erro ao aceder com esta conta Google.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = customName.trim();
    const trimmedEmail = customEmail.trim().toLowerCase();

    if (!trimmedName) {
      setErrorMsg("Por favor insira o seu nome.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMsg("Por favor insira um endereço de e-mail válido.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    const avatar = trimmedName
      .split(" ")
      .map(n => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || trimmedEmail.slice(0, 2).toUpperCase();

    // Save to device's recent Google accounts list
    try {
      const stored = localStorage.getItem("aqkianda-google-accounts");
      const list: SavedGoogleAccount[] = stored ? JSON.parse(stored) : [];
      if (!list.some(a => a.email.toLowerCase() === trimmedEmail)) {
        list.push({ name: trimmedName, email: trimmedEmail, avatar });
        localStorage.setItem("aqkianda-google-accounts", JSON.stringify(list));
      }
    } catch (e) {
      console.error(e);
    }

    try {
      await loginWithGoogle(authModalRedirect || undefined, {
        name: trimmedName,
        email: trimmedEmail,
        avatar
      });
      closeGoogleModal();
      setCustomName("");
      setCustomEmail("");
    } catch (err) {
      setErrorMsg("Falha ao autenticar a conta Google.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isGoogleModalOpen} onOpenChange={(open) => !open && !isLoading && closeGoogleModal()}>
      <DialogContent className="w-[94vw] max-w-md rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-card border border-border/70 shadow-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-center space-y-2 sm:space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-white dark:bg-gray-900 border border-border shadow-sm flex items-center justify-center">
            <svg className="h-6 w-6" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
              </g>
            </svg>
          </div>
          <DialogTitle className="font-display font-bold text-xl tracking-tight text-foreground">
            Iniciar sessão com o Google
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolhe ou insere a tua própria conta Google para aceder em exclusivo à Aqkianda
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* Existing Accounts List */}
        {!isNewAccount && savedAccounts.length > 0 && (
          <div className="space-y-3 my-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Contas neste dispositivo
            </p>
            <div className="space-y-2">
              {savedAccounts.map((acc, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSelectAccount(acc)}
                  className="w-full p-3 rounded-xl border border-border/80 hover:border-primary/50 bg-background hover:bg-muted/40 transition-all flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border border-primary/20">
                      {acc.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                        {acc.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{acc.email}</p>
                    </div>
                  </div>
                  <UserCheck className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => setIsNewAccount(true)}
              className="w-full h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border-dashed border-border"
            >
              <Plus className="h-4 w-4" /> Usar outra conta Google
            </Button>
          </div>
        )}

        {/* New / Custom Account Form */}
        {(isNewAccount || savedAccounts.length === 0) && (
          <form onSubmit={handleCustomSubmit} className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label htmlFor="google-name" className="text-xs font-semibold text-foreground">
                O teu Nome Completo
              </Label>
              <Input
                id="google-name"
                required
                disabled={isLoading}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Carlos António"
                className="h-11 rounded-xl border-border bg-background text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="google-email" className="text-xs font-semibold text-foreground">
                O teu E-mail Google
              </Label>
              <Input
                id="google-email"
                type="email"
                required
                disabled={isLoading}
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="exemplo@gmail.com"
                className="h-11 rounded-xl border-border bg-background text-sm"
              />
            </div>

            <div className="pt-1 space-y-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Conectando à tua conta...
                  </>
                ) : (
                  <>
                    <span>Continuar com esta conta</span>
                  </>
                )}
              </Button>

              {savedAccounts.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isLoading}
                  onClick={() => setIsNewAccount(false)}
                  className="w-full h-10 rounded-xl text-xs text-muted-foreground"
                >
                  Voltar às contas salvas
                </Button>
              )}
            </div>
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Acesso seguro com perfil e anúncios 100% exclusivos</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GoogleAuthModal;
