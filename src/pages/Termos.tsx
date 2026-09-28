import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Shield, CheckCircle2, AlertTriangle, Info, ArrowLeft, Lock, Users, MessageCircle, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const Termos = () => {
  useDocumentMetadata({
    title: "Termos & Segurança",
    description: "Termos de serviço, privacidade e dicas de segurança para negociar com total confiança no Aqkianda.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12">
          <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline font-semibold mb-6 group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar à página inicial
          </Link>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-foreground mb-4">
            Termos & <span className="text-primary">Segurança</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Bem-vindo ao Aqkianda. A tua segurança é a nossa prioridade. Lê atentamente os nossos termos de uso e dicas para uma experiência segura.
          </p>
        </div>

        <div className="grid gap-12">
          {/* Dicas de Segurança Section */}
          <section id="seguranca" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="font-display font-bold text-2xl tracking-tight">Dicas de Segurança</h2>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-6">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-card border border-border/40 p-6 rounded-2xl shadow-sm hover:border-primary/20 transition-colors"
              >
                <div className="h-12 w-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Encontros Presenciais</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tenta sempre combinar o encontro num local público e movimentado, como um centro comercial ou uma praça. Nunca vás sozinho a locais isolados.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="bg-card border border-border/40 p-6 rounded-2xl shadow-sm hover:border-primary/20 transition-colors"
              >
                <div className="h-12 w-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Pagamento Seguro</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Recomendamos que o pagamento seja feito apenas no momento da entrega do artigo. Evita fazer transferências antecipadas sem ter o produto em mãos.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="bg-card border border-border/40 p-6 rounded-2xl shadow-sm hover:border-primary/20 transition-colors"
              >
                <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                  <Info className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Verifica o Artigo</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Antes de pagar, verifica o estado do artigo, se funciona corretamente e se corresponde à descrição e fotos publicadas no anúncio.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="bg-card border border-border/40 p-6 rounded-2xl shadow-sm hover:border-primary/20 transition-colors"
              >
                <div className="h-12 w-12 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center mb-4">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Usa o Chat Interno</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Utiliza sempre as mensagens internas do Aqkianda para comunicar. Evita partilhar dados sensíveis fora da nossa plataforma.
                </p>
              </motion.div>
            </div>
          </section>

          <hr className="border-border/40" />

          {/* Termos de Uso Section */}
          <section id="termos" className="scroll-mt-24 space-y-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="font-display font-bold text-2xl tracking-tight">Termos de Uso</h2>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
              <div className="bg-muted/30 p-6 rounded-2xl border border-border/40">
                <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" /> Aceitação dos Termos
                </h4>
                <p>
                  Ao utilizar o Aqkianda, concordas em cumprir com as regras da nossa comunidade. O Aqkianda é uma plataforma de classificados gratuita que facilita o contacto entre compradores e vendedores em Angola.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">1. Responsabilidade do Utilizador</h3>
                <p>
                  Os utilizadores são os únicos responsáveis pelos anúncios que publicam, pelas negociações que realizam e pela veracidade das informações fornecidas. O Aqkianda não intervém nas transações financeiras.
                </p>

                <h3 className="text-lg font-bold text-foreground">2. Conteúdo Proibido</h3>
                <p>
                  Não é permitida a publicação de artigos ilegais, armas, drogas, réplicas falsificadas ou qualquer conteúdo que viole as leis vigentes na República de Angola. Anúncios duplicados ou enganosos serão removidos.
                </p>

                <h3 className="text-lg font-bold text-foreground">3. Privacidade e Dados</h3>
                <p>
                  Respeitamos a tua privacidade. Os teus dados de contacto só são visíveis se decidires partilhá-los. Recomendamos o uso do nosso chat seguro para todas as interações iniciais.
                </p>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl flex gap-4 items-start">
                <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-1">Aviso Importante</h4>
                  <p className="text-amber-600 dark:text-amber-500/80 leading-relaxed">
                    O Aqkianda nunca te pedirá códigos de verificação bancária ou pagamentos antecipados para "ativar" a tua conta ou anúncios. Se receberes mensagens suspeitas, denuncia imediatamente o utilizador.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground mb-4 italic">
            Última atualização: 17 de Julho de 2026
          </p>
          <Link 
            to="/publicar" 
            className="inline-flex items-center justify-center bg-primary text-white font-bold px-8 py-4 rounded-2xl shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 transition-all"
          >
            Começar a vender agora
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Termos;
