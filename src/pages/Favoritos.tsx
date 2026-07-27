import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ListingCard from "@/components/ListingCard";
import { listings } from "@/data/listings";
import { useFavorites } from "@/context/FavoritesContext";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const Favoritos = () => {
  const { favorites } = useFavorites();
  const favoriteListings = listings.filter(l => favorites.includes(l.id));

  useDocumentMetadata({
    title: "Os Meus Favoritos",
    description: "Vê e gere todos os teus anúncios e artigos guardados na Aqkianda de forma rápida.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="container py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl gradient-hero flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary-foreground fill-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-3xl md:text-4xl">Favoritos</h1>
            <p className="text-muted-foreground">{favoriteListings.length} anúncios guardados</p>
          </div>
        </div>

        {favoriteListings.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {favoriteListings.map((l, i) => (
              <ListingCard key={l.id} listing={l} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border mt-10">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="font-display font-semibold text-xl mb-2">Ainda não tens favoritos</h2>
            <p className="text-muted-foreground mb-6">Guarda os anúncios que mais gostas para os veres mais tarde.</p>
            <Link to="/explorar" className="inline-flex items-center justify-center px-6 py-3 rounded-full gradient-hero text-primary-foreground font-semibold shadow-glow">
              Explorar anúncios
            </Link>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
};

export default Favoritos;
