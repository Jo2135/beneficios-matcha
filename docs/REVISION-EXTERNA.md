# Revisión del sistema por otra IA (Gemini)

Guía para pedirle a Gemini —o a cualquier otra IA— que audite el sistema y
busque fallas. Pensado para José: no hace falta saber programar.

---

## Antes de mandar el código a ningún lado

1. **Nunca subir el archivo `backend/.env`.** Ahí viven la clave de la base de
   datos y la del correo. No está versionado, así que el paquete que se arma
   más abajo no lo incluye — pero conviene saberlo.
2. **Nunca subir la base de datos** (los respaldos, los Excel de cobranza).
   Tienen nombres de clientes, precios y deudas.
3. **El código sí lleva información del negocio**: nombres de los socios,
   porcentajes de reparto, fórmulas de ganancia. Si eso es sensible, conviene
   saber que queda en manos de Google al subirlo.

## Cómo armar el paquete

Desde la carpeta del sistema:

```
git archive --format=zip -o "C:/Ecoplast/revision-gemini.zip" HEAD
```

Eso arma un ZIP con **solo los archivos del sistema** (unos 141 archivos,
2 MB). Deja afuera el `.env`, las librerías descargadas y los respaldos.

## Cómo pedírselo a Gemini

En la app de Gemini (plan Pro), adjuntar el ZIP —o conectar el repositorio de
GitHub— y pegar este texto:

---

Eres un auditor de software. Te paso el código completo de un sistema de
gestión real, en producción, de una fábrica de tuberías plásticas en Venezuela
(Ecoplast). Lo usa el dueño todos los días para cotizar, despachar, facturar,
cobrar y repartir las ganancias entre socios.

**Qué es:** backend en Express 5 + TypeScript + Prisma 7 + PostgreSQL; frontend
en React 19 + TypeScript + Vite. Un solo servidor en la oficina; pronto va a
salir a internet.

**Léete primero `CLAUDE.md`**: ahí están las reglas de negocio reales (fórmulas
de ganancia, porcentajes de cada socio, costos por kilo, cómo se calculan
fletes y comisiones). Es la fuente de verdad del negocio.

**Qué quiero que busques, en este orden de importancia:**

1. **Errores de plata.** Cualquier cálculo que pueda dar un número equivocado
   en ganancias, comisiones, fletes, costos de materia prima, saldos de
   facturas o balances. Redondeos mal hechos, sumas duplicadas, divisiones
   entre cero, montos que se cuentan dos veces.
2. **Contradicciones con `CLAUDE.md`.** Si el código hace algo distinto de lo
   que ese archivo dice que debe hacer, señálalo.
3. **Riesgo de perder datos.** Operaciones que borran o sobreescriben sin
   aviso, cascadas de borrado peligrosas, falta de transacciones en procesos
   de varios pasos.
4. **Seguridad**, pensando en que el sistema va a estar en internet: permisos
   que faltan en rutas, datos que un usuario podría ver sin que le toque,
   validaciones que están solo en la pantalla y no en el servidor.
5. **Problemas con varios usuarios a la vez** (vendedoras entrando desde otras
   PCs al mismo tiempo).

**Cómo quiero la respuesta:**

- En español, explicando el impacto en términos del negocio, no solo técnicos.
- Cada hallazgo con: archivo y número de línea, qué pasa, un ejemplo concreto
  de cuándo falla, y qué tan grave es (alto / medio / bajo).
- Ordenado de más grave a menos grave. Máximo 20 hallazgos: prefiero pocos y
  seguros que muchos y dudosos.
- **No propongas reescribir el sistema**, ni cambios de estilo, ni "buenas
  prácticas" genéricas, ni que agregue tests. Solo fallas reales.
- Si algo te parece raro pero no estás seguro, dilo como duda, no como falla.

---

## Qué hacer con lo que responda

Traer los hallazgos de vuelta a esta sesión. **Cada uno hay que verificarlo
contra el código y los datos reales antes de cambiar nada**: una IA que no
conoce el historial del sistema suele marcar como error cosas que son
decisiones del negocio tomadas a propósito. Ejemplos reales de este sistema que
cualquier auditor externo marcaría como "bug" y no lo son:

- Los pesos de las curvas van **por encima** del peso real, a propósito, para
  apartar más dinero de materia prima.
- Los pesos de ganancia del PEAD son **menores** que los pesos de inventario,
  también a propósito.
- Un margen bajísimo en una venta puede ser un **convenio por volumen**, no un
  error de precio.
- La ganancia del Sr. Alberto en las curvas está **dentro** del pago de
  fábrica, no se suma aparte.

Lo mismo al revés: si Gemini encuentra algo real, mejor, se corrige y se prueba
con los datos del sistema antes de darlo por bueno.
