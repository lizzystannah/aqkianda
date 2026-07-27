import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Clock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const Entrar = () => {
  const { login, loginWithGoogle } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    await login(email, password, redirectTarget);
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    await loginWithGoogle(redirectTarget);
    setIsGoogleLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-red-950 via-gray-950 to-black relative overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#DC2626]/20 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-red-900/10 blur-3xl" />
        <div className="relative m-auto p-12 text-white max-w-lg">
          <Link to="/" className="flex items-center gap-2 mb-12 group">
            <span className="font-display font-black text-3xl tracking-tighter text-white select-none leading-none">
              <span>A</span>
              <span className="text-rose-500">qk</span>
              <span>ianda</span>
            </span>
          </Link>
          <h2 className="font-display font-bold text-4xl leading-tight">
            Bem-vindo de volta ao maior <span className="text-[#DC2626]">marketplace</span> angolano.
          </h2>
          <p className="mt-4 text-gray-400 leading-relaxed">
            Compra, vende e negoceia de forma segura com milhares de utilizadores de todas as 18 províncias de Angola.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:text-left">
            <Link to="/" className="lg:hidden flex items-center justify-center gap-2 mb-8 group">
              <span className="font-display font-black text-2xl tracking-tighter text-gray-900 dark:text-white select-none leading-none">
                <span>A</span>
                <span className="text-rose-600">qk</span>
                <span>ianda</span>
              </span>
            </Link>
            <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white tracking-tight">Iniciar Sessão</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Acede à tua conta para publicar e conversar com os vendedores.</p>
          </div>

          <div className="space-y-4">
            {/* Google Sign In Button */}
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isGoogleLoading}
              onClick={handleGoogleLogin}
              className="w-full h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold text-sm transition-all flex items-center justify-center gap-3 shadow-sm active:scale-[0.98]"
            >
              {isGoogleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-red-600" />
              ) : (
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.49C21.68,11.75 21.56,11.41 21.35,11.1z" fill="#4285F4" />
                    <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.9,0.61 -2.07,0.98 -3.36,0.98c-2.34,0 -4.33,-1.58 -5.03,-3.72l-3.41,2.64C4.12,18.42 7.77,20.62 12,20.62z" fill="#34A853" />
                    <path d="M6.97,13.13c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7s0.1,-1.16 0.28,-1.7l-3.41,-2.64C3.07,8.08 2.76,9.51 2.76,11s0.31,2.92 0.8,4.27l3.41,-2.64z" fill="#FBBC05" />
                    <path d="M12,6.01c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,3.31 14.42,2.5 12,2.5c-4.23,0 -7.88,2.2 -9.44,4.77l3.41,2.64C6.67,7.59 8.66,6.01 12,6.01z" fill="#EA4335" />
                  </g>
                </svg>
              )}
              {isGoogleLoading ? "Conectando ao Google..." : "Entrar com o Google"}
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
                  disabled={isLoading || isGoogleLoading}
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
                  disabled={isLoading || isGoogleLoading}
                  placeholder="••••••••"
                  className="h-12 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 focus-visible:bg-white dark:focus-visible:bg-gray-950 focus-visible:ring-red-500/20"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading || isGoogleLoading}
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

          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            Ainda não tens conta?{" "}
            <Link to="/registar" className="text-[#DC2626] font-semibold hover:underline">
              Cria uma agora
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Entrar;
