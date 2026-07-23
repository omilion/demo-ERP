// D:\plastimar-erp-v2\backend\src\facturacion\db.js
// Adapter Prisma/Postgres que expone la misma interfaz que engine.js espera
// de HM ERP (getEmpresa/saveEmpresa, cafs.tomarFolio, documentos CRUD,
// clients.get). A diferencia del adapter better-sqlite3 de HM, todo es async
// (Prisma) y los campos JSON no requieren JSON.stringify/parse manual.

const DOCUMENTO_UPDATABLE_FIELDS = [
  'clienteId', 'ordenId', 'guiaDespachoId', 'tipoDte', 'folio', 'fechaEmision',
  'receptor', 'items', 'detalles', 'comisiones', 'referencias', 'extra', 'totales',
  'estado', 'estadoDetalle', 'trackId', 'ambiente', 'xml'
];

export const createFacturacionDb = (prisma) => {
  const getEmpresa = async () => {
    const row = await prisma.factEmpresa.findUnique({ where: { id: 1 } });
    return row || {};
  };

  const saveEmpresa = async (data) => {
    const { id, updatedAt, ...rest } = data;
    await prisma.factEmpresa.upsert({
      where: { id: 1 },
      create: { id: 1, ...rest },
      update: rest
    });
    return getEmpresa();
  };

  const cafs = {
    tomarFolio: (tipoDte, ambiente) => prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT id FROM "facturacion"."cafs"
        WHERE "tipo_dte" = ${tipoDte} AND "ambiente" = ${ambiente} AND "siguiente_folio" <= "folio_hasta"
        ORDER BY "folio_desde" ASC
        LIMIT 1
        FOR UPDATE
      `;
      if (!locked.length) return null;
      const caf = await tx.factCaf.findUniqueOrThrow({ where: { id: locked[0].id } });
      const folio = caf.siguienteFolio;
      const updated = await tx.factCaf.update({ where: { id: caf.id }, data: { siguienteFolio: folio + 1 } });
      return { caf: updated, folio };
    })
  };

  const documentos = {
    get: (docId) => prisma.factDocumento.findUnique({ where: { id: Number(docId) } }),
    list: ({ estado, tipoDte, clienteId, ordenId } = {}) => prisma.factDocumento.findMany({
      where: {
        ...(estado ? { estado } : {}),
        ...(tipoDte ? { tipoDte: Number(tipoDte) } : {}),
        ...(clienteId ? { clienteId: Number(clienteId) } : {}),
        ...(ordenId ? { ordenId: Number(ordenId) } : {})
      },
      orderBy: { createdAt: 'desc' }
    }),
    create: (input) => prisma.factDocumento.create({
      data: {
        clienteId: input.clienteId ?? null,
        ordenId: input.ordenId ?? null,
        guiaDespachoId: input.guiaDespachoId ?? null,
        tipoDte: input.tipoDte,
        folio: input.folio ?? null,
        fechaEmision: input.fechaEmision ?? null,
        receptor: input.receptor ?? {},
        items: input.items ?? [],
        detalles: input.detalles ?? [],
        comisiones: input.comisiones ?? [],
        referencias: input.referencias ?? [],
        extra: input.extra ?? {},
        totales: input.totales ?? {},
        estado: input.estado || 'borrador',
        estadoDetalle: input.estadoDetalle ?? null,
        ambiente: input.ambiente ?? null,
        xml: input.xml ?? null
      }
    }),
    update: (docId, patch) => {
      const data = {};
      for (const field of DOCUMENTO_UPDATABLE_FIELDS) {
        if (field in patch) data[field] = patch[field];
      }
      return prisma.factDocumento.update({ where: { id: Number(docId) }, data });
    }
  };

  const clients = {
    get: async (clienteId) => {
      if (!clienteId) return null;
      const cliente = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
      if (!cliente) return null;
      return {
        rut: cliente.rut,
        razonSocial: cliente.razonSocial,
        name: cliente.nombre,
        giro: cliente.giro,
        direccion: cliente.direccion,
        comuna: cliente.comuna,
        ciudad: cliente.ciudad,
        emailDte: cliente.email
      };
    }
  };

  return { getEmpresa, saveEmpresa, cafs, documentos, clients };
};
