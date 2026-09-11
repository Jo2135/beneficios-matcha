import { leerConfig, tocaEnviar, ejecutarEnvio } from "../lib/reporteCobranza";

/**
 * Revisa cada 5 minutos si ya toca mandar el reporte semanal de cobranza.
 *
 * Es una revisión periódica y no una alarma a hora fija porque el equipo puede
 * estar apagado o dormido el sábado a las 6: así el reporte sale apenas el
 * sistema vuelve a estar arriba, en vez de perderse hasta la otra semana.
 */

const CADA_MS = 5 * 60_000;
// Si el envío falla (sin internet, clave mala) no se insiste cada 5 minutos:
// se reintenta cada hora, y el error queda a la vista en Configuración.
const ESPERA_TRAS_FALLO_MS = 60 * 60_000;

let ultimoFallo = 0;

async function revisar() {
  if (Date.now() - ultimoFallo < ESPERA_TRAS_FALLO_MS) return;

  try {
    const cfg = await leerConfig();
    if (!tocaEnviar(cfg)) return;
  } catch {
    return; // la base de datos todavía no está lista: se vuelve a mirar en 5 minutos
  }

  try {
    const r = await ejecutarEnvio("programado");
    console.log(`[cobranza] Reporte enviado a ${r.destinatarios.join(", ")} — respaldo: ${r.archivo}`);
  } catch (e: any) {
    ultimoFallo = Date.now();
    console.error("[cobranza] No se pudo enviar el reporte:", e?.message ?? e);
  }
}

export function iniciarProgramadorCobranza() {
  // La primera revisión, un minuto después de arrancar: deja terminar las
  // migraciones y la conexión a la base de datos.
  setTimeout(revisar, 60_000);
  setInterval(revisar, CADA_MS);
}
