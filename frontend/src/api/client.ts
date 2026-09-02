import axios from "axios";

// Direccion del servidor. No se puede fijar "localhost": cuando una vendedora
// abre el sistema desde otra PC, "localhost" seria SU maquina y no la del
// servidor. Se usa el mismo equipo desde el que se abrio la pagina, asi
// funciona igual en la PC del servidor (localhost) que en la red
// (192.168.x.x). VITE_API_URL lo sobreescribe si algun dia hay dominio.
export const API_BASE: string =
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") ??
  `${window.location.protocol}//${window.location.hostname}:5101`;

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
});

// Si hay token guardado, incluirlo en cada request desde el inicio
const savedToken = localStorage.getItem("ecoplast_token");
if (savedToken) {
  api.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;
}

// Si el servidor responde 401 (token expirado), limpiar sesión
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("ecoplast_token");
      delete api.defaults.headers.common["Authorization"];
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);
