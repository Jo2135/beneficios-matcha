/**
 * Formateo de fechas para mostrar en pantalla.
 *
 * ⚠️ Por qué existe esto: las fechas que escribe el usuario (la de un pago, la
 * de un abono del balance, la de un gasto) salen del `<input type="date">` como
 * "2026-09-05" y se guardan a **medianoche UTC**. Venezuela va en UTC-4, así
 * que leerlas en hora local las corre **un día hacia atrás**: un pago del 5 de
 * septiembre se mostraba como "04 sept.".
 *
 * La regla: si el valor cae exacto en medianoche UTC es una fecha sola y se lee
 * en UTC. Si trae hora es una marca de tiempo real (`creadoEn`,
 * `fechaAsignacion`, `aprobadoEn`) y se lee en hora de Venezuela, que para esas
 * es lo correcto.
 */

function esSoloFecha(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/** "05 sept. 2026" — para fechas que el usuario escribió y para marcas de tiempo. */
export function fmtFecha(raw: any, opciones?: Intl.DateTimeFormatOptions): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(esSoloFecha(d) ? { timeZone: "UTC" } : {}),
    ...opciones,
  });
}

/** "05/09/2026" — mismo criterio, formato numérico. */
export function fmtFechaCorta(raw: any): string {
  return fmtFecha(raw, { day: "2-digit", month: "2-digit", year: "numeric" });
}
