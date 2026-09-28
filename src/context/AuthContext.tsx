import React, { createContext, useContext, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { recordPlatformSignup } from "@/utils/analytics";
import { normalizePhoneNumber, isPhoneNumberInput } from "@/lib/phone";

export interface User {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role?: "user" | "seller" | "admin";
  avatar?: string;
  authMethod?: "email" | "google";
  googleCreatedAt?: string;
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
  authMethod: "email" | "google";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAuthModalOpen: boolean;
  authModalRedirect: string | null;
  openAuthModal: (redirectUrl?: string) => void;
  closeAuthModal: () => void;
  isGoogleModalOpen: boolean;
  openGoogleModal: (redirectUrl?: string) => void;
  closeGoogleModal: () => void;
  loginWithGoogle: (
    redirectUrl?: string,
    customAccount?: { name: string; email: string; avatar?: string; phone?: string }
  ) => Promise<void>;
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
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [authModalRedirect, setAuthModalRedirect] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
    // Notify other contexts/components of auth change
    window.dispatchEvent(new Event("aqkianda-auth-change"));
  }, [user]);

  const openAuthModal = (redirectUrl?: string) => {
    if (redirectUrl) setAuthModalRedirect(redirectUrl);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const openGoogleModal = (redirectUrl?: string) => {
    if (redirectUrl) setAuthModalRedirect(redirectUrl);
    setIsAuthModalOpen(false); // Close general auth modal if open
    setIsGoogleModalOpen(true);
  };

  const closeGoogleModal = () => {
    setIsGoogleModalOpen(false);
  };

  const getDaysRemainingForProfile = (): number => {
    if (!user || !user.googleCreatedAt) return 7;
    const createdTime = new Date(user.googleCreatedAt).getTime();
    const now = new Date().getTime();
    const elapsedDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    const remaining = Math.max(0, Math.ceil(7 - elapsedDays));
    return remaining;
  };

  const loginWithGoogle = async (
    redirectUrl?: string,
    customAccount?: { name: string; email: string; avatar?: string; phone?: string }
  ) => {
    // If no custom account details provided, open Google prompt to let user specify their own account
    if (!customAccount || !customAccount.email) {
      openGoogleModal(redirectUrl);
      return;
    }

    const cleanEmail = customAccount.email.trim().toLowerCase();
    const cleanName = customAccount.name.trim() || cleanEmail.split("@")[0];
    const userAvatar = customAccount.avatar || cleanName.slice(0, 2).toUpperCase();

    // Check if user is already in registered users list
    let existingUser: RegisteredUserRecord | undefined;
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      existingUser = usersList.find(
        (u) => u.email.toLowerCase() === cleanEmail
      );
    } catch (e) {
      console.error(e);
    }

    const uniqueId = existingUser ? existingUser.id : `usr-g-${Date.now()}`;
    const userPhone = existingUser?.phone || customAccount.phone || "";
    const userProvince = existingUser?.province || "Luanda";

    const googleUser: User = {
      id: uniqueId,
      name: cleanName,
      email: cleanEmail,
      avatar: userAvatar,
      phone: userPhone,
      province: userProvince,
      authMethod: "google",
      googleCreatedAt: new Date().toISOString(),
      emailVerified: true
    };

    setUser(googleUser);

    // Sync with registered users list for Admin Panel and persistent lookup
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      const existingIdx = usersList.findIndex(
        (u) => u.email.toLowerCase() === cleanEmail
      );
      if (existingIdx >= 0) {
        usersList[existingIdx].name = cleanName;
        usersList[existingIdx].avatar = userAvatar;
        localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
      } else {
        recordPlatformSignup();
        usersList.push({
          id: uniqueId,
          name: cleanName,
          email: cleanEmail,
          phone: userPhone || "Não informado",
          province: userProvince,
          registeredAt: new Date().toLocaleDateString("pt-AO"),
          avatar: userAvatar,
          authMethod: "google"
        });
        localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
      }
    } catch (e) {
      console.error("Error saving registered user:", e);
    }

    // Try syncing with backend API if server is online
    try {
      fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: uniqueId,
          name: cleanName,
          email: cleanEmail,
          phone: userPhone,
          avatar: userAvatar,
          location: `${userProvince}, Angola`
        })
      }).catch((e) => console.debug("API google sync:", e));
    } catch (err) {
      console.debug("Backend offline for google sync:", err);
    }

    toast({
      title: "Sessão Google Iniciada! 🚀",
      description: `Bem-vindo(a) à tua conta pessoal Aqkianda, ${cleanName}!`,
    });

    setIsAuthModalOpen(false);
    setIsGoogleModalOpen(false);

    const target = redirectUrl || authModalRedirect;
    if (target) {
      setAuthModalRedirect(null);
      window.location.href = target;
    }
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
          const target = redirectUrl || authModalRedirect;
          if (target) {
            setAuthModalRedirect(null);
            window.location.href = target;
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

        const target = redirectUrl || authModalRedirect;
        if (target) {
          setAuthModalRedirect(null);
          window.location.href = target;
        }

        return true;
      }
    } catch (err) {
      console.debug("Backend offline para registo:", err);
    }

    const newUser: User = {
      id: newUserId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      avatar: userAvatar,
      role: "user",
      authMethod: "email",
      emailVerified: true,
      province: "Luanda"
    };

    setUser(newUser);
    recordPlatformSignup();

    toast({
      title: "Conta criada com sucesso! 🎉",
      description: `Bem-vindo(a) à tua nova conta na Aqkianda, ${newUser.name}!`,
    });

    setIsAuthModalOpen(false);

    const target = redirectUrl || authModalRedirect;
    if (target) {
      setAuthModalRedirect(null);
      window.location.href = target;
    }

    return true;
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
        headers: { "Content-Type": "application/json" },
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
        isGoogleModalOpen,
        openGoogleModal,
        closeGoogleModal,
        loginWithGoogle,
        login,
        register,
        updateProfile,
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
