import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="mt-12 sm:mt-20 border-t border-border/60 bg-secondary text-secondary-foreground">
    <div className="container py-8 sm:py-12 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Aqkianda Brand info & 3 Column Links Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-10 items-start">
        {/* Brand column */}
        <div className="md:col-span-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl gradient-hero flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-sm">A</span>
            </div>
            <span className="font-display font-bold text-lg">Aqkianda</span>
          </div>
          <p className="text-xs text-secondary-foreground/70 leading-relaxed max-w-sm">
            O marketplace que conecta compradores e vendedores em toda a Angola — novo ou usado, encontras tudo aqui.
          </p>
        </div>

        {/* 3 Columns side-by-side on all screens */}
        <div className="md:col-span-3 grid grid-cols-3 gap-2 sm:gap-6">
          <div>
            <h4 className="font-display font-bold mb-2 text-xs sm:text-sm text-foreground">Mercado</h4>
            <ul className="space-y-1.5 text-[11px] sm:text-xs text-secondary-foreground/70">
              <li><Link to="/explorar" className="hover:text-primary transition-colors">Explorar</Link></li>
              <li><Link to="/blog" className="hover:text-primary transition-colors font-medium text-primary">Blog & Guias</Link></li>
              <li><Link to="/publicar" className="hover:text-primary transition-colors">Publicar</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold mb-2 text-xs sm:text-sm text-foreground">Conta</h4>
            <ul className="space-y-1.5 text-[11px] sm:text-xs text-secondary-foreground/70">
              <li><Link to="/entrar" className="hover:text-primary transition-colors">Entrar</Link></li>
              <li><Link to="/perfil" className="hover:text-primary transition-colors">Perfil</Link></li>
              <li><Link to="/mensagens" className="hover:text-primary transition-colors">Mensagens</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold mb-2 text-xs sm:text-sm text-foreground">Sobre</h4>
            <ul className="space-y-1.5 text-[11px] sm:text-xs text-secondary-foreground/70">
              <li className="cursor-pointer hover:text-primary transition-colors">Funcionamento</li>
              <li><Link to="/termos" className="hover:text-primary transition-colors">Segurança</Link></li>
              <li><Link to="/termos" className="hover:text-primary transition-colors">Termos</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-secondary-foreground/10 pt-4 text-center text-[11px] sm:text-xs text-secondary-foreground/50">
        © {new Date().getFullYear()} Aqkianda. Feito com <span className="text-primary">♥</span> em Angola.
      </div>
    </div>
  </footer>
);

export default Footer;
