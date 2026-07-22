/**
 * Motor de cálculo de costeo de fabricación.
 * Función pura (sin I/O ni dependencias externas) para fácil testeo.
 */
export function calcularCosteo({
  materiales = [],
  procesos = [],
  accesoriosMonto = 0,
  ajusteGlobalPct = 0,
  margenTransferencia = 35,
} = {}) {
  const safeAccesorios = Math.max(0, Number(accesoriosMonto) || 0);
  const safeAjustePct = Math.max(0, Number(ajusteGlobalPct) || 0);
  const safeMargenPct = Math.max(0, Number(margenTransferencia) || 0);

  // 1. Costo de materiales
  let costoMaterialesBruto = 0;
  const detalleMateriales = (materiales || []).map((m) => {
    const cantidad = Math.max(0, Number(m.cantidad) || 0);
    const precioUnitario = Math.max(0, Number(m.precioUnitario) || 0);
    const subtotal = cantidad * precioUnitario;
    costoMaterialesBruto += subtotal;
    return {
      bodegaTallerId: m.bodegaTallerId || null,
      telaId: m.telaId || null,
      nombre: m.nombre || 'Material',
      unidad: m.unidad || null,
      cantidad,
      precioUnitario,
      subtotal,
    };
  });

  // 2. Costo de mano de obra
  let costoManoObraBruto = 0;
  const detalleProcesos = (procesos || []).map((p) => {
    const horas = Math.max(0, Number(p.horas) || 0);
    const valorHora = Math.max(0, Number(p.valorHora) || 0);
    const subtotal = horas * valorHora;
    costoManoObraBruto += subtotal;
    return {
      tallerId: p.tallerId || null,
      proceso: p.proceso || 'proceso',
      horas,
      valorHora,
      subtotal,
    };
  });

  // 3. Escalón 1: Costo de Fabricación (Redondeado al final)
  const costoFabricacion = Math.round(
    costoMaterialesBruto + costoManoObraBruto + safeAccesorios
  );

  // 4. Escalón 2: Costo Ajustado (Redondeado al final)
  const costoAjustado = Math.round(
    costoFabricacion * (1 + safeAjustePct / 100)
  );

  // 5. Escalón 3: Costo de Transferencia (Redondeado al final)
  const costoTransferencia = Math.round(
    costoAjustado * (1 + safeMargenPct / 100)
  );

  return {
    costoMateriales: costoMaterialesBruto,
    costoManoObra: costoManoObraBruto,
    costoAccesorios: safeAccesorios,
    costoFabricacion,
    ajusteGlobalPct: safeAjustePct,
    costoAjustado,
    margenTransferencia: safeMargenPct,
    costoTransferencia,
    detalle: {
      materiales: detalleMateriales,
      procesos: detalleProcesos,
      accesoriosMonto: safeAccesorios,
      ajusteGlobalPct: safeAjustePct,
      margenTransferencia: safeMargenPct,
    },
  };
}
