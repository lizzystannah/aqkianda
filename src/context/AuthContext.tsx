import React, { createContext, useContext, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { recordPlatformSignup } from "@/utils/analytics";
import { normalizePhoneNumber, isPhoneNumberInput } from "@/lib/phone";

export const AUTH_TOKEN_KEY = "aqkianda-jwt-token";

export function getSafeRedirectUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  // Permitir apenas caminhos relativos internos seguros (ex: /publicar, /anuncio/123)
  // Bloquear redirecionamentos externos (//evil.com), esquemas perigosos (javascript:, data:, vbscript:) e backslashes
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.toLowerCase().includes("javascript:") &&
    !trimmed.toLowerCase().includes("data:") &&
    !trimmed.toLowerCase().includes("vbscript:")
  ) {
    return trimmed;
  }
  return null;
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface User {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role?: "user" | "seller" | "admin";
  avatar?: string;
  authMethod?: "email";
  emailVerified?: boolean;
  province?: string;
  securityQuestion?: string;
}

export interface RegisteredUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  province?: string;
  role?: string;
  registeredAt: string;
  avatar: string;
  authMethod: "email";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAuthModalOpen: boolean;
  authModalRedirect: string | null;
  openAuthModal: (redirectUrl?: string) => void;
  closeAuthModal: () => void;
  login: (email: string, pass: string, redirectUrl?: string) => Promise<boolean>;
  register: (
    name: string,
    email: string,
    phone: string,
    pass: string,
    redirectUrl?: string,
    securityQuestion?: string,
    securityAnswer?: string
  ) => Promise<boolean>;
  updateProfile: (data: { name?: string; phone?: string; province?: string; avatar?: string; securityQuestion?: string; securityAnswer?: string }) => void;
  logout: () => void;
  verifyEmailAndCompleteProfile: (phone: string, province: string) => void;
}

