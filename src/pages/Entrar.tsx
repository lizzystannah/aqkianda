import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Clock, X, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const Entrar = () => {
  const { login, openGoogleModal } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => {
    if (redirectTarget && redirectTarget !== "/" && redirectTarget !== "/entrar" && redirectTarget !== "/registar") {
      nav(redirectTarget);
    } else if (window.history.length > 1) {
      nav(-1);
    } else {
      nav("/");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    await login(email, password, redirectTarget);
    setIsLoading(false);
  };

  const handleGoogleLogin = () => {
    openGoogleModal(redirectTarget);
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
            {/* Google Sign In Button */}
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={handleGoogleLogin}
              className="w-full h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-sm transition-all flex items-center justify-center gap-3 shadow-sm active:scale-[0.98]"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 0, 0)">
                  <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                  <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                  <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                  <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
                </g>
              </svg>
              <span>Entrar com o Google</span>
            </Button>

            <div className="relative flex py-2 items-center text-xs text-gray-400 dark:text-gray-500 uppercase">
              <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
              <span className="flex-shrink mx-4">Ou entra com email</span>
              <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
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
                <div className="flex justify-between items-center">
                  <Label htmlFor="pass" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Palavra-passe</Label>
                  <a href="#" className="text-[11px] font-semibold text-[#DC2626] hover:underline">Esqueceu a palavra-passe?</a>
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
    </div>
  );
};

export default Entrar;
