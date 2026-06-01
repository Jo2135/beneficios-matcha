import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:5101/api",
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
