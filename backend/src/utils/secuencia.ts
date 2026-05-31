import { prisma } from "../lib/prisma";

export async function siguienteNumero(prefijo: string): Promise<string> {
  const seq = await prisma.secuencia.upsert({
    where: { prefijo },
    update: { ultimo: { increment: 1 } },
    create: { prefijo, ultimo: 1 },
  });
  return `${prefijo}-${String(seq.ultimo).padStart(4, "0")}`;
}
