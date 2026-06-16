import { resolveOdtForWrite } from '../relation-guards.js';

export function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parsePositiveInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getRequestUsuario(user) {
  return cleanText(user?.nombre) || cleanText(user?.email);
}

export function buildObs(item) {
  const descripcion = cleanText(item.descripcion);
  const obs = cleanText(item.obs);
  if (descripcion && obs && descripcion !== obs) return `${descripcion}\n${obs}`;
  return obs || descripcion;
}

export function normalizePrioridad(value, fallback = 'normal') {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  if (['alta', 'media', 'baja', 'normal', 'urgente'].includes(normalized)) return normalized;
  if (normalized === 'emergencia') return 'urgente';
  return fallback;
}

export function isOrdenActiva(orden) {
  return orden && !orden.eliminada && normalizeText(orden.estado || 'Activa') === 'activa';
}

export function isOdtWritable(odt) {
  const estado = normalizeText(odt?.estado || 'Pendiente');
  return !odt?.eliminado && !['anulada', 'terminada', 'entregada'].includes(estado);
}

export function isProductoTransitorio(producto) {
  return normalizeText(producto?.estadoInventario) === 'transitorio';
}

export function tallerKind(nombre) {
  const normalized = normalizeText(nombre);
  if (normalized.includes('confe')) return 'confecciones';
  if (normalized.includes('espuma')) return 'espumas';
  if (normalized.includes('madera') || normalized.includes('externo')) return 'externo';
  return normalized;
}

export function tallerLabel(taller) {
  const kind = tallerKind(taller?.nombre);
  if (kind === 'externo') return 'Madera';
  if (kind === 'confecciones') return 'Confecciones';
  if (kind === 'espumas') return 'Espumas';
  return taller?.nombre || '';
}

export function selectPrimaryTipo(talleres = []) {
  const kinds = talleres.map(t => tallerKind(t.nombre));
  if (kinds.includes('espumas')) return 'Espumas';
  if (kinds.includes('confecciones')) return 'Confecciones';
  if (kinds.includes('externo')) return 'Madera';
  return 'Espumas';
}

export async function ensureOdt(tx, { existingOdt, orden, cliente, talleres, prioridad, obsGeneral, user, fechaEntregaCompromiso }) {
  const usuario = getRequestUsuario(user) || 'Sistema';
  const prioridadFinal = normalizePrioridad(prioridad, existingOdt?.prioridad || 'normal');
  const obsFinal = cleanText(obsGeneral);

  if (existingOdt) {
    const data = {};
    if (prioridad !== undefined) data.prioridad = prioridadFinal;
    if (obsGeneral !== undefined) data.obsGeneral = obsFinal;
    if (talleres?.length) data.tipo = selectPrimaryTipo(talleres);
    if (fechaEntregaCompromiso !== undefined) data.fechaEntregaCompromiso = fechaEntregaCompromiso ? new Date(fechaEntregaCompromiso) : null;
    if (Object.keys(data).length) {
      return tx.odt.update({ where: { id: existingOdt.id }, data });
    }
    return existingOdt;
  }

  const descripcion = `OT Taller venta ${orden.nInterno || orden.id}`;
  const odt = await tx.odt.create({
    data: {
      ordenId: orden.id,
      sucursalId: orden.sucursalId ?? user?.sucursalId ?? null,
      tipo: selectPrimaryTipo(talleres),
      clienteNombre: cliente?.razonSocial || cliente?.nombre || orden.rutCliente || null,
      descripcion,
      obsGeneral: obsFinal || 'No hay',
      prioridad: prioridadFinal,
      estado: 'Pendiente',
      fechaIngreso: new Date(),
      fechaEntregaCompromiso: fechaEntregaCompromiso ? new Date(fechaEntregaCompromiso) : null,
    },
  });
  if (usuario) {
    await tx.bitacoraTaller.create({
      data: {
        odtId: odt.id,
        usuario,
        usuarioReporta: usuario,
        sucursalId: odt.sucursalId,
        fecha: new Date(),
        texto: `OT creada desde Pasar a Taller para venta ${orden.nInterno || orden.id}`,
      },
    });
  }
  return odt;
}

