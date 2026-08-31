// Auditoria del catalogo: productos repetidos, filas que no son productos y
// codigos que no cuadran con el nombre.  Ejecutar con:  npm run productos:auditar
import { prisma } from "../lib/prisma";
import { puntaje, pareceBasura, ProductoLike } from "../lib/similitudProductos";

(async () => {
  const prods = await prisma.producto.findMany({ orderBy: { id: "asc" }, include: { categoria: true } });
  const uso = new Map<number, number>();
  for (const t of ["cotizacionLinea", "despachoLinea", "facturaLinea"] as const) {
    const g = await (prisma as any)[t].groupBy({ by: ["productoId"], _count: { _all: true } });
    for (const r of g) uso.set(r.productoId, (uso.get(r.productoId) ?? 0) + r._count._all);
  }
  const precios = await prisma.listaPrecioDetalle.groupBy({ by: ["productoId"], _count: { _all: true } });
  const enListas = new Map(precios.map((p) => [p.productoId, p._count._all]));

  // ── Pares parecidos → grupos ──────────────────────────────────────────────
  // Se agrupa por clique, no por cadena: un producto entra al grupo solo si es
  // duplicado de TODOS los que ya estan. Asi un "Codo 2" sin angulo no termina
  // uniendo al codo de 45 con el de 90.
  const pares: { a: number; b: number; pt: number; motivos: string[] }[] = [];
  const pt = new Map<string, number>();
  for (let i = 0; i < prods.length; i++) {
    for (let j = i + 1; j < prods.length; j++) {
      const r = puntaje(prods[i] as ProductoLike, prods[j] as ProductoLike);
      if (r.puntaje >= 60) {
        pares.push({ a: prods[i].id, b: prods[j].id, pt: r.puntaje, motivos: r.motivos });
        pt.set(prods[i].id + "-" + prods[j].id, r.puntaje);
        pt.set(prods[j].id + "-" + prods[i].id, r.puntaje);
      }
    }
  }
  const compat = (x: number, y: number) => (pt.get(x + "-" + y) ?? 0) >= 70;
  const dup: number[][] = [];
  const asignado = new Set<number>();
  for (const par of [...pares].filter((p) => p.pt >= 70).sort((a, b) => b.pt - a.pt)) {
    if (asignado.has(par.a) || asignado.has(par.b)) continue;
    const grupo = [par.a, par.b];
    for (const p of prods) {
      if (asignado.has(p.id) || grupo.includes(p.id)) continue;
      if (grupo.every((g) => compat(g, p.id))) grupo.push(p.id);
    }
    grupo.forEach((g) => asignado.add(g));
    dup.push(grupo);
  }

  const byId = new Map(prods.map((p) => [p.id, p]));
  const linea = (id: number) => {
    const p = byId.get(id)!;
    const u = uso.get(id) ?? 0, l = enListas.get(id) ?? 0;
    return "    " + (p.activo ? "[A]" : "[i]") + " #" + String(id).padEnd(4) + (p.codigo ?? "SIN-COD").padEnd(15) +
      (p.nombre + " " + p.medida).slice(0, 52).padEnd(54) + p.categoria.nombre.padEnd(14) +
      "usos:" + String(u).padStart(3) + "  listas:" + String(l).padStart(3);
  };

  // Un grupo con un solo producto activo ya esta resuelto: las copias quedaron
  // desactivadas al unificar. Con --todos se ven tambien esos.
  const TODOS = process.argv.includes("--todos");
  const activosDe = (g: number[]) => g.filter((id) => byId.get(id)!.activo).length;
  const pendientes = TODOS ? dup : dup.filter((g) => activosDe(g) > 1);
  const resueltos = dup.length - pendientes.length;

  console.log("=========== GRUPOS PENDIENTES DE UNIFICAR: " + pendientes.length + " ===========");
  if (!TODOS && resueltos) console.log("(" + resueltos + " grupos ya unificados no se listan; usar --todos para verlos)");
  pendientes.sort((a, b) => (uso.get(b[0]) ?? 0) - (uso.get(a[0]) ?? 0));
  pendientes.forEach((g, i) => {
    const activos = activosDe(g);
    console.log("--- Grupo " + (i + 1) + " (" + g.length + " registros, " + activos + " activos)");
    g.sort((x, y) => (uso.get(y) ?? 0) - (uso.get(x) ?? 0)).forEach((id) => console.log(linea(id)));
    const par = pares.find((p) => g.includes(p.a) && g.includes(p.b));
    if (par) console.log("      motivo: " + par.motivos.join(" | "));
  });

  console.log("");
  console.log("=========== FILAS QUE NO SON PRODUCTOS ===========");
  prods.forEach((p) => { const b = pareceBasura(p); if (b) console.log(linea(p.id) + "   <- " + b); });

  console.log("");
  console.log("=========== CODIGO vs NOMBRE INCOHERENTE ===========");
  // Solo familias cuyo codigo lleva la medida. Los correlativos (ABS-6, AM-7,
  // UR-3...) no la llevan y compararlos daria puro ruido.
  const CON_MEDIDA = /^(MGR|MGAZ|MGVD|MGAM|TUAZ|TUGR|TUNG|TUBL|CVBL|CVNG|TUAM|TUNA|NI)-/;
  const limpia = (s: string) => s.replace(/\s+/g, "");
  for (const p of prods) {
    if (!p.codigo || !CON_MEDIDA.test(p.codigo)) continue;
    const resto = p.codigo.replace(/^[A-Z]+-/, "");
    const mCod = resto.match(/^(\d\s*\d\/\d|\d\/\d|\d+)/);
    if (!mCod) continue;
    let dCod = mCod[1];
    if (/^\d\d\/\d$/.test(dCod)) dCod = dCod[0] + " " + dCod.slice(1);   // 11/2 -> 1 1/2
    const txt = (p.nombre + " " + p.medida).replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4");
    const mNom = txt.match(/(\d\s+\d\/\d|\d\/\d|\d+)\s*"/);
    if (!mNom) continue;
    if (limpia(dCod) !== limpia(mNom[1])) console.log(linea(p.id) + "   <- codigo dice " + dCod + ', nombre dice ' + mNom[1]);
  }
  await prisma.$disconnect();
})();
