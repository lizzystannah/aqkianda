import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="mt-24 border-t border-border/60 bg-secondary text-secondary-foreground">
    <div className="container py-14 grid grid-cols-3 md:grid-cols-4 gap-6 md:gap-10">
      <div className="col-span-3 md:col-span-1 mb-6 md:mb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-xl gradient-hero flex items-center justify-center">
            <span className="font-display font-bold text-primary-foreground">A</span>
          </div>
          <span className="font-display font-bold text-xl">Aqkianda</span>
        </div>
        <p className="text-xs sm:text-sm text-secondary-foreground/70 max-w-xs leading-relaxed">
          O marketplace que conecta compradores e vendedores em toda a Angola — novo ou usado, encontras tudo aqui.
        </p>
      </div>
      <div>
        <h4 className="font-display font-semibold mb-2 md:mb-3 text-xs sm:text-sm">Mercado</h4>
        <ul className="space-y-2 text-xs sm:text-sm text-secondary-foreground/70">
          <li><Link to="/explorar" className="hover:text-primary">Explorar</Link></li>
          <li><Link to="/explorar" className="hover:text-primary">Categorias</Link></li>
          <li><Link to="/publicar" className="hover:text-primary">Publicar</Link></li>
        </ul>
      </div>
      <div>
        <h4 className="font-display font-semibold mb-2 md:mb-3 text-xs sm:text-sm">Conta</h4>
        <ul className="space-y-2 text-xs sm:text-sm text-secondary-foreground/70">
          <li><Link to="/entrar" className="hover:text-primary">Entrar</Link></li>
          <li><Link to="/perfil" className="hover:text-primary">Perfil</Link></li>
          <li><Link to="/mensagens" className="hover:text-primary">Mensagens</Link></li>
        </ul>
      </div>
      <div>
        <h4 className="font-display font-semibold mb-2 md:mb-3 text-xs sm:text-sm">Sobre</h4>
        <ul className="space-y-2 text-xs sm:text-sm text-secondary-foreground/70">
          <li className="cursor-pointer hover:text-primary">Funcionamento</li>
          <li><Link to="/termos" className="hover:text-primary">Segurança</Link></li>
          <li><Link to="/termos" className="hover:text-primary">Termos</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-secondary-foreground/10 py-5 text-center text-xs text-secondary-foreground/50">
      © {new Date().getFullYear()} Aqkianda. Feito com <span className="text-primary">♥</span> em Angola.
    </div>
  </footer>
);

export default Footer;
