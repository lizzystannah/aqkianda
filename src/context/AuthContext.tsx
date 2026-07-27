import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { recordPlatformSignup } from "@/utils/analytics";

export interface User {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  authMethod?: "email" | "google";
  googleCreatedAt?: string;
  emailVerified?: boolean;
  province?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  authModalRedirect: string | null;
  openAuthModal: (redirectUrl?: string) => void;
  closeAuthModal: () => void;
  loginWithGoogle: (redirectUrl?: string) => Promise<void>;
  login: (email: string, pass: string, redirectUrl?: string) => Promise<boolean>;
  register: (name: string, email: string, phone: string, pass: string, redirectUrl?: string) => Promise<boolean>;
  logout: () => void;
  verifyEmailAndCompleteProfile: (phone: string, province: string) => void;
  getDaysRemainingForProfile: () => number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
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
    } else {
      localStorage.removeItem("user");
    }
  }, [user]);

  const openAuthModal = (redirectUrl?: string) => {
    if (redirectUrl) setAuthModalRedirect(redirectUrl);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const getDaysRemainingForProfile = (): number => {
    if (!user || !user.googleCreatedAt) return 7;
    const createdTime = new Date(user.googleCreatedAt).getTime();
    const now = new Date().getTime();
    const elapsedDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    const remaining = Math.max(0, Math.ceil(7 - elapsedDays));
    return remaining;
  };

  const loginWithGoogle = async (redirectUrl?: string) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const googleUser: User = {
          id: `usr-google-${Date.now()}`,
          name: "Elizângelo Manuel",
          email: "elizangelomanuel@gmail.com",
          avatar: "EM",
          authMethod: "google",
          googleCreatedAt: new Date().toISOString(),
          emailVerified: false,
          phone: "923 000 000"
        };

        setUser(googleUser);

        // Sync with registered users list for Admin Panel
        try {
          const usersList = JSON.parse(localStorage.getItem("aqkianda-registered-users") || "[]");
          if (!usersList.some((u: { email: string }) => u.email.toLowerCase() === googleUser.email.toLowerCase())) {
            recordPlatformSignup();
            usersList.push({
              id: googleUser.id,
              name: googleUser.name,
              email: googleUser.email,
              phone: googleUser.phone,
              registeredAt: new Date().toLocaleDateString("pt-AO"),
              avatar: googleUser.avatar,
              authMethod: "google"
            });
            localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
          }
        } catch (e) {
          console.error("Error saving registered user:", e);
        }

        toast({
          title: "Acesso via Google Autorizado! 🚀",
          description: "Conta criada com sucesso! Tens até 7 dias para verificar o teu e-mail e completar o perfil.",
        });

        setIsAuthModalOpen(false);

        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else if (authModalRedirect) {
          window.location.href = authModalRedirect;
          setAuthModalRedirect(null);
        }

        resolve();
      }, 1000);
    });
  };

  const login = async (email: string, pass: string, redirectUrl?: string): Promise<boolean> => {
    const mockUser: User = {
      id: `usr-${Date.now()}`,
      name: email.split("@")[0].toUpperCase() || "Utilizador",
      email: email,
      avatar: email.charAt(0).toUpperCase(),
      authMethod: "email",
      emailVerified: true
    };

    setUser(mockUser);
    toast({
      title: "Sessão iniciada!",
      description: `Bem-vindo de volta, ${mockUser.name}!`,
    });

    setIsAuthModalOpen(false);

    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else if (authModalRedirect) {
      window.location.href = authModalRedirect;
      setAuthModalRedirect(null);
    }

    return true;
  };

  const register = async (name: string, email: string, phone: string, pass: string, redirectUrl?: string): Promise<boolean> => {
    const mockUser: User = {
      id: `usr-${Date.now()}`,
      name: name,
      email: email,
      phone: phone,
      avatar: name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2),
      authMethod: "email",
      emailVerified: true
    };

    setUser(mockUser);

    // Sync to admin registered users list
    try {
      const usersList = JSON.parse(localStorage.getItem("aqkianda-registered-users") || "[]");
      if (!usersList.some((u: { email: string }) => u.email.toLowerCase() === email.toLowerCase())) {
        recordPlatformSignup();
        usersList.push({
          id: mockUser.id,
          name: name,
          email: email,
          phone: phone || "Não fornecido",
          registeredAt: new Date().toLocaleDateString("pt-AO"),
          avatar: mockUser.avatar,
          authMethod: "email"
        });
        localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
      }
    } catch (e) {
      console.error("Error saving user:", e);
    }

    toast({
      title: "Conta criada com sucesso!",
      description: `Bem-vindo à Aqkianda, ${mockUser.name}!`,
    });

    setIsAuthModalOpen(false);

    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else if (authModalRedirect) {
      window.location.href = authModalRedirect;
      setAuthModalRedirect(null);
    }

    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
    toast({
      title: "Sessão encerrada",
      description: "Terminaste a sessão com sucesso.",
    });
  };

  const verifyEmailAndCompleteProfile = (phone: string, province: string) => {
    if (!user) return;
    const updated: User = {
      ...user,
      phone: phone || user.phone,
      province: province || user.province,
      emailVerified: true
    };
    setUser(updated);
    toast({
      title: "Perfil Atualizado!  Verification OK",
      description: "E-mail verificado e detalhes do perfil atualizados com sucesso.",
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAuthModalOpen,
        authModalRedirect,
        openAuthModal,
        closeAuthModal,
        loginWithGoogle,
        login,
        register,
        logout,
        verifyEmailAndCompleteProfile,
        getDaysRemainingForProfile
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
