import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Explorar from "./pages/Explorar.tsx";
import Anuncio from "./pages/Anuncio.tsx";
import Publicar from "./pages/Publicar.tsx";
import Mensagens from "./pages/Mensagens.tsx";
import Favoritos from "./pages/Favoritos.tsx";
import Perfil from "./pages/Perfil.tsx";
import Entrar from "./pages/Entrar.tsx";
import Registar from "./pages/Registar.tsx";
import TemplateGrid from "./pages/templates/TemplateGrid.tsx";
import TemplateMagazine from "./pages/templates/TemplateMagazine.tsx";
import TemplateBazaar from "./pages/templates/TemplateBazaar.tsx";
import TemplateModern from "./pages/templates/TemplateModern.tsx";
import TemplateMinimal from "./pages/templates/TemplateMinimal.tsx";
import TemplateAlibaba from "./pages/templates/TemplateAlibaba.tsx";
import TemplateAliExpress from "./pages/templates/TemplateAliExpress.tsx";
import TemplateAlibabaV2 from "./pages/templates/TemplateAlibabaV2.tsx";
import TemplateAlibabaV3 from "./pages/templates/TemplateAlibabaV3.tsx";
import TemplateAlibabaV4 from "./pages/templates/TemplateAlibabaV4.tsx";
import TemplateClean from "./pages/templates/TemplateClean.tsx";
import TemplatePremium from "./pages/templates/TemplatePremium.tsx";
import TemplateVibrant from "./pages/templates/TemplateVibrant.tsx";
import Vendedor from "./pages/Vendedor.tsx";
import Admin from "./pages/Admin.tsx";
import Termos from "./pages/Termos.tsx";
import { FavoritesProvider } from "./context/FavoritesContext";
import { ThemeProvider } from "./context/ThemeContext";
import { RatingsProvider } from "./context/RatingsContext";
import { AuthProvider } from "./context/AuthContext";
import AuthModal from "./components/AuthModal";
import ProtectedRoute from "./components/ProtectedRoute";
import ScrollToTop from "./components/ScrollToTop";
import TrafficTracker from "./components/TrafficTracker";
import MobileBottomNav from "./components/MobileBottomNav";
import GracePeriodBanner from "./components/GracePeriodBanner";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <FavoritesProvider>
            <RatingsProvider>
              <BrowserRouter>
                <Toaster />
                <Sonner />
                <AuthModal />
                <ScrollToTop />
                <TrafficTracker />
                <div className="pb-12 lg:pb-0 min-h-screen flex flex-col">
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/explorar" element={<Explorar />} />
                    <Route path="/anuncio/:id" element={<Anuncio />} />
                    <Route path="/anuncio/:id/:slug" element={<Anuncio />} />
                    <Route path="/publicar" element={<Publicar />} />
                    <Route path="/publicar/:id" element={<Publicar />} />
                    <Route path="/mensagens" element={<Mensagens />} />
                    <Route path="/favoritos" element={<Favoritos />} />
                    <Route path="/perfil" element={<Perfil />} />
                    <Route path="/perfil/:name" element={<Perfil />} />
                    <Route path="/entrar" element={<Entrar />} />
                    <Route path="/registar" element={<Registar />} />
                    <Route path="/template/grid" element={<TemplateGrid />} />
                    <Route path="/template/magazine" element={<TemplateMagazine />} />
                    <Route path="/template/bazaar" element={<TemplateBazaar />} />
                    <Route path="/template/modern" element={<TemplateModern />} />
                    <Route path="/template/minimal" element={<TemplateMinimal />} />
                    <Route path="/template/alibaba" element={<TemplateAlibaba />} />
                    <Route path="/template/alibaba-v2" element={<TemplateAlibabaV2 />} />
                    <Route path="/template/alibaba-v3" element={<TemplateAlibabaV3 />} />
                    <Route path="/template/alibaba-v4" element={<TemplateAlibabaV4 />} />
                    <Route path="/template/aliexpress" element={<TemplateAliExpress />} />
                    <Route path="/template/clean" element={<TemplateClean />} />
                    <Route path="/template/premium" element={<TemplatePremium />} />
                    <Route path="/template/vibrant" element={<TemplateVibrant />} />
                    <Route path="/vendedor/:name" element={<Vendedor />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/termos" element={<Termos />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
                <MobileBottomNav />
              </BrowserRouter>
            </RatingsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
