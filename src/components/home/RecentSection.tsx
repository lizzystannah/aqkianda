import ListingCard from "@/components/ListingCard";
import { Listing } from "@/data/listings";

interface RecentSectionProps {
  listings: Listing[];
}

const RecentSection = ({ listings }: RecentSectionProps) => {
  return (
    <section className="container py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-accent">Acabou de chegar</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl mt-1">Anúncios recentes</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {listings.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
      </div>
    </section>
  );
};

export default RecentSection;
