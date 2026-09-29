import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Loader2, Clock, X, ArrowLeft, KeyRound, ShieldQuestion, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { normalizePhoneNumber, isPhoneNumberInput } from "@/lib/phone";

const Entrar = () => {
  const { login } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Password Recovery with Security Question States
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<"identifier" | "answer" | "success">("identifier");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleClose = () => {
    if (redirectTarget && redirectTarget !== "/" && redirectTarget !== "/entrar" && redirectTarget !== "/registar") {
      nav(redirectTarget);
    } else if (window.history.length > 1) {
      nav(-1);
    } else {
      nav("/");
    }
  };

  // Step 1: Query backend for the security question
  const handleFetchQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;

    const rawId = forgotIdentifier.trim();
    const cleanId = isPhoneNumberInput(rawId) ? normalizePhoneNumber(rawId) : rawId;

    setIsForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanId })
      });

      if (res.ok) {
        const data = await res.json();
        setSecurityQuestion(data.question);
        setForgotStep("answer");
      } else {
        const err = await res.json();
        toast({
          variant: "destructive",
          title: "Conta não encontrada",
          description: err.error || "Não encontramos nenhuma conta com este email ou telefone."
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro de comunicação",
        description: "Não foi possível verificar a conta no momento. Tenta novamente."
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  // Step 2: Submit answer and reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityAnswer.trim() || !newPassword) return;

    if (newPassword.length < 4) {
      toast({
        variant: "destructive",
        title: "Palavra-passe curta",
        description: "A nova palavra-passe deve ter pelo menos 4 caracteres."
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Palavras-passe não coincidem",
        description: "As palavras-passe introduzidas são diferentes."
      });
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          answer: securityAnswer.trim(),
          newPassword
        })
      });

      if (res.ok) {
        setForgotStep("success");
        toast({
          title: "Palavra-passe redefinida! 🎉",
          description: "Podes agora iniciar sessão com a tua nova palavra-passe."
        });
      } else {
        const err = await res.json();
        toast({
          variant: "destructive",
          title: "Resposta incorreta",
          description: err.error || "A resposta de segurança está incorreta. Tenta novamente."
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a palavra-passe. Tenta novamente."
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleFinishRecovery = () => {
    setIsForgotOpen(false);
    setEmail(forgotIdentifier);
    setPassword("");
    setForgotStep("identifier");
    setForgotIdentifier("");
    setSecurityAnswer("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    const rawInput = email.trim();
    const cleanInput = isPhoneNumberInput(rawInput) ? normalizePhoneNumber(rawInput) : rawInput;

    setIsLoading(true);
    const success = await login(cleanInput, password, redirectTarget);
    setIsLoading(false);
    if (success) {
      nav(redirectTarget || "/");
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative">
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-red-950 via-gray-950 to-black relative overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#DC2626]/20 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-red-900/10 blur-3xl" />
        <div className="relative m-auto p-12 text-white max-w-lg">
          <div className="flex items-center justify-between mb-10">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="font-display font-black text-3xl tracking-tighter text-white select-none leading-none">
                <span>A</span>
                <span className="text-rose-500">qk</span>
                <span>ianda</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar</span>
            </button>
          </div>
          <h2 className="font-display font-bold text-4xl leading-tight">
            Bem-vindo de volta ao maior <span className="text-[#DC2626]">marketplace</span> angolano.
          </h2>
          <p className="mt-4 text-gray-400 leading-relaxed">
            Compra, vende e negoceia de forma segura com milhares de utilizadores de todas as 18 províncias de Angola.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-gray-950 relative">
        {/* Floating close button on top right */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar e voltar"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 shadow-sm transition-all active:scale-95 group"
          >
            <span>Voltar ao site</span>
            <div className="h-5 w-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-950/40 text-gray-500 group-hover:text-red-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>

        <div className="w-full max-w-md space-y-6 pt-10 sm:pt-0">
          <div className="text-center lg:text-left">
            <div className="lg:hidden flex items-center justify-between mb-6">
              <Link to="/" className="flex items-center gap-2 group">
                <span className="font-display font-black text-2xl tracking-tighter text-gray-900 dark:text-white select-none leading-none">
                  <span>A</span>
                  <span className="text-rose-600">qk</span>
                  <span>ianda</span>
                </span>
              </Link>
            </div>
            <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white tracking-tight">Iniciar Sessão</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Acede à tua conta para publicar e conversar com os vendedores.</p>
          </div>

          <div className="space-y-4">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-gray-700 dark:text-gray-300">E-mail ou Número de Telemóvel</Label>
                <Input
                  id="email"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  placeholder="exemplo@email.ao ou 923 000 000"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="pass" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Palavra-passe</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotIdentifier(email);
                      setIsForgotOpen(true);
                      setForgotStep("identifier");
                    }}
                    className="text-[11px] font-semibold text-[#DC2626] hover:underline"
                  >
                    Esqueceu a palavra-passe?
                  </button>
                </div>
                <Input
                  id="pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#DC2626] to-red-600 hover:from-[#b91c1c] hover:to-red-700 text-white font-semibold shadow-md shadow-red-200/50 dark:shadow-none active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Entrar <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-sm text-center text-gray-500 dark:text-gray-400">
              Ainda não tens conta?{" "}
              <Link to={`/registar${redirectTarget !== "/" ? `?redirect=${encodeURIComponent(redirectTarget)}` : ""}`} className="text-[#DC2626] font-semibold hover:underline">
                Cria uma agora
              </Link>
            </p>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Continuar a navegar sem iniciar sessão</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* DIALOG DE RECUPERAÇÃO DE PALAVRA-PASSE POR PERGUNTA SECRETA */}
      {/* ========================================================== */}
      <Dialog open={isForgotOpen} onOpenChange={(open) => !open && setIsForgotOpen(false)}>
        <DialogContent className="w-[92vw] max-w-md rounded-2xl sm:rounded-3xl p-6 bg-card border border-border/60 shadow-2xl">
          <DialogHeader className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-500 flex items-center justify-center mb-1">
              <KeyRound className="h-6 w-6" />
            </div>
            <DialogTitle className="font-display font-bold text-xl tracking-tight text-foreground">
              Recuperar Palavra-passe
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {forgotStep === "identifier" && "Introduz o teu email ou telefone de registo para aceder à tua pergunta de segurança."}
              {forgotStep === "answer" && "Responde à tua pergunta de segurança para criar uma nova palavra-passe."}
              {forgotStep === "success" && "A tua palavra-passe foi atualizada com sucesso!"}
            </DialogDescription>
          </DialogHeader>

          {/* STEP 1: IDENTIFIER */}
          {forgotStep === "identifier" && (
            <form onSubmit={handleFetchQuestion} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-id" className="text-xs font-semibold text-foreground">Email ou Telefone</Label>
                <Input
                  id="forgot-id"
                  required
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  disabled={isForgotLoading}
                  placeholder="Ex: tu@exemplo.com ou 923 000 000"
                  className="h-11 rounded-xl text-xs bg-muted/30"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsForgotOpen(false)}
                  className="flex-1 h-11 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isForgotLoading || !forgotIdentifier.trim()}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  {isForgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
                </Button>
              </div>
            </form>
          )}

          {/* STEP 2: ANSWER SECURITY QUESTION & SET NEW PASSWORD */}
          {forgotStep === "answer" && (
            <form onSubmit={handleResetPassword} className="space-y-3.5 mt-2">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-primary font-semibold">
                  <ShieldQuestion className="h-4 w-4 shrink-0" />
                  <span>Pergunta de Segurança:</span>
                </div>
                <p className="text-foreground font-medium pl-5">{securityQuestion}</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="sec-answer" className="text-xs font-semibold text-foreground">A tua Resposta Secreta</Label>
                <Input
                  id="sec-answer"
                  required
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  disabled={isForgotLoading}
                  placeholder="Digita a tua resposta..."
                  className="h-10 text-xs rounded-xl bg-muted/30"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-pass" className="text-xs font-semibold text-foreground">Nova Palavra-passe</Label>
                <Input
                  id="new-pass"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isForgotLoading}
                  placeholder="Mínimo 4 caracteres"
                  className="h-10 text-xs rounded-xl bg-muted/30"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirm-pass" className="text-xs font-semibold text-foreground">Confirmar Nova Palavra-passe</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isForgotLoading}
                  placeholder="Repete a palavra-passe"
                  className="h-10 text-xs rounded-xl bg-muted/30"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotStep("identifier")}
                  className="flex-1 h-11 rounded-xl text-xs font-semibold"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={isForgotLoading || !securityAnswer.trim() || !newPassword}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  {isForgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir Palavra-passe"}
                </Button>
              </div>
            </form>
          )}

          {/* STEP 3: SUCCESS */}
          {forgotStep === "success" && (
            <div className="text-center space-y-4 mt-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="text-xs text-muted-foreground">
                A tua palavra-passe foi redefinida com sucesso. Podes agora entrar com as tuas novas credenciais.
              </p>
              <Button
                type="button"
                onClick={handleFinishRecovery}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
              >
                Voltar ao Login
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Entrar;
