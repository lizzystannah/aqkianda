import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Listing, formatPrice } from "@/data/listings";

interface SlideShowSectionProps {
  listings: Listing[];
}

const SlideShowSection = ({ listings }: SlideShowSectionProps) => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  const { scrollY } = useScroll();

  /* Title bar shrinks as user scrolls down */
  const titlePaddingY = useTransform(scrollY, [0, 200], [32, 12]);
  const titleFontSize = useTransform(scrollY, [0, 200], [1, 0.6]);
  const titleOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % listings.length);
  }, [listings.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + listings.length) % listings.length);
  }, [listings.length]);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  if (listings.length === 0) return null;

  const slide = listings[current];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <section className="py-10">
      {/* Full-width orange title bar with shrink effect */}
      <motion.div
        style={{
          paddingTop: titlePaddingY,
          paddingBottom: titlePaddingY,
          opacity: titleOpacity,
        }}
        className="w-full gradient-hero mb-12 shadow-glow sticky top-16 z-30"
      >
        <div className="container text-center">
          <motion.h1
            style={{ scale: titleFontSize }}
            className="font-display font-bold text-3xl md:text-5xl lg:text-6xl tracking-tight leading-tight text-primary-foreground origin-center"
          >
            Compra e vende{" "}
            <span className="bg-white/20 px-3 py-1 rounded-2xl backdrop-blur-sm">
              tudo
            </span>{" "}
            num só lugar
          </motion.h1>
        </div>
      </motion.div>

      {/* Slideshow content */}
      <div className="container">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              ✦ Em destaque
            </span>
            <h2 className="font-display font-bold text-2xl md:text-3xl mt-1">
              Destaques da semana
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={prev}
              className="h-10 w-10 rounded-full bg-card border border-border/40 flex items-center justify-center hover:border-primary/40 hover:shadow-card transition-smooth"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              className="h-10 w-10 rounded-full bg-card border border-border/40 flex items-center justify-center hover:border-primary/40 hover:shadow-card transition-smooth"
              aria-label="Próximo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Slideshow with wave effect */}
        <div className="relative">
          <div
            className="relative rounded-3xl overflow-hidden bg-muted shadow-elevated border border-border/40"
            style={{ aspectRatio: "21/9" }}
          >
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={slide.id}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0"
              >
                <Link to={`/anuncio/${slide.id}`} className="block w-full h-full group">
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-spring"
                  />
                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  {/* Content overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-gold text-secondary text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                        Destaque
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          slide.condition === "novo"
                            ? "bg-accent text-accent-foreground"
                            : "bg-white/20 text-white backdrop-blur-sm"
                        }`}
                      >
                        {slide.condition}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-2xl md:text-4xl text-white leading-tight max-w-xl">
                      {slide.title}
                    </h3>
                    <div className="flex items-center gap-4 mt-3">
                      <span
                        className="font-display font-bold text-xl md:text-2xl"
                        style={{ color: "hsl(28, 95%, 62%)" }}
                      >
                        {formatPrice(slide.price, slide.currency)}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-white/70">
                        <MapPin className="h-3.5 w-3.5" /> {slide.location}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            </AnimatePresence>

            {/* Mobile arrows */}
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="sm:hidden absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white z-10"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="sm:hidden absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white z-10"
              aria-label="Próximo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Smoky floating wave at the bottom of the slideshow */}
          <div className="absolute -bottom-8 left-0 right-0 h-16 overflow-hidden pointer-events-none z-10">
            <svg
              viewBox="0 0 1440 120"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(18, 92%, 54%)" stopOpacity="0" />
                  <stop offset="20%" stopColor="hsl(18, 92%, 54%)" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="hsl(28, 95%, 62%)" stopOpacity="0.6" />
                  <stop offset="80%" stopColor="hsl(42, 92%, 56%)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="hsl(42, 92%, 56%)" stopOpacity="0" />
                </linearGradient>
                <filter id="smokeBlur">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
                </filter>
              </defs>
              <path
                d="M0,80 C120,40 240,100 360,60 C480,20 600,90 720,50 C840,10 960,80 1080,40 C1200,0 1320,70 1440,30"
                fill="none"
                stroke="url(#waveGradient)"
                strokeWidth="3"
                filter="url(#smokeBlur)"
                className="animate-wave-float"
              />
              <path
                d="M0,60 C160,90 320,30 480,70 C640,110 800,40 960,80 C1120,120 1280,50 1440,90"
                fill="none"
                stroke="url(#waveGradient)"
                strokeWidth="2"
                filter="url(#smokeBlur)"
                opacity="0.5"
                className="animate-wave-float-reverse"
              />
            </svg>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-12">
          {listings.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > current ? 1 : -1);
                setCurrent(i);
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-8 gradient-hero"
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
              aria-label={`Ir para slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default SlideShowSection;
