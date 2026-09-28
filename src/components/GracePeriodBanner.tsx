import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, Clock, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const GracePeriodBanner: React.FC = () => {
  const { user, getDaysRemainingForProfile, verifyEmailAndCompleteProfile } = useAuth();
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");
  const [province, setProvince] = useState(user?.province || "Luanda");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only show if user exists, logged in via Google, and has not completed profile/email verification
  if (!user || user.authMethod !== "google" || user.emailVerified || isDismissed) {
    return null;
  }

  const daysRemaining = getDaysRemainingForProfile();
  const isExpired = daysRemaining === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      verifyEmailAndCompleteProfile(phone, province);
      setIsSubmitting(false);
      setIsOpenModal(false);
    }, 600);
  };

  return (
    <>
      <div className={`w-full text-xs py-2 px-4 flex items-center justify-between gap-3 shadow-inner ${
        isExpired 
          ? "bg-red-600 text-white font-medium" 
          : "bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200"
      }`}>
        <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1 truncate">
          {isExpired ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-white animate-bounce" />
          ) : (
            <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span className="truncate">
            {isExpired ? (
              <strong>Prazo de 7 dias expirado!</strong>
            ) : (
              <span>
                Conta criada via Google. Tens <strong>{daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}</strong> para verificar o teu e-mail e completar o teu perfil.
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => setIsOpenModal(true)}
            className={`h-7 text-[11px] font-bold rounded-full px-3 ${
              isExpired 
                ? "bg-white text-red-600 hover:bg-gray-100" 
                : "bg-amber-600 hover:bg-amber-700 text-white"
            }`}
          >
            Finalizar Perfil
          </Button>

          {!isExpired && (
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"
              title="Fechar aviso temporariamente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Complete Profile Dialog */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-2xl border border-border max-w-md w-full relative space-y-4">
            <button
              onClick={() => setIsOpenModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm p-1 rounded-full bg-muted"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-border/40 pb-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">Finalizar Registo da Conta</h3>
                <p className="text-xs text-muted-foreground">Verificação e detalhes para negociações seguras</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">E-mail verificado:</label>
                <div className="p-2.5 rounded-lg bg-muted text-xs font-mono text-muted-foreground flex items-center justify-between">
                  <span>{user.email}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmado
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Telemóvel / WhatsApp em Angola:</label>
                <Input
                  type="tel"
                  required
                  placeholder="+244 9XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-xs h-10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Província:</label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full h-10 px-3 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Luanda">Luanda</option>
                  <option value="Benguela">Benguela</option>
                  <option value="Huambo">Huambo</option>
                  <option value="Huíla">Huíla</option>
                  <option value="Cabinda">Cabinda</option>
                  <option value="Cuanza Sul">Cuanza Sul</option>
                  <option value="Outra">Outra Província</option>
                </select>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow mt-2"
              >
                {isSubmitting ? "A guardar..." : "Concluir Verificação do Perfil"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default GracePeriodBanner;
