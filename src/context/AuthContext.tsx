import React, { createContext, useContext, useState, useEffect } from "react";
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

export interface RegisteredUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  province?: string;
  registeredAt: string;
  avatar: string;
  authMethod: "email" | "google";
}

export const ADMIN_EMAIL = "elizangelomanuel@gmail.com";

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
  register: (name: string, email: string, phone: string, pass: string, redirectUrl?: string) => Promise<boolean>;
  updateProfile: (data: { name?: string; phone?: string; province?: string; avatar?: string }) => void;
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

  const login = async (email: string, pass: string, redirectUrl?: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();

    // Check registered users list for matching user profile and password
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      const found = usersList.find((u) => u.email.toLowerCase() === cleanEmail);

      if (found) {
        // If password was stored during registration and doesn't match
        if (found.password && pass && found.password !== pass) {
          toast({
            variant: "destructive",
            title: "Credenciais Inválidas",
            description: "A palavra-passe inserida está incorreta. Tente novamente.",
          });
          return false;
        }

        const authenticatedUser: User = {
          id: found.id,
          name: found.name,
          email: found.email,
          phone: found.phone !== "Não informado" ? found.phone : undefined,
          avatar: found.avatar || found.name.slice(0, 2).toUpperCase(),
          province: found.province || "Luanda",
          authMethod: found.authMethod || "email",
          emailVerified: true
        };

        setUser(authenticatedUser);
        toast({
          title: "Sessão iniciada!",
          description: `Bem-vindo de volta à tua conta, ${authenticatedUser.name}!`,
        });

        setIsAuthModalOpen(false);
        const target = redirectUrl || authModalRedirect;
        if (target) {
          setAuthModalRedirect(null);
          window.location.href = target;
        }
        return true;
      }
    } catch (e) {
      console.error(e);
    }

    // If user not previously registered on this device, create their exclusive account
    const derivedName = cleanEmail.split("@")[0].replace(/[._-]/g, " ");
    const formattedName = derivedName
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: formattedName || "Utilizador",
      email: cleanEmail,
      avatar: (formattedName || "U").slice(0, 2).toUpperCase(),
      authMethod: "email",
      emailVerified: true,
      province: "Luanda"
    };

    setUser(newUser);

    // Save to registered list
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      usersList.push({
        id: newUser.id!,
        name: newUser.name,
        email: cleanEmail,
        phone: "Não informado",
        password: pass,
        province: "Luanda",
        registeredAt: new Date().toLocaleDateString("pt-AO"),
        avatar: newUser.avatar!,
        authMethod: "email"
      });
      localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
    } catch (e) {
      console.error(e);
    }

    toast({
      title: "Sessão iniciada!",
      description: `Bem-vindo à Aqkianda, ${newUser.name}!`,
    });

    setIsAuthModalOpen(false);
    const target = redirectUrl || authModalRedirect;
    if (target) {
      setAuthModalRedirect(null);
      window.location.href = target;
    }

    return true;
  };

  const register = async (
    name: string,
    email: string,
    phone: string,
    pass: string,
    redirectUrl?: string
  ): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = phone ? phone.trim() : "";

    const userAvatar = cleanName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AO";

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      avatar: userAvatar,
      authMethod: "email",
      emailVerified: true,
      province: "Luanda"
    };

    setUser(newUser);

    // Sync to admin registered users list
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      const existingIdx = usersList.findIndex(
        (u) => u.email.toLowerCase() === cleanEmail
      );
      if (existingIdx >= 0) {
        usersList[existingIdx].name = cleanName;
        usersList[existingIdx].phone = cleanPhone || usersList[existingIdx].phone;
        usersList[existingIdx].password = pass;
        usersList[existingIdx].avatar = userAvatar;
      } else {
        recordPlatformSignup();
        usersList.push({
          id: newUser.id!,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone || "Não informado",
          password: pass,
          province: "Luanda",
          registeredAt: new Date().toLocaleDateString("pt-AO"),
          avatar: userAvatar,
          authMethod: "email"
        });
      }
      localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
    } catch (e) {
      console.error("Error saving user:", e);
    }

    // Try posting to backend API
    try {
      fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newUser.id,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password: pass,
          location: "Luanda, Angola"
        })
      }).catch((e) => console.debug("API register sync:", e));
    } catch (err) {
      console.debug("Backend offline for register sync:", err);
    }

    toast({
      title: "Conta criada com sucesso! 🎉",
      description: `Bem-vindo(a) à tua conta exclusiva Aqkianda, ${newUser.name}!`,
    });

    setIsAuthModalOpen(false);

    const target = redirectUrl || authModalRedirect;
    if (target) {
      setAuthModalRedirect(null);
      window.location.href = target;
    }

    return true;
  };

  const updateProfile = (data: { name?: string; phone?: string; province?: string; avatar?: string }) => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
      ...(data.name && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.province && { province: data.province }),
      ...(data.avatar && { avatar: data.avatar })
    };

    setUser(updatedUser);

    // Update in registered users list
    try {
      const usersList: RegisteredUserRecord[] = JSON.parse(
        localStorage.getItem("aqkianda-registered-users") || "[]"
      );
      const idx = usersList.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase());
      if (idx >= 0) {
        if (data.name) usersList[idx].name = data.name;
        if (data.phone !== undefined) usersList[idx].phone = data.phone;
        if (data.province) usersList[idx].province = data.province;
        if (data.avatar) usersList[idx].avatar = data.avatar;
        localStorage.setItem("aqkianda-registered-users", JSON.stringify(usersList));
      }
    } catch (e) {
      console.error(e);
    }

    // Sync to backend API
    try {
      fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: data.name,
          phone: data.phone,
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

  const isAdmin = !!user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

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
