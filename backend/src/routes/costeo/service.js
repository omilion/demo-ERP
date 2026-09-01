import { calcularCosteo } from './engine.js';

async function lockProductoCosteo(tx, productoId) {
  // Serializa editar receta + aplicar costo del mismo producto. Sin este lock,
  // dos operadores podían guardar versiones distintas y dejar un snapshot que
  // no corresponde al precio finalmente aplicado.
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`costeo-producto:${productoId}`})::bigint)`;
  }
}

export function getCosteoBlockers({ materiales = [], procesos = [] } = {}) {
  const materialesSinPrecio = materiales
    .filter(item => Number(item.cantidad) > 0 && Number(item.precioUnitario) <= 0)
    .map(item => item.nombre || 'Material sin nombre');
  const procesosSinTarifa = procesos
    .filter(item => Number(item.horas) > 0 && Number(item.valorHora) <= 0)
    .map(item => item.proceso || 'Proceso sin nombre');

  return { materialesSinPrecio, procesosSinTarifa };
}

function throwCosteoIncompleto(alertas) {
  const faltantes = [
    ...(alertas.materialesSinPrecio.length ? [`materiales sin precio: ${alertas.materialesSinPrecio.join(', ')}`] : []),
    ...(alertas.procesosSinTarifa.length ? [`procesos sin tarifa vigente: ${alertas.procesosSinTarifa.join(', ')}`] : []),
  ];
  if (!faltantes.length) return;
  const error = new Error(`No se puede aplicar el costeo con datos incompletos (${faltantes.join('; ')}). Corrige los precios o tarifas y vuelve a calcular.`);
  error.statusCode = 409;
  throw error;
}

export async function getMaterialesHistorialPrecios(prisma, bodegaTallerId) {
  return prisma.bodegaTallerPrecioHistorial.findMany({
    where: { bodegaTallerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTarifas(prisma, { tallerId, historico = false } = {}) {
  const where = {
    ...(tallerId ? { tallerId } : {}),
    ...(historico ? {} : { activo: true }),
  };

  const all = await prisma.tarifaProceso.findMany({
    where,
    include: { taller: true },
    orderBy: { vigenteDesde: 'desc' },
  });

  if (historico) return all;

  // Filter only the latest active tariff per (tallerId, proceso)
  const map = new Map();
  for (const item of all) {
    const key = `${item.tallerId}_${item.proceso.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

export async function createTarifa(prisma, { tallerId, proceso, valorHora }) {
  if (!tallerId || !proceso || valorHora === undefined || valorHora < 0) {
    throw new Error('tallerId, proceso y valorHora mayor o igual a 0 son requeridos');
  }

  const taller = await prisma.taller.findUnique({ where: { id: tallerId } });
  if (!taller) throw new Error('Taller no encontrado');

  return prisma.tarifaProceso.create({
    data: {
      tallerId,
      proceso: String(proceso).trim().toLowerCase(),
      valorHora: Number(valorHora),
      vigenteDesde: new Date(),
      activo: true,
    },
    include: { taller: true },
  });
}

export async function disableTarifa(prisma, id) {
  const tarifa = await prisma.tarifaProceso.findUnique({ where: { id } });
  if (!tarifa) throw new Error('Tarifa no encontrada');

  return prisma.tarifaProceso.update({
    where: { id },
    data: { activo: false },
  });
}

export async function getRecetas(prisma, { tallerId, conReceta, search, page = 1, limit = 50 } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (parsedPage - 1) * parsedLimit;

  const where = {
    activo: true,
    // El costeo de fabricacion corresponde exclusivamente al catalogo MK.
    // En la base hay variantes mk/Mk/MK, por eso el prefijo es insensitive.
    codigoInterno: { startsWith: 'MK', mode: 'insensitive' },
  };
  const filtrosCombinados = [];

  if (search) {
    const texto = String(search).trim();
    if (texto) {
      filtrosCombinados.push({
        OR: [
          { codigoInterno: { contains: texto, mode: 'insensitive' } },
          { nombre: { contains: texto, mode: 'insensitive' } },
        ],
      });
    }
  }

  if (conReceta === 'true' || conReceta === true) {
    // Relacion to-one: los campos van dentro de `is`. Con `isNot: null` +
    // campos sueltos Prisma tira "Unknown argument `activo`".
    const recetaFiltro = { activo: true };
    if (tallerId) recetaFiltro.tallerId = parseInt(tallerId, 10);
    where.receta = { is: recetaFiltro };
  } else if (conReceta === 'false' || conReceta === false) {
    where.receta = null;
  } else if (tallerId) {
    filtrosCombinados.push({
      OR: [
        { tallerId: parseInt(tallerId, 10) },
        { receta: { tallerId: parseInt(tallerId, 10) } },
      ],
    });
  }

  if (filtrosCombinados.length) where.AND = filtrosCombinados;

  const [total, items] = await Promise.all([
    prisma.producto.count({ where }),
    prisma.producto.findMany({
      where,
      skip,
      take: parsedLimit,
      select: {
        id: true,
        codigoInterno: true,
        nombre: true,
        categoria: true,
        precioLista: true,
        tallerId: true,
        receta: {
          include: {
            taller: true,
            materiales: {
              include: {
                material: true,
                tela: true,
              },
            },
            procesos: {
              include: {
                taller: true,
              },
            },
          },
        },
        costeoSnapshots: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { codigoInterno: 'asc' },
    }),
  ]);

  return {
    data: items,
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit),
  };
}

export async function getRecetaByProductoId(prisma, productoId) {
  const id = parseInt(productoId, 10);
  if (!id) throw new Error('ID de producto invalido');

  const producto = await prisma.producto.findUnique({
    where: { id },
    select: {
      id: true,
      codigoInterno: true,
      nombre: true,
      categoria: true,
      precioLista: true,
      tallerId: true,
      activo: true,
      receta: {
        include: {
          taller: true,
          materiales: {
            include: { material: true, tela: true },
          },
          procesos: {
            include: { taller: true },
          },
        },
      },
      costeoSnapshots: {
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!producto) throw new Error('Producto no encontrado');
  return producto;
}

export async function upsertReceta(prisma, productoId, data) {
  const id = parseInt(productoId, 10);
  if (!id) throw new Error('ID de producto invalido');

  // Solo necesitamos comprobar existencia. Seleccionar el registro completo
  // acopla el editor/importador a columnas de otros modulos que pueden estar
  // pendientes de migrar durante un despliegue gradual.
  const producto = await prisma.producto.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!producto) throw new Error('Producto no encontrado');

  const {
    tallerId = null,
    margenTransferencia = 35,
    ajusteGlobalPct = 0,
    accesoriosMonto = 0,
    materialesMonto = 0,
    notas = null,
    materiales = [],
    procesos = [],
  } = data || {};

  // Validate XOR rule for materiales: exactly one of bodegaTallerId OR telaId
  for (const m of materiales) {
    const hasBodega = m.bodegaTallerId !== undefined && m.bodegaTallerId !== null;
    const hasTela = m.telaId !== undefined && m.telaId !== null;
    if ((hasBodega && hasTela) || (!hasBodega && !hasTela)) {
      throw new Error('Cada linea de material debe tener exactamente uno entre bodegaTallerId y telaId');
    }
  }

  return prisma.$transaction(async (tx) => {
    await lockProductoCosteo(tx, id);
    // Check if recipe exists
    const existingReceta = await tx.productoReceta.findUnique({
      where: { productoId: id },
    });

    let receta;
    if (existingReceta) {
      receta = await tx.productoReceta.update({
        where: { id: existingReceta.id },
        data: {
          tallerId: tallerId ? parseInt(tallerId, 10) : null,
          margenTransferencia: Number(margenTransferencia) || 0,
          ajusteGlobalPct: Number(ajusteGlobalPct) || 0,
          accesoriosMonto: Number(accesoriosMonto) || 0,
          materialesMonto: Number(materialesMonto) || 0,
          notas,
          activo: true,
        },
      });

      // Clear existing lines
      await tx.recetaMaterial.deleteMany({ where: { recetaId: receta.id } });
      await tx.recetaProceso.deleteMany({ where: { recetaId: receta.id } });
    } else {
      receta = await tx.productoReceta.create({
        data: {
          productoId: id,
          tallerId: tallerId ? parseInt(tallerId, 10) : null,
          margenTransferencia: Number(margenTransferencia) || 0,
          ajusteGlobalPct: Number(ajusteGlobalPct) || 0,
          accesoriosMonto: Number(accesoriosMonto) || 0,
          materialesMonto: Number(materialesMonto) || 0,
          notas,
          activo: true,
        },
      });
    }

    // Insert new materials
    if (materiales.length > 0) {
      await tx.recetaMaterial.createMany({
        data: materiales.map((m) => ({
          recetaId: receta.id,
          bodegaTallerId: m.bodegaTallerId ? parseInt(m.bodegaTallerId, 10) : null,
          telaId: m.telaId ? parseInt(m.telaId, 10) : null,
          cantidad: Number(m.cantidad) || 0,
          unidad: m.unidad || null,
          notas: m.notas || null,
        })),
      });
    }

    // Insert new processes
    if (procesos.length > 0) {
      await tx.recetaProceso.createMany({
        data: procesos.map((p) => ({
          recetaId: receta.id,
          tallerId: parseInt(p.tallerId, 10),
          proceso: String(p.proceso).trim().toLowerCase(),
          horas: Number(p.horas) || 0,
        })),
      });
    }

    return tx.productoReceta.findUnique({
      where: { id: receta.id },
      include: {
        materiales: { include: { material: true, tela: true } },
        procesos: { include: { taller: true } },
        taller: true,
      },
    });
  });
}

export async function disableReceta(prisma, productoId) {
  const id = parseInt(productoId, 10);
  const receta = await prisma.productoReceta.findUnique({ where: { productoId: id } });
  if (!receta) throw new Error('Receta no encontrada');

  return prisma.productoReceta.update({
    where: { id: receta.id },
    data: { activo: false },
  });
}

export async function calcularCosteoProducto(prisma, productoId) {
  const id = parseInt(productoId, 10);
  const producto = await prisma.producto.findUnique({
    where: { id },
    select: {
      id: true,
      codigoInterno: true,
      nombre: true,
      precioLista: true,
      receta: {
        include: {
          materiales: { include: { material: true, tela: true } },
          procesos: true,
        },
      },
    },
  });

  if (!producto) throw new Error('Producto no encontrado');
  if (!producto.receta || !producto.receta.activo) {
    throw new Error('El producto no tiene una receta activa registrada');
  }

  const { receta } = producto;

  // Resolve current rates for processes
  const tarifasVigentes = await getTarifas(prisma, { historico: false });
  const tarifasMap = new Map();
  for (const t of tarifasVigentes) {
    tarifasMap.set(`${t.tallerId}_${t.proceso.toLowerCase()}`, t.valorHora);
  }

  // Build inputs for engine
  const materialesInput = receta.materiales.map((m) => {
    let precioUnitario = 0;
    let nombre = 'Material';
    let unidad = m.unidad || null;

    if (m.material) {
      precioUnitario = m.material.precio || 0;
      nombre = m.material.nombre;
      if (!unidad) unidad = m.material.unidadMedida;
    } else if (m.tela) {
      precioUnitario = m.tela.precio || 0;
      nombre = m.tela.nombre || `Tela ${m.tela.codigo}`;
      if (!unidad) unidad = 'm';
    }

    return {
      bodegaTallerId: m.bodegaTallerId,
      telaId: m.telaId,
      nombre,
      unidad,
      cantidad: m.cantidad,
      precioUnitario,
    };
  });

  const procesosInput = receta.procesos.map((p) => {
    const key = `${p.tallerId}_${p.proceso.toLowerCase()}`;
    const valorHora = tarifasMap.get(key) || 0;

    return {
      tallerId: p.tallerId,
      proceso: p.proceso,
      horas: p.horas,
      valorHora,
    };
  });

  // El monto importado del Excel entra como una linea mas de material, para que
  // el motor no tenga que saber de donde vino y quede visible en el desglose.
  const materialesConImportado = receta.materialesMonto > 0
    ? [...materialesInput, { nombre: 'Materiales (importado del Excel, sin desglose)', cantidad: 1, precioUnitario: receta.materialesMonto, unidad: null }]
    : materialesInput;

  const costeoResult = calcularCosteo({
    materiales: materialesConImportado,
    procesos: procesosInput,
    accesoriosMonto: receta.accesoriosMonto,
    ajusteGlobalPct: receta.ajusteGlobalPct,
    margenTransferencia: receta.margenTransferencia,
  });

  return {
    productoId: producto.id,
    codigoInterno: producto.codigoInterno,
    nombre: producto.nombre,
    precioListaActual: producto.precioLista,
    costoTransferenciaCalculado: costeoResult.costoTransferencia,
    diferenciaMonto: costeoResult.costoTransferencia - producto.precioLista,
    alertas: getCosteoBlockers({ materiales: materialesConImportado, procesos: procesosInput }),
    ...costeoResult,
  };
}

export async function aplicarCosteoProducto(prisma, productoId, user) {
  return prisma.$transaction(async (tx) => {
    const id = parseInt(productoId, 10);
    await lockProductoCosteo(tx, id);
    // El cálculo se hace dentro de la misma transacción protegida que crea el
    // snapshot y actualiza el precio: no se aplica una receta leída antes de
    // que otro usuario la modifique.
    const calculation = await calcularCosteoProducto(tx, id);
    throwCosteoIncompleto(calculation.alertas);

    const snapshot = await tx.costeoSnapshot.create({
      data: {
        productoId: calculation.productoId,
        costoMateriales: calculation.costoMateriales,
        costoManoObra: calculation.costoManoObra,
        costoAccesorios: calculation.costoAccesorios,
        costoFabricacion: calculation.costoFabricacion,
        ajusteGlobalPct: calculation.ajusteGlobalPct,
        costoAjustado: calculation.costoAjustado,
        margenTransferencia: calculation.margenTransferencia,
        costoTransferencia: calculation.costoTransferencia,
        precioListaAnterior: calculation.precioListaActual,
        aplicado: true,
        detalle: calculation.detalle,
        userId: user?.id ?? null,
        userNombre: user?.nombre ?? null,
      },
    });

    const productoActualizado = await tx.producto.update({
      where: { id: calculation.productoId },
      data: { precioLista: calculation.costoTransferencia },
      select: {
        id: true,
        codigoInterno: true,
        nombre: true,
        precioLista: true,
      },
    });

    return {
      snapshot,
      producto: productoActualizado,
    };
  });
}

export async function getSnapshots(prisma, { productoId } = {}) {
  const where = {};
  if (productoId) where.productoId = parseInt(productoId, 10);

  return prisma.costeoSnapshot.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      producto: {
        select: { id: true, codigoInterno: true, nombre: true },
      },
    },
  });
}

