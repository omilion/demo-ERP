import { useState, useEffect, useMemo } from 'react';
import { useReceta, useUpdateReceta, useAplicarCosteo, useCosteoBorrador, useProcesosCosteo } from '../../../api/costeo';
import { useBodegaTaller } from '../../../api/bodegaTaller';
import { useTelas } from '../../../api/telas';
import { useTalleres } from '../../../api/pasarTaller';
import { toast, confirmDialog } from '../../../store/notif';
import { Badge, Btn, Icon } from '../../../components/shared';

const CALCULO_VACIO = {
  costoMateriales: 0, costoManoObra: 0, costoAccesorios: 0, costoFabricacion: 0,
  costoAjustado: 0, costoTransferencia: 0, avisos: [], detalle: { materiales: [], procesos: [] },
};

export function EditorRecetaModal({ producto, isOpen, onClose }) {
  const { data: recetaData } = useReceta(producto?.id);
  const { data: materialesBodega = [] } = useBodegaTaller();
  const { data: telas = [] } = useTelas();
  const { data: procesosCatalogo = [] } = useProcesosCosteo();
  const { data: talleresData } = useTalleres();
  const talleres = Array.isArray(talleresData) ? talleresData : (talleresData?.data || talleresData?.items || []);

  const updateReceta = useUpdateReceta();
  const aplicarCosteo = useAplicarCosteo();

  const [tallerId, setTallerId] = useState(producto?.tallerId || '');
  const [margenTransferencia, setMargenTransferencia] = useState(35);
  const [ajusteGlobalPct, setAjusteGlobalPct] = useState(3);
  const [accesoriosMonto, setAccesoriosMonto] = useState(0);
  // Monto de materiales importado del Excel de MK, sin desglose por linea. El
  // editor lo tiene que conservar: al no enviarlo, cada guardado lo dejaba en 0
  // y la receta perdia en silencio la mayor parte de su costo.
  const [materialesMonto, setMaterialesMonto] = useState(0);
  const [notas, setNotas] = useState('');

  const [materiales, setMateriales] = useState([]);
  const [procesos, setProcesos] = useState([]);

  // Load existing recipe data when loaded
  useEffect(() => {
    if (recetaData?.receta) {
      const r = recetaData.receta;
      // The editor form is intentionally hydrated when the remote recipe changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTallerId(r.tallerId || producto?.tallerId || '');
      setMargenTransferencia(r.margenTransferencia ?? 35);
      setAjusteGlobalPct(r.ajusteGlobalPct ?? 3);
      setAccesoriosMonto(r.accesoriosMonto ?? 0);
      setMaterialesMonto(r.materialesMonto ?? 0);
      setNotas(r.notas || '');

      setMateriales(
        (r.materiales || []).map((m) => ({
          bodegaTallerId: m.bodegaTallerId,
          telaId: m.telaId,
          cantidad: m.cantidad || 0,
          unidad: m.unidad || (m.material?.unidadMedida || (m.tela ? 'm' : '')),
          notas: m.notas || '',
        }))
      );

      setProcesos(
        (r.procesos || []).map((p) => ({
          tallerId: p.tallerId,
          proceso: p.proceso,
          horas: p.horas || 0,
        }))
      );
    }
  }, [recetaData, producto]);

  // El desglose lo calcula el servidor: mismo motor, mismos precios y mismas
  // tarifas que al aplicar. Cuando el navegador tenia su propia copia del motor,
  // preview y valor aplicado podian diferir sin que nada lo indicara.
  const borrador = useMemo(() => ({
    materiales: materiales.map((m) => ({
      bodegaTallerId: m.bodegaTallerId || null,
      telaId: m.telaId || null,
      cantidad: Number(m.cantidad) || 0,
      unidad: m.unidad || null,
    })),
    procesos: procesos.map((p) => ({
      tallerId: p.tallerId || tallerId || null,
      proceso: p.proceso,
      horas: Number(p.horas) || 0,
    })),
    accesoriosMonto: Number(accesoriosMonto) || 0,
    materialesMonto: Number(materialesMonto) || 0,
    ajusteGlobalPct: Number(ajusteGlobalPct) || 0,
    margenTransferencia: Number(margenTransferencia) || 0,
  }), [materiales, procesos, tallerId, accesoriosMonto, materialesMonto, ajusteGlobalPct, margenTransferencia]);

  const [borradorDebounced, setBorradorDebounced] = useState(borrador);
  useEffect(() => {
    const timer = setTimeout(() => setBorradorDebounced(borrador), 300);
    return () => clearTimeout(timer);
  }, [borrador]);

  const { data: calculoServidor, isFetching: calculando } = useCosteoBorrador(borradorDebounced, isOpen);
  const liveCalculation = calculoServidor || CALCULO_VACIO;
  const avisos = liveCalculation.avisos || [];
  const detalleMateriales = liveCalculation.detalle?.materiales || [];
  const detalleProcesos = liveCalculation.detalle?.procesos || [];

  // El proceso que ya tiene la receta se ofrece aunque no este en el catalogo:
  // de lo contrario el <select> se abria en blanco y al guardar lo reescribia
  // con otro proceso distinto del que la receta tenia.
  const opcionesProceso = useMemo(() => {
    const catalogo = Array.isArray(procesosCatalogo) ? procesosCatalogo : [];
    const extras = procesos
      .map((p) => p.proceso)
      .filter((nombre) => nombre && !catalogo.some((c) => c.id === nombre))
      .map((nombre) => ({ id: nombre, label: `${nombre} (fuera del catálogo)` }));
    return [...catalogo, ...new Map(extras.map((e) => [e.id, e])).values()];
  }, [procesosCatalogo, procesos]);

  const diferencia = liveCalculation.costoTransferencia - (producto?.precioLista || 0);
  const pctDiferencia = producto?.precioLista
    ? ((diferencia / producto.precioLista) * 100).toFixed(1)
    : 0;
  const alertasCosteo = useMemo(() => ({
    materialesSinPrecio: detalleMateriales.filter(item => Number(item.cantidad) > 0 && Number(item.precioUnitario) <= 0),
    procesosSinTarifa: detalleProcesos.filter(item => Number(item.horas) > 0 && Number(item.valorHora) <= 0),
  }), [detalleMateriales, detalleProcesos]);
  const costeoIncompleto = alertasCosteo.materialesSinPrecio.length > 0 || alertasCosteo.procesosSinTarifa.length > 0;

  // Handlers for dynamic material rows
  const addMaterialRow = (type) => {
    if (type === 'bodega') {
      const items = Array.isArray(materialesBodega) ? materialesBodega : (materialesBodega?.items || materialesBodega?.data || []);
      const first = items[0];
      if (!first) {
        toast.error('No hay materias primas registradas en Bodega Taller');
        return;
      }
      setMateriales([
        ...materiales,
        { bodegaTallerId: first.id, telaId: null, cantidad: 1, unidad: first.unidadMedida || 'u' },
      ]);
    } else {
      const telasItems = Array.isArray(telas) ? telas : (telas?.data || []);
      const first = telasItems[0];
      if (!first) {
        toast.error('No hay telas registradas');
        return;
      }
      setMateriales([
        ...materiales,
        { bodegaTallerId: null, telaId: first.id, cantidad: 1, unidad: 'm' },
      ]);
    }
  };

  const updateMaterialRow = (index, field, value) => {
    const copy = [...materiales];
    copy[index] = { ...copy[index], [field]: value };
    setMateriales(copy);
  };

  const removeMaterialRow = (index) => {
    setMateriales(materiales.filter((_, i) => i !== index));
  };

  // Handlers for dynamic process rows
  const addProcesoRow = () => {
    if (!tallerId) {
      toast.warning('Selecciona primero el taller asignado');
      return;
    }
    setProcesos([
      ...procesos,
      { tallerId, proceso: 'confeccion', horas: 1.0 },
    ]);
  };

  const updateProcesoRow = (index, field, value) => {
    const copy = [...procesos];
    copy[index] = { ...copy[index], [field]: value };
    setProcesos(copy);
  };

  const removeProcesoRow = (index) => {
    setProcesos(procesos.filter((_, i) => i !== index));
  };

  const handleSaveReceta = async () => {
    if (!tallerId) {
      toast.warning('Selecciona el taller asignado');
      return;
    }
    try {
      await updateReceta.mutateAsync({
        productoId: producto.id,
        data: {
          tallerId: Number(tallerId),
          margenTransferencia: Number(margenTransferencia),
          ajusteGlobalPct: Number(ajusteGlobalPct),
          accesoriosMonto: Number(accesoriosMonto),
          materialesMonto: Number(materialesMonto) || 0,
          notas,
          materiales,
          procesos,
        },
      });
      toast.success('Receta guardada exitosamente');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Error al guardar la receta');
    }
  };

  const handleAplicarCosteo = async () => {
    if (!tallerId) {
      toast.warning('Selecciona el taller asignado');
      return;
    }
    if (costeoIncompleto) {
      toast.warning('No se puede aplicar: corrige los materiales sin precio o los procesos sin tarifa vigente.');
      return;
    }
    // Aplicar reescribe el precio de venta del catalogo: si el calculo trae
    // ceros por falta de tarifa o de material, eso tiene que decirse ANTES.
    const advertencia = avisos.length
      ? `

ATENCION: ${avisos.map((a) => a.detalle).join(' · ')}`
      : '';
    const ok = await confirmDialog(
      `¿Confirmas aplicar el nuevo costo de transferencia ($${liveCalculation.costoTransferencia.toLocaleString('es-CL')}) a la lista de precios? El precio actual ($${(producto.precioLista || 0).toLocaleString('es-CL')}) se actualizará y quedará registrado inmutablemente.${advertencia}`
    );
    if (!ok) return;

    try {
      // First save recipe changes if any
      await updateReceta.mutateAsync({
        productoId: producto.id,
        data: {
          tallerId: Number(tallerId),
          margenTransferencia: Number(margenTransferencia),
          ajusteGlobalPct: Number(ajusteGlobalPct),
          accesoriosMonto: Number(accesoriosMonto),
          materialesMonto: Number(materialesMonto) || 0,
          notas,
          materiales,
          procesos,
        },
      });

      await aplicarCosteo.mutateAsync(producto.id);
      toast.success('Snapshot generado y precio lista actualizado correctamente');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Error al aplicar el costeo');
    }
  };

  const itemsBodega = Array.isArray(materialesBodega) ? materialesBodega : (materialesBodega?.items || materialesBodega?.data || []);
  const itemsTelas = Array.isArray(telas) ? telas : (telas?.data || []);

  if (!isOpen || !producto) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Editor de Receta (BOM)</h2>
              <Badge tone="blue">{producto.codigoInterno}</Badge>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>{producto.nombre}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Content Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          
          {/* Left Form: Components & Processes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* General parameters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: 'var(--bg-1)', padding: 14, borderRadius: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Taller Asignado</label>
                <select value={tallerId} onChange={(e) => setTallerId(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}>
                  <option value="">Selecciona un taller</option>
                  {talleres.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.label || t.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Margen Transferencia (%)</label>
                <input
                  type="number"
                  value={margenTransferencia}
                  onChange={(e) => setMargenTransferencia(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>Ajuste Global (%)</label>
                <input
                  type="number"
                  value={ajusteGlobalPct}
                  onChange={(e) => setAjusteGlobalPct(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>
            </div>

            {/* Materials List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>1. Materias Primas e Insumos</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="xs" variant="secondary" onClick={() => addMaterialRow('bodega')}>
                    + Insumo Bodega
                  </Btn>
                  <Btn size="xs" variant="secondary" onClick={() => addMaterialRow('tela')}>
                    + Tela
                  </Btn>
                </div>
              </div>

              {materiales.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)' }}>
                  No se han añadido componentes. Presiona los botones superiores para agregar insumos.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {materiales.map((row, idx) => {
                    const engineMat = detalleMateriales[idx];
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px 30px', gap: 8, alignItems: 'center', background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        {row.bodegaTallerId !== null ? (
                          <select
                            value={row.bodegaTallerId}
                            onChange={(e) => updateMaterialRow(idx, 'bodegaTallerId', Number(e.target.value))}
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                          >
                            {itemsBodega.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.nombre}{b.densidadKgM3 != null ? ` · ${b.densidadKgM3} kg/m³` : ''} (${(b.precio || 0).toLocaleString('es-CL')})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={row.telaId}
                            onChange={(e) => updateMaterialRow(idx, 'telaId', Number(e.target.value))}
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                          >
                            {itemsTelas.map((t) => (
                              <option key={t.id} value={t.id}>
                                Tela {t.codigo} - {t.nombre} (${(t.precio || 0).toLocaleString('es-CL')})
                              </option>
                            ))}
                          </select>
                        )}

                        <input
                          type="number"
                          step="0.01"
                          value={row.cantidad}
                          onChange={(e) => updateMaterialRow(idx, 'cantidad', e.target.value)}
                          placeholder="Cant."
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                        />

                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{engineMat?.unidad || 'un'}</span>

                        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                          ${(Number(engineMat?.cantidad || 0) * Number(engineMat?.precioUnitario || 0)).toLocaleString('es-CL')}
                        </div>

                        <button onClick={() => removeMaterialRow(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--red-600)' }}>
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Processes List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>2. Mano de Obra y Procesos</h3>
                <Btn size="xs" variant="secondary" onClick={addProcesoRow}>
                  + Proceso
                </Btn>
              </div>

              {procesos.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)' }}>
                  Sin procesos agregados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {procesos.map((row, idx) => {
                    const engineProc = detalleProcesos[idx];
                    const sinTarifa = engineProc && !engineProc.valorHora;
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 30px', gap: 8, alignItems: 'center', background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <select
                          value={row.proceso}
                          onChange={(e) => updateProcesoRow(idx, 'proceso', e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                        >
                          {opcionesProceso.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>

                        <input
                          type="number"
                          step="0.1"
                          value={row.horas}
                          onChange={(e) => updateProcesoRow(idx, 'horas', e.target.value)}
                          placeholder="Horas"
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                        />

                        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: sinTarifa ? 'var(--red)' : undefined }}>
                          {sinTarifa
                            ? <span title="Sin tarifa vigente para este proceso en este taller">$0 · sin tarifa</span>
                            : `$${(engineProc?.subtotal || 0).toLocaleString('es-CL')}`}
                        </div>

                        <button onClick={() => removeProcesoRow(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--red-600)' }}>
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Accessories */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Monto Accesorios ($)</label>
              <input
                type="number"
                value={accesoriosMonto}
                onChange={(e) => setAccesoriosMonto(e.target.value)}
                placeholder="0"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
              />
            </div>
          </div>

          {/* Right Panel: Live Calculation & Comparison */}
          <div style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0', borderBottom: '1px solid #cbd5e1', paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Desglose en Vivo</span>
                {calculando && <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>calculando…</span>}
              </h3>

              {costeoIncompleto && (
                <section role="alert" style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #f2c66d', borderRadius: 8, background: '#fff9eb', color: 'var(--text-1)', fontSize: 12, lineHeight: 1.45 }}>
                  <strong>Costeo incompleto: no se podrá aplicar al precio lista.</strong>
                  {alertasCosteo.materialesSinPrecio.length > 0 && <div>Materiales sin precio: {alertasCosteo.materialesSinPrecio.map(item => item.nombre).join(', ')}.</div>}
                  {alertasCosteo.procesosSinTarifa.length > 0 && <div>Procesos sin tarifa: {alertasCosteo.procesosSinTarifa.map(item => item.proceso).join(', ')}.</div>}
                </section>
              )}
              {avisos.length > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5' }}>
                  {avisos.map((aviso, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#991b1b' }}>{aviso.detalle}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Coste Materiales:</span>
                  <span style={{ fontWeight: 600 }}>${liveCalculation.costoMateriales.toLocaleString('es-CL')}</span>
                </div>

                {Number(materialesMonto) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                    <span>· de ellos, monto importado del Excel:</span>
                    <span>${Number(materialesMonto).toLocaleString('es-CL')}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Mano de Obra:</span>
                  <span style={{ fontWeight: 600 }}>${liveCalculation.costoManoObra.toLocaleString('es-CL')}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Accesorios:</span>
                  <span style={{ fontWeight: 600 }}>${liveCalculation.costoAccesorios.toLocaleString('es-CL')}</span>
                </div>

                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Costo Fabricación:</span>
                  <span>${liveCalculation.costoFabricacion.toLocaleString('es-CL')}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>Ajuste Global ({ajusteGlobalPct}%):</span>
                  <span>${liveCalculation.costoAjustado.toLocaleString('es-CL')}</span>
                </div>

                <div style={{ background: '#e0f2fe', padding: 12, borderRadius: 8, marginTop: 10, border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                    Costo Transferencia ({margenTransferencia}%)
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
                    ${liveCalculation.costoTransferencia.toLocaleString('es-CL')}
                  </div>
                </div>

                {/* Comparison against current precioLista */}
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Precio Lista Actual ERP:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                    ${(producto.precioLista || 0).toLocaleString('es-CL')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, fontWeight: 600, color: diferencia >= 0 ? '#16a34a' : '#dc2626' }}>
                    <span>{diferencia >= 0 ? `+ $${diferencia.toLocaleString('es-CL')}` : `- $${Math.abs(diferencia).toLocaleString('es-CL')}`}</span>
                    <span>({pctDiferencia}%)</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              <Btn onClick={handleSaveReceta} variant="secondary" style={{ width: '100%' }}>
                Guardar Borrador Receta
              </Btn>
              <Btn onClick={handleAplicarCosteo} variant="primary" disabled={costeoIncompleto || aplicarCosteo.isPending || updateReceta.isPending} style={{ width: '100%', background: '#0284c7' }}>
                Aplicar a Precio Lista
              </Btn>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