const SESSION_MAX_INACTIVITY_MS = 60 * 60 * 1000; // 1 hora de inatividade máxima
const LAST_ACTIVITY_KEY = "aqkianda-last-activity";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("user");
      if (!saved) return null;

      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const lastTime = parseInt(lastActivity, 10);
        // Se já passou mais de 1 hora sem atividade, invalida a sessão imediatamente
        if (isNaN(lastTime) || Date.now() - lastTime > SESSION_MAX_INACTIVITY_MS) {
          localStorage.removeItem("user");
          localStorage.removeItem(LAST_ACTIVITY_KEY);
          return null;
        }
      } else {
        // Se não tinha timestamp gravado, inicia com o horário atual
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }

      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalRedirect, setAuthModalRedirect] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
      // Garante que o timestamp de atividade é atualizado quando o utilizador está logado
      if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
    // Notify other contexts/components of auth change
    window.dispatchEvent(new Event("aqkianda-auth-change"));
  }, [user]);

  // Monitorização de inatividade (1 hora máx)
  useEffect(() => {
    if (!user) return;

    const checkInactivity = () => {
      const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivityStr) {
        const lastTime = parseInt(lastActivityStr, 10);
        if (!isNaN(lastTime) && Date.now() - lastTime > SESSION_MAX_INACTIVITY_MS) {
          // Sessão expirada por inatividade
          setUser(null);
          localStorage.removeItem("user");
          localStorage.removeItem(LAST_ACTIVITY_KEY);
          window.dispatchEvent(new Event("aqkianda-auth-change"));
          toast({
            variant: "destructive",
            title: "Sessão expirada por inatividade ⏱️",
            description: "Por razões de segurança, a tua sessão foi encerrada após 1 hora sem atividade.",
          });
        }
      }
    };

    let lastRecordedTime = Date.now();
    const registerActivity = () => {
      const now = Date.now();
      // Atualiza o timestamp apenas a cada 15 segundos para poupar I/O
      if (now - lastRecordedTime > 15000) {
        lastRecordedTime = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
      }
    };

    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll", "click"];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, registerActivity, { passive: true });
    });

    // Verifica a cada 30 segundos se passou 1 hora
    const intervalTimer = setInterval(checkInactivity, 30000);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, registerActivity);
      });
      clearInterval(intervalTimer);
    };
  }, [user, toast]);

  const openAuthModal = (redirectUrl?: string) => {
    if (redirectUrl) setAuthModalRedirect(redirectUrl);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const login = async (emailOrPhone: string, pass: string, redirectUrl?: string): Promise<boolean> => {
    if (!emailOrPhone || !pass) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Por favor, introduz o teu e-mail ou número de telemóvel e a tua palavra-passe.",
      });
      return false;
    }

    const rawInput = emailOrPhone.trim();
    const cleanInput = isPhoneNumberInput(rawInput) ? normalizePhoneNumber(rawInput) : rawInput;

    // 1. Autenticação estrita no Backend / MySQL (por e-mail ou telemóvel)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanInput, email: cleanInput, password: pass })
      });

      if (res.status === 401) {
        toast({
          variant: "destructive",
          title: "Palavra-passe incorreta",
          description: "A palavra-passe inserida está incorreta. Tenta novamente.",
        });
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        }
        if (data.user) {
          const authenticatedUser: User = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            phone: data.user.phone || undefined,
            role: data.user.role || "user",
            avatar: data.user.avatar || (data.user.name || "AQ").slice(0, 2).toUpperCase(),
            province: data.user.location || "Luanda",
            securityQuestion: data.user.securityQuestion,
            authMethod: "email",
            emailVerified: true
          };

          setUser(authenticatedUser);
          toast({
            title: "Sessão iniciada!",
            description: `Bem-vindo(a) de volta, ${authenticatedUser.name}!`,
          });

          setIsAuthModalOpen(false);
          const rawTarget = redirectUrl || authModalRedirect;
          const safeTarget = getSafeRedirectUrl(rawTarget);
          if (safeTarget) {
            setAuthModalRedirect(null);
            window.location.href = safeTarget;
          }
          return true;
        }
      }
    } catch (err) {
      console.debug("Erro ao verificar autenticação no backend:", err);
    }

    // 2. Bloquear utilizadores inexistentes
    toast({
      variant: "destructive",
      title: "Conta não encontrada",
      description: "Não foi encontrada nenhuma conta com este e-mail ou número de telemóvel. Por favor, regista-te primeiro.",
    });
    return false;
  };

  const register = async (
    name: string,
    email: string,
    phone: string,
    pass: string,
    redirectUrl?: string,
    securityQuestion?: string,
    securityAnswer?: string
  ): Promise<boolean> => {
    if (!name || !email || !pass) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Por favor, preenche todos os campos obrigatórios.",
      });
      return false;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = normalizePhoneNumber(phone);
    const newUserId = `usr-${Date.now()}`;
    const userAvatar = cleanName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AO";

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newUserId,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password: pass,
          location: "Luanda, Angola",
          securityQuestion: securityQuestion || "Qual é a tua comida tradicional angolana favorita?",
          securityAnswer: securityAnswer || ""
        })
      });

      if (res.status === 409) {
        toast({
          variant: "destructive",
          title: "E-mail já registado",
          description: "Já existe uma conta associada a este endereço de e-mail. Por favor, inicia sessão.",
        });
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        }
        const serverUser = data.user;
        const newUser: User = {
          id: serverUser?.id || newUserId,
          name: serverUser?.name || cleanName,
          email: serverUser?.email || cleanEmail,
          phone: serverUser?.phone || cleanPhone,
          role: serverUser?.role || "user",
          avatar: serverUser?.avatar || userAvatar,
          securityQuestion: serverUser?.securityQuestion || securityQuestion,
          authMethod: "email",
          emailVerified: true,
          province: "Luanda"
        };

        recordPlatformSignup();
        setUser(newUser);

        toast({
          title: "Conta criada com sucesso! 🎉",
          description: `Bem-vindo(a) à tua nova conta na Aqkianda, ${newUser.name}!`,
        });

        setIsAuthModalOpen(false);

        const rawTarget = redirectUrl || authModalRedirect;
        const safeTarget = getSafeRedirectUrl(rawTarget);
        if (safeTarget) {
          setAuthModalRedirect(null);
          window.location.href = safeTarget;
        }

        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Erro no registo",
          description: errorData.error || "Não foi possível registar a conta. Verifica os dados e tenta novamente.",
        });
        return false;
      }
    } catch (err) {
      console.error("Erro ao contactar o servidor para registo:", err);
      toast({
        variant: "destructive",
        title: "Erro de ligação ao servidor",
        description: "Não foi possível comunicar com o servidor. Verifica a tua ligação e tenta novamente.",
      });
      return false;
    }
  };

  const updateProfile = (data: { name?: string; phone?: string; province?: string; avatar?: string; securityQuestion?: string; securityAnswer?: string }) => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
      ...(data.name && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.province && { province: data.province }),
      ...(data.avatar && { avatar: data.avatar }),
      ...(data.securityQuestion && { securityQuestion: data.securityQuestion })
    };

    setUser(updatedUser);

    // Sync to backend API
    try {
      fetch("/api/auth/profile", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          email: user.email,
          name: data.name,
          phone: data.phone,
          avatar: data.avatar,
          securityQuestion: data.securityQuestion,
          securityAnswer: data.securityAnswer,
          location: data.province ? `${data.province}, Angola` : undefined
        })
      }).catch((e) => console.debug("API profile update:", e));
    } catch (err) {
      console.debug("Backend offline for profile update:", err);
    }

    toast({
      title: "Perfil Atualizado! ✅",
      description: "Os teus dados foram guardados com sucesso.",
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    window.dispatchEvent(new Event("aqkianda-auth-change"));
    toast({
      title: "Sessão encerrada",
      description: "Terminaste a sessão com sucesso.",
    });
  };

  const verifyEmailAndCompleteProfile = (phone: string, province: string) => {
    if (!user) return;
    updateProfile({
      phone: phone || user.phone,
      province: province || user.province
    });
  };

  const isAdmin = !!user && user.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isAuthModalOpen,
        authModalRedirect,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        updateProfile,
        logout,
        verifyEmailAndCompleteProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
