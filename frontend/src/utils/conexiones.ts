// Regla ÚNICA de "¿esta línea es Conexión?" — espejo de esConexion() en
// backend/src/controllers/ganancias.controller.ts (el motor que paga).
//
// Prioridad: categoría "Conexiones" → código → nombre → origen (fallback).
// Los codos 2"/4" que fabrica Ecoplast son INTERNO pero categoría Conexiones:
// el vendedor cobra por ellos el % de conexiones del cliente (que puede ser 0),
// nunca el % de tubería. Cualquier pantalla que separe tubería/conexiones debe
// importar esta función — NO copiar la regla (ya pasó dos veces y se desvió).
export function esConexionProducto(p: {
  codigo?: string | null;
  nombre?: string | null;
  origen?: string | null;
  categoria?: { nombre?: string | null } | null;
}): boolean {
  if (String(p?.categoria?.nombre ?? "").toLowerCase().trim() === "conexiones") return true;

  const c = String(p?.codigo ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (c && /^(CO-|SC-|SI-|TE-|YE-|YR-|ABS-|TR-|UR-|URR-|AM-|AH-|TAR-|COR-|ASP-|CA-)/.test(c)) return true;

  const n = String(p?.nombre ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.includes("abrazadera") || n.includes("cajeti") || n.includes("aspersor")) return true;
  if (n.includes("adaptador") && (n.includes("macho") || n.includes("hembra"))) return true;
  if (n.includes("tee") && n.includes("rapid")) return true;
  if (n.includes("union") && (n.includes("reduc") || n.includes("rapid"))) return true;

  return String(p?.origen ?? "INTERNO").toUpperCase() === "EXTERNO" && !n.includes("manguera");
}