export async function recalcularMasivo(prisma, { tallerId, productoIds, aplicar = false } = {}, user) {
  // Relacion to-one: los filtros de campo van dentro de `is`. Combinar
  // `isNot: null` con campos sueltos es invalido y Prisma tira
  // "Unknown argument `activo`", lo que hacia fallar todo el endpoint con 400.
  const recetaFiltro = { activo: true };
  if (tallerId) recetaFiltro.tallerId = parseInt(tallerId, 10);
  const where = { activo: true, receta: { is: recetaFiltro } };
  if (Array.isArray(productoIds) && productoIds.length > 0) {
    if (productoIds.length > 500) {
      throw new Error('Maximo 500 productos por llamada de recálculo masivo');
    }
    where.id = { in: productoIds.map((id) => parseInt(id, 10)) };
  }

  const productos = await prisma.producto.findMany({
    where,
    select: { id: true },
    take: 500,
  });

  const resultados = [];

  for (const p of productos) {
    try {
      if (aplicar) {
        const res = await aplicarCosteoProducto(prisma, p.id, user);
        resultados.push({
          productoId: p.id,
          aplicado: true,
          precioAnterior: res.snapshot.precioListaAnterior,
          precioNuevo: res.producto.precioLista,
          diferencia: res.producto.precioLista - (res.snapshot.precioListaAnterior || 0),
        });
      } else {
        const calc = await calcularCosteoProducto(prisma, p.id);
        resultados.push({
          productoId: p.id,
          codigoInterno: calc.codigoInterno,
          nombre: calc.nombre,
          precioActual: calc.precioListaActual,
          precioCalculado: calc.costoTransferenciaCalculado,
          diferencia: calc.diferenciaMonto,
        });
      }
    } catch (e) {
      resultados.push({
        productoId: p.id,
        error: e.message,
      });
    }
  }

  return {
    totalProcesados: resultados.length,
    aplicado: Boolean(aplicar),
    resultados,
  };
}
