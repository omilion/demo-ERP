import { useState, useEffect, useMemo } from 'react';
import { useReceta, useUpdateReceta, useAplicarCosteo, useTarifas } from '../../../api/costeo';
import { useBodegaTaller } from '../../../api/bodegaTaller';
import { useTelas } from '../../../api/telas';
import { useTalleres } from '../../../api/pasarTaller';
import { calcularCosteo } from '../../../../../backend/src/routes/costeo/engine.js';
import { toast, confirmDialog } from '../../../store/notif';
import { Badge, Btn, Icon } from '../../../components/shared';

const PROCESOS_SUGERIDOS = [
  { id: 'corte', label: 'Corte de espuma' },
  { id: 'confeccion', label: 'Confección' },
  { id: 'enfundado', label: 'Enfundado' },
  { id: 'armado', label: 'Armado / Esquelaje' },
  { id: 'tapizado', label: 'Tapizado' },
];

export function EditorRecetaModal({ producto, isOpen, onClose }) {
  const { data: recetaData } = useReceta(producto?.id);
  const { data: materialesBodega = [] } = useBodegaTaller();
  const { data: telas = [] } = useTelas();
  const { data: tarifasVigentes = [] } = useTarifas();
  const { data: talleresData } = useTalleres();
  const talleres = Array.isArray(talleresData) ? talleresData : (talleresData?.data || talleresData?.items || []);

  const updateReceta = useUpdateReceta();
  const aplicarCosteo = useAplicarCosteo();

  const [tallerId, setTallerId] = useState(producto?.tallerId || '');
  const [margenTransferencia, setMargenTransferencia] = useState(35);
  const [ajusteGlobalPct, setAjusteGlobalPct] = useState(3);
  const [accesoriosMonto, setAccesoriosMonto] = useState(0);
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

  // Lookup map for tariffs
  const tarifasMap = useMemo(() => {
    const map = new Map();
    for (const t of tarifasVigentes) {
      map.set(`${t.tallerId}_${t.proceso.toLowerCase()}`, t.valorHora);
    }
    return map;
  }, [tarifasVigentes]);

  // Prepared materials for engine calculation
  const materialesForEngine = useMemo(() => {
    const items = Array.isArray(materialesBodega) ? materialesBodega : (materialesBodega?.data || []);
    const telasItems = Array.isArray(telas) ? telas : (telas?.data || []);

    return materiales.map((m) => {
      let precioUnitario = 0;
      let nombre = 'Material';
      let unidad = m.unidad;

      if (m.bodegaTallerId) {
        const mat = items.find((i) => i.id === m.bodegaTallerId);
        if (mat) {
          precioUnitario = mat.precio || 0;
          nombre = mat.nombre;
          if (!unidad) unidad = mat.unidadMedida;
        }
      } else if (m.telaId) {
        const tel = telasItems.find((t) => t.id === m.telaId);
        if (tel) {
          precioUnitario = tel.precio || 0;
          nombre = tel.nombre || `Tela ${tel.codigo}`;
          if (!unidad) unidad = 'm';
        }
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
  }, [materiales, materialesBodega, telas]);

  // Prepared processes for engine calculation
  const procesosForEngine = useMemo(() => {
    return procesos.map((p) => {
      const key = `${p.tallerId || tallerId}_${(p.proceso || '').toLowerCase()}`;
      const valorHora = tarifasMap.get(key) || (p.proceso === 'corte' ? 3800 : 4200);

      return {
        tallerId: p.tallerId || tallerId,
        proceso: p.proceso,
        horas: p.horas,
        valorHora,
      };
    });
  }, [procesos, tallerId, tarifasMap]);

  // Live calculation preview
  const liveCalculation = useMemo(() => {
    return calcularCosteo({
      materiales: materialesForEngine,
      procesos: procesosForEngine,
      accesoriosMonto,
      ajusteGlobalPct,
      margenTransferencia,
    });
  }, [materialesForEngine, procesosForEngine, accesoriosMonto, ajusteGlobalPct, margenTransferencia]);

  const diferencia = liveCalculation.costoTransferencia - (producto?.precioLista || 0);
  const pctDiferencia = producto?.precioLista
    ? ((diferencia / producto.precioLista) * 100).toFixed(1)
    : 0;

  // Handlers for dynamic material rows
  const addMaterialRow = (type) => {
    if (type === 'bodega') {
      const items = Array.isArray(materialesBodega) ? materialesBodega : (materialesBodega?.data || []);
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
    const ok = await confirmDialog(
      `¿Confirmas aplicar el nuevo costo de transferencia ($${liveCalculation.costoTransferencia.toLocaleString('es-CL')}) a la lista de precios? El precio actual ($${(producto.precioLista || 0).toLocaleString('es-CL')}) se actualizará y quedará registrado inmutablemente.`
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

  const itemsBodega = Array.isArray(materialesBodega) ? materialesBodega : (materialesBodega?.data || []);
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
                    const engineMat = materialesForEngine[idx];
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
                                {b.nombre} (${(b.precio || 0).toLocaleString('es-CL')})
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
                          ${(engineMat?.subtotal || 0).toLocaleString('es-CL')}
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
                    const engineProc = procesosForEngine[idx];
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 30px', gap: 8, alignItems: 'center', background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <select
                          value={row.proceso}
                          onChange={(e) => updateProcesoRow(idx, 'proceso', e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                        >
                          {PROCESOS_SUGERIDOS.map((p) => (
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

                        <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                          ${(engineProc?.subtotal || 0).toLocaleString('es-CL')}
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
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0', borderBottom: '1px solid #cbd5e1', paddingBottom: 8 }}>
                Desglose en Vivo
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Coste Materiales:</span>
                  <span style={{ fontWeight: 600 }}>${liveCalculation.costoMateriales.toLocaleString('es-CL')}</span>
                </div>

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
              <Btn onClick={handleAplicarCosteo} variant="primary" style={{ width: '100%', background: '#0284c7' }}>
                Aplicar a Precio Lista
              </Btn>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