export async function lockOrdenPasarTaller(tx, ordenId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260530, ${ordenId})`;
}

export async function upsertOdtItem(tx, { odt, ordenItem, producto, payloadItem, tallerIds, user }) {
  const usuario = getRequestUsuario(user) || 'Sistema';
  const cantidad = parsePositiveInt(payloadItem.cantidad) || Number(ordenItem.cantidad || 0);
  if (!cantidad || cantidad <= 0) return { error: 'cantidad debe ser un entero mayor a 0' };
  if (cantidad > Number(ordenItem.cantidad || 0)) return { error: 'cantidad no puede superar la cantidad vendida' };

  const codigoInterno = ordenItem.codigoInterno || producto?.codigoInterno || cleanText(payloadItem.codigoInterno);
  const nombre = ordenItem.nombre || producto?.nombre || cleanText(payloadItem.nombre);
  const obs = buildObs({ ...payloadItem, descripcion: payloadItem.descripcion ?? ordenItem.descripcion });

  let odtItem = await tx.odtItem.findFirst({
    where: {
      odtId: odt.id,
      eliminado: false,
      OR: [
        ...(codigoInterno ? [{ codigoInterno }] : []),
        { productoId: ordenItem.productoId },
      ],
    },
    include: { talleres: true },
  });

  const data = {
    odtId: odt.id,
    productoId: ordenItem.productoId,
    codigoInterno,
    nombre,
    cantidad,
    obs,
    usuario,
  };

  if (odtItem) {
    odtItem = await tx.odtItem.update({
      where: { id: odtItem.id },
      data,
      include: { talleres: true },
    });
  } else {
    odtItem = await tx.odtItem.create({
      data: { ...data, estado: 'pendiente' },
      include: { talleres: true },
    });
  }

  const selected = new Set(tallerIds);
  const current = await tx.odtItemTaller.findMany({ where: { odtItemId: odtItem.id } });
  const toRemove = current.filter(rel => !selected.has(rel.tallerId));
  const locked = toRemove.filter(rel => normalizeText(rel.estado || 'pendiente') !== 'pendiente');
  if (locked.length) {
    return { error: 'No se puede quitar un taller con trabajo iniciado/listo; cambie su estado desde la ODT' };
  }
  if (toRemove.length) {
    await tx.odtItemTaller.deleteMany({
      where: { id: { in: toRemove.map(rel => rel.id) } },
    });
  }

  for (const tallerId of tallerIds) {
    await tx.odtItemTaller.upsert({
      where: { odtItemId_tallerId: { odtItemId: odtItem.id, tallerId } },
      update: { obs, usuario },
      create: {
        odtItemId: odtItem.id,
        tallerId,
        obs,
        usuario,
      },
    });
  }

  await tx.bitacoraTaller.create({
    data: {
      odtId: odt.id,
      usuario,
      usuarioReporta: usuario,
      sucursalId: odt.sucursalId ?? null,
      fecha: new Date(),
      texto: `Producto enviado/actualizado en taller: ${[codigoInterno, nombre].filter(Boolean).join(' - ')} x${cantidad}`,
    },
  });

  return { odtItem };
}

export function resolveTallerIdsFromItem(item, talleres) {
  const byId = new Map(talleres.map(t => [t.id, t]));
  const byKind = new Map();
  for (const taller of talleres) byKind.set(tallerKind(taller.nombre), taller);

  const rawIds = [];
  if (Array.isArray(item.tallerIds)) rawIds.push(...item.tallerIds);
  if (item.tallerId !== undefined && item.tallerId !== null && item.tallerId !== '') rawIds.push(item.tallerId);

  const ids = new Set();
  for (const raw of rawIds) {
    const id = parsePositiveInt(raw);
    if (id && byId.has(id)) ids.add(id);
  }

  const names = [];
  if (Array.isArray(item.talleres)) names.push(...item.talleres);
  if (item.confecciones) names.push('confecciones');
  if (item.espumas) names.push('espumas');
  if (item.externo || item.madera) names.push('externo');

  for (const name of names) {
    const kind = tallerKind(name);
    const taller = byKind.get(kind) || (kind === 'madera' ? byKind.get('externo') : null);
    if (taller) ids.add(taller.id);
  }

  return { ids: [...ids] };
}

/**
 * Auto-notification from create/update routes.
 * Scans if there are transitorio items and creates/updates corresponding ODTs.
 */
export async function autoNotifyTaller(tx, ordenId, user, logger = console) {
  // Lock order to prevent concurrency
  await lockOrdenPasarTaller(tx, ordenId);

  const orden = await tx.orden.findFirst({
    where: { id: ordenId },
    include: {
      items: { where: { eliminado: false } }
    }
  });

  if (!orden || orden.eliminada || normalizeText(orden.estado) !== 'activa') {
    return;
  }

  // Find active talleres
  const talleres = await tx.taller.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  if (!talleres.length) return;

  const productIds = orden.items.map(item => item.productoId).filter(Boolean);
  if (!productIds.length) return;

  const productos = await tx.producto.findMany({
    where: { id: { in: productIds } }
  });
  const productosMap = Object.fromEntries(productos.map(p => [p.id, p]));

  // Filter for transitorio items with pending dispatch
  const transitorioEntries = orden.items
    .map(item => {
      const producto = productosMap[item.productoId];
      return { item, producto };
    })
    .filter(({ item, producto }) => {
      return producto && isProductoTransitorio(producto) && Number(item.nEntregados || 0) < Number(item.cantidad || 0);
    });

  if (!transitorioEntries.length) return;

  // Find existing ODT for this order
  let odt = await tx.odt.findFirst({
    where: { ordenId: orden.id, eliminado: false },
    orderBy: { createdAt: 'asc' }
  });

  if (odt && !isOdtWritable(odt)) {
    return; // ODT closed or cancelled
  }

  // Get client info
  let cliente = null;
  if (orden.clienteId) {
    cliente = await tx.cliente.findUnique({
      where: { id: orden.clienteId },
      select: { id: true, nombre: true, razonSocial: true, rut: true }
    });
  }

  // Gather default talleres for items
  const prepared = [];
  const byKind = new Map(talleres.map(t => [tallerKind(t.nombre), t]));

  for (const entry of transitorioEntries) {
    const { item, producto } = entry;
    const itemTallerIds = new Set();

    // 1. If product has explicit tallerId, use it
    if (producto.tallerId) {
      itemTallerIds.add(producto.tallerId);
    } else {
      // 2. Otherwise try to map by product name or kind
      const kind = tallerKind(producto.nombre);
      const matched = byKind.get(kind) || (kind === 'madera' ? byKind.get('externo') : null);
      if (matched) {
        itemTallerIds.add(matched.id);
      } else {
        // Fallback: use the first active workshop or Espumas
        const defaultTaller = byKind.get('espumas') || talleres[0];
        if (defaultTaller) {
          itemTallerIds.add(defaultTaller.id);
        }
      }
    }

    if (itemTallerIds.size > 0) {
      prepared.push({
        ordenItem: item,
        producto,
        payloadItem: {
          cantidad: Math.max(0, Number(item.cantidad || 0) - Number(item.nEntregados || 0)),
          descripcion: item.descripcion || '',
          obs: item.descripcion || '',
        },
        tallerIds: [...itemTallerIds]
      });
    }
  }

  if (!prepared.length) return;

  const selectedTallerIds = new Set(prepared.flatMap(entry => entry.tallerIds));
  const selectedTalleres = talleres.filter(taller => selectedTallerIds.has(taller.id));

  // Ensure ODT exists, passing the fechaPlazo from Orden as the delivery commitment date (fechaEntregaCompromiso)
  odt = await ensureOdt(tx, {
    existingOdt: odt,
    orden,
    cliente,
    talleres: selectedTalleres,
    prioridad: 'normal',
    obsGeneral: orden.observaciones || '',
    user,
    fechaEntregaCompromiso: orden.fechaPlazo
  });

  // Upsert ODT items. No lanzamos en caso de error de un item para no abortar
  // la transaccion de la venta (autoNotifyTaller corre dentro de create/update venta),
  // pero dejamos rastro: un item que no llega a taller seria invisible de otro modo.
  for (const entry of prepared) {
    const saved = await upsertOdtItem(tx, { odt, ...entry, user });
    if (saved?.error) {
      logger.warn(
        `autoNotifyTaller: no se pudo enviar a taller el producto ${entry.producto?.codigoInterno || entry.producto?.id} ` +
        `(orden ${orden.nInterno || orden.id}, odt ${odt.id}): ${saved.error}`
      );
    }
  }
}
