import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import ListingCard from "@/components/ListingCard";

interface FeaturedSectionProps {
  listings: any[];
}

const FeaturedSection = ({ listings }: FeaturedSectionProps) => {
  return (
    <section className="container py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-primary">★ Destaques</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mt-1">Anúncios em destaque</h2>
        </div>
        <Link to="/explorar" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all">
          Ver todos <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
        {listings.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
      </div>
    </section>
  );
};

export default FeaturedSection;
