import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, UserPlus, Loader2, Clock, X, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { normalizePhoneNumber } from "@/lib/phone";

const Registar = () => {
  const { register } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("Qual é a tua comida tradicional angolana favorita?");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const SECURITY_QUESTIONS = [
    "Qual é a tua comida tradicional angolana favorita?",
    "Qual é o nome da tua escola primária ou colégio de infância?",
    "Em que cidade ou município de Angola nasceste?",
    "Qual é o nome do teu primeiro animal de estimação?",
    "Qual é o apelido ou alcunha de infância?"
  ];

  const handleClose = () => {
    if (redirectTarget && redirectTarget !== "/" && redirectTarget !== "/entrar" && redirectTarget !== "/registar") {
      nav(redirectTarget);
    } else if (window.history.length > 1) {
      nav(-1);
    } else {
      nav("/");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setIsLoading(true);
    const normalizedPhone = normalizePhoneNumber(phone);
    const success = await register(
      name, 
      email, 
      normalizedPhone, 
      password, 
      redirectTarget, 
      securityQuestion, 
      securityAnswer
    );
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
            Junta-te ao maior <span className="text-[#DC2626]">marketplace</span> angolano.
          </h2>
          <p className="mt-4 text-gray-400 leading-relaxed">
            Cria a tua conta gratuita e começa a comprar, vender e negociar em minutos em toda Angola.
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
            <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white tracking-tight">Criar Conta</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Preenche os teus dados para começar hoje mesmo.</p>
          </div>

          <div className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Nome Completo</Label>
                <Input
                  id="nome"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  placeholder="Nome e Sobrenome"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Endereço de Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  placeholder="tu@exemplo.com"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tel" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Número de Telemóvel / WhatsApp</Label>
                <Input
                  id="tel"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhone(normalizePhoneNumber(phone))}
                  disabled={isLoading}
                  placeholder="+244 9XX XXX XXX ou 9XX XXX XXX"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pass" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Palavra-passe</Label>
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

              {/* Pergunta de Segurança para Recuperação Gratuita de Conta */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-q" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Pergunta de Segurança <span className="text-[10px] text-muted-foreground font-normal">(Para recuperar a senha sem SMS)</span>
                  </Label>
                </div>
                <select
                  id="sec-q"
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-11 px-3 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                >
                  {SECURITY_QUESTIONS.map((q, idx) => (
                    <option key={idx} value={q}>{q}</option>
                  ))}
                </select>

                <div className="space-y-1">
                  <Label htmlFor="sec-ans" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Resposta Secreta</Label>
                  <Input
                    id="sec-ans"
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    disabled={isLoading}
                    placeholder="Ex: Funge de carne seca / Lobito / Max"
                    className="h-11 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    Guarda bem esta resposta. Ela será usada se te esqueceres da palavra-passe.
                  </p>
                </div>
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
                    <UserPlus className="h-4 w-4" /> Criar conta <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-sm text-center text-gray-500 dark:text-gray-400">
              Já tens conta?{" "}
              <Link to={`/entrar${redirectTarget !== "/" ? `?redirect=${encodeURIComponent(redirectTarget)}` : ""}`} className="text-[#DC2626] font-semibold hover:underline">
                Entra aqui
              </Link>
            </p>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Continuar a navegar sem criar conta</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Registar;
