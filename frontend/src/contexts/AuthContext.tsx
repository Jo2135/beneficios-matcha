import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "../api/client";

export type Rol = "MASTER" | "ADMIN" | "VENDEDOR";

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  vendedorId: number | null;
  vendedor?: { id: number; nombre: string; comisionPct: string } | null;
}

interface AuthContextType {
  usuario: UsuarioSesion | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  esMaster: boolean;
  esAdmin: boolean;
  esVendedor: boolean;
  puedeEditar: boolean;   // MASTER o ADMIN
}

const AuthContext = createContext<AuthContextType>(null!);

const TOKEN_KEY = "ecoplast_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    api.get("/auth/me")
      .then((r) => setUsuario(r.data))
      .catch(() => { logout(); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
    setToken(data.token);
    setUsuario(data.usuario);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common["Authorization"];
    setToken(null);
    setUsuario(null);
  }

  const esMaster = usuario?.rol === "MASTER";
  const esAdmin = usuario?.rol === "ADMIN";
  const esVendedor = usuario?.rol === "VENDEDOR";
  const puedeEditar = esMaster || esAdmin;

  return (
    <AuthContext.Provider value={{ usuario, token, loading, login, logout, esMaster, esAdmin, esVendedor, puedeEditar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
