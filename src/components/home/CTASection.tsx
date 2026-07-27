import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const CTASection = () => {
  return (
    <section className="container py-16">
      <div className="relative overflow-hidden rounded-3xl gradient-dark p-10 md:p-16 text-secondary-foreground">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full gradient-hero opacity-30 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-60 w-60 rounded-full gradient-mint opacity-20 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-widest text-primary-glow">Para vendedores</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl mt-3 leading-tight">
            Tens algo para vender?<br />Põe à venda em <span className="text-primary">2 minutos</span>.
          </h2>
          <p className="mt-5 text-secondary-foreground/70 text-lg">
            Publicação gratuita, sem comissões escondidas. Recebe mensagens directamente dos compradores.
          </p>
          <Button asChild size="lg" className="mt-8 h-14 rounded-full gradient-hero text-primary-foreground shadow-glow font-semibold text-base px-8">
            <Link to="/publicar">Publicar anúncio grátis <ArrowRight className="ml-1 h-5 w-5" /></Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
