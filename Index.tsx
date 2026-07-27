import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSection from "@/components/home/HeroSection";
import CategorySection from "@/components/home/CategorySection";
import FeaturedSection from "@/components/home/FeaturedSection";
import RecentSection from "@/components/home/RecentSection";
import CTASection from "@/components/home/CTASection";
import { listings } from "@/data/listings";

const Index = () => {
  const featured = listings.filter(l => l.featured);
  const recent = listings.slice(0, 8);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <HeroSection />
      <CategorySection />
      <FeaturedSection listings={featured} />
      <RecentSection listings={recent} />
      <CTASection />

      <Footer />
    </div>
  );
};

export default Index;
