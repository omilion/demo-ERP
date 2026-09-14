import { useState, useMemo } from 'react'
import { Badge, KpiCard, Btn, SearchBar } from '../../components/shared'
import { useSugerenciasOC, useCreateOCProveedor } from '../../api/ordenesCompraProveedores'
import { useProveedores } from '../../api/proveedores'
import { toast } from '../../store/notif'

function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CL')
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export default function SugerenciaOCSection({ onCreatedOC }) {
  const [proveedorId, setProveedorId] = useState('')
  const [desde, setDesde] = useState(daysAgoIso(30))
  const [hasta, setHasta] = useState(todayIso())
  const [diasProyeccion, setDiasProyeccion] = useState('30')
  const [factorSeguridad, setFactorSeguridad] = useState('1.0')
  const [soloCriticos, setSoloCriticos] = useState(false)
  const [search, setSearch] = useState('')

  // Local state for interactive table selections and edited quantities
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [customQuantities, setCustomQuantities] = useState({})
  const [customCosts, setCustomCosts] = useState({})
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)

  const [filtroProveedor, setFiltroProveedor] = useState('')
  const { data: proveedoresData = { items: [] } } = useProveedores({ limit: 1000 })
  const proveedoresList = useMemo(() => {
    return (proveedoresData.items || []).slice().sort((a, b) =>
      (a.nombre || a.razonSocial || '').localeCompare(b.nombre || b.razonSocial || '', 'es', { sensitivity: 'base' })
    )
  }, [proveedoresData.items])

  const filteredProveedores = useMemo(() => {
    if (!filtroProveedor.trim()) return proveedoresList
    const q = filtroProveedor.trim().toLowerCase()
    return proveedoresList.filter(p =>
      (p.nombre && p.nombre.toLowerCase().includes(q)) ||
      (p.razonSocial && p.razonSocial.toLowerCase().includes(q)) ||
      (p.rut && p.rut.toLowerCase().includes(q))
    )
  }, [proveedoresList, filtroProveedor])

  const selectedProveedor = proveedoresList.find(p => String(p.id) === String(proveedorId))

  const queryParams = useMemo(() => ({
    proveedorId: proveedorId || undefined,
    desde,
    hasta,
    diasProyeccion: diasProyeccion || undefined,
    factorSeguridad,
    soloCriticos: soloCriticos ? 'true' : undefined,
    search: search || undefined,
  }), [proveedorId, desde, hasta, diasProyeccion, factorSeguridad, soloCriticos, search])

  const { data = { items: [], kpis: {} }, isLoading, refetch } = useSugerenciasOC(queryParams, {
    enabled: true,
  })

  const rawItems = useMemo(() => data.items || [], [data.items])
  const kpis = data.kpis || {}

  // Merge server items with local overrides
  const items = useMemo(() => {
    return rawItems.map(it => {
      const pedir = customQuantities[it.productoId] !== undefined
        ? customQuantities[it.productoId]
        : it.cantidadSugerida
      const costo = customCosts[it.productoId] !== undefined
        ? customCosts[it.productoId]
        : it.costoUnitario
      return {
        ...it,
        cantidadPedir: pedir,
        costoUnitario: costo,
        subtotalCalculado: pedir * costo,
        isSelected: selectedItems.size === 0 ? it.cantidadSugerida > 0 : selectedItems.has(it.productoId),
      }
    })
  }, [rawItems, customQuantities, customCosts, selectedItems])

  const handleToggleSelect = (prodId) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(prodId)) next.delete(prodId)
      else next.add(prodId)
      return next
    })
  }

  const handleSelectAll = (select) => {
    if (!select) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(items.filter(i => i.cantidadPedir > 0).map(i => i.productoId)))
    }
  }

  const handleQtyChange = (prodId, val) => {
    const qty = Math.max(0, Number.parseInt(val, 10) || 0)
    setCustomQuantities(prev => ({ ...prev, [prodId]: qty }))
  }

  const handleCostChange = (prodId, val) => {
    const cost = Math.max(0, Number(val) || 0)
    setCustomCosts(prev => ({ ...prev, [prodId]: cost }))
  }

  const selectedList = items.filter(it => it.isSelected && it.cantidadPedir > 0)
  const totalUnidadesSeleccionadas = selectedList.reduce((acc, it) => acc + Number(it.cantidadPedir || 0), 0)
  const montoNetoSeleccionado = selectedList.reduce((acc, it) => acc + Number(it.subtotalCalculado || 0), 0)

  const createOcMutation = useCreateOCProveedor()

  const handleGenerarBorrador = () => {
    if (selectedList.length === 0) {
      toast.error('Seleccione al menos un producto con cantidad a pedir mayor a 0')
      return
    }
    if (!proveedorId && !selectedList[0]?.proveedorId) {
      toast.error('Debe seleccionar un proveedor para generar la orden de compra')
      return
    }
    setConfirmModalOpen(true)
  }

  const handleConfirmarGeneracionOC = () => {
    const targetProvId = proveedorId ? Number(proveedorId) : selectedList[0]?.proveedorId
    const targetProv = proveedoresList.find(p => p.id === targetProvId) || selectedProveedor

    const payload = {
      proveedorId: targetProvId,
      proveedorNombre: targetProv?.nombre || selectedList[0]?.proveedorNombre,
      proveedorRut: targetProv?.rut || selectedList[0]?.proveedorRut,
      fechaRangoVentasDesde: desde,
      fechaRangoVentasHasta: hasta,
      estado: 'Borrador',
      observaciones: `Sugerencia de reposición automática basada en ventas del período ${desde} al ${hasta} (${diasProyeccion || 30} días proyección).`,
      items: selectedList.map(it => ({
        productoId: it.productoId,
        codigoInterno: it.codigoInterno,
        nombre: it.nombre,
        cantidadPedida: it.cantidadPedir,
        costoUnitario: it.costoUnitario,
        ventasPeriodo: it.ventasPeriodo,
        stockActual: it.stockActual,
        stockCritico: it.stockCritico,
        enTransito: it.enTransito,
      })),
    }

    createOcMutation.mutate(payload, {
      onSuccess: (created) => {
        toast.success(`Borrador de OC ${created.numeroOc} generado exitosamente para Gerencia`)
        setConfirmModalOpen(false)
        if (onCreatedOC) onCreatedOC(created)
      },
      onError: (err) => {
        toast.error(err.response?.data?.error || 'Error al generar borrador de orden de compra')
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Panel de Filtros y Configuración del Análisis */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        padding: 16,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', flex: '1 1 auto' }}>
            <div style={{ minWidth: 280, flex: '1 1 280px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>
                  Proveedor Recurrente
                </label>
                {proveedoresList.length > 0 && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                    {filteredProveedores.length} de {proveedoresList.length} proveedores
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={filtroProveedor}
                  onChange={(e) => setFiltroProveedor(e.target.value)}
                  style={{ width: '42%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}
                />
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  style={{ width: '58%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }}
                >
                  <option value="">Todos los proveedores</option>
                  {filteredProveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.pagoFactura ? `(${p.pagoFactura})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                Ventas Desde
              </label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                Ventas Hasta
              </label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}
              />
            </div>

            <div style={{ width: 100 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                Días Proy.
              </label>
              <input
                type="number"
                min="1"
                max="180"
                value={diasProyeccion}
                onChange={(e) => setDiasProyeccion(e.target.value)}
                placeholder="30"
                style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, textAlign: 'center' }}
              />
            </div>

            <div style={{ width: 90 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                Buffer (x)
              </label>
              <select
                value={factorSeguridad}
                onChange={(e) => setFactorSeguridad(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}
              >
                <option value="1.0">1.0x</option>
                <option value="1.2">1.2x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { setDesde(daysAgoIso(7)); setHasta(todayIso()) }}
              style={presetBtnStyle}
            >7d</button>
            <button
              onClick={() => { setDesde(daysAgoIso(15)); setHasta(todayIso()) }}
              style={presetBtnStyle}
            >15d</button>
            <button
              onClick={() => { setDesde(daysAgoIso(30)); setHasta(todayIso()) }}
              style={{ ...presetBtnStyle, fontWeight: 700 }}
            >30d</button>
            <button
              onClick={() => { setDesde(daysAgoIso(60)); setHasta(todayIso()) }}
              style={presetBtnStyle}
            >60d</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={soloCriticos}
                onChange={(e) => setSoloCriticos(e.target.checked)}
              />
              Mostrar solo productos con quiebre o stock crítico
            </label>
            <div style={{ width: 220 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto en la sugerencia..." />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" size="sm" icon="refreshCw" onClick={() => refetch()}>
              Recalcular
            </Btn>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-strip">
        <KpiCard
          label="Productos Analizados"
          value={kpis.totalProductos ?? items.length}
          icon="package"
          sublabel={`Período de ${kpis.diasRango || 30} días`}
        />
        <KpiCard
          label="Requieren Reposición"
          value={kpis.productosConSugerencia ?? 0}
          icon="alertTriangle"
          tone="amber"
          sublabel="Sugerencia > 0 un."
        />
        <KpiCard
          label="Unidades Sugeridas"
          value={(kpis.totalUnidadesSugeridas ?? 0).toLocaleString('es-CL')}
          icon="box"
          tone="blue"
          sublabel="Cálculo ventas vs stock"
        />
        <KpiCard
          label="Monto Estimado Neto"
          value={money(kpis.montoTotalEstimadoNeto ?? 0)}
          icon="dollarSign"
          tone="green"
          sublabel="Costo proveedor calculado"
        />
      </div>

      {/* Grilla Interactiva */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Análisis de Ventas Diarias y Reposición</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              ({items.length} productos analizados)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSelectAll(true)}
              style={{ background: 'none', border: 'none', fontSize: 11.5, color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}
            >
              Seleccionar Todos
            </button>
            <span style={{ color: 'var(--border)' }}>|</span>
            <button
              onClick={() => handleSelectAll(false)}
              style={{ background: 'none', border: 'none', fontSize: 11.5, color: 'var(--text-3)', cursor: 'pointer' }}
            >
              Deseleccionar
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            Calculando ritmo de ventas diarias y analizando existencias...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            No se encontraron productos para los criterios seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', width: 34, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedList.length === items.filter(i => i.cantidadPedir > 0).length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th style={{ padding: '8px 10px' }}>Código</th>
                  <th style={{ padding: '8px 10px' }}>Producto</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Ventas Período</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Venta/Día</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stock Actual</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stock Crítico</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>En Tránsito</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', background: '#eff6ff', color: '#1e40af', fontWeight: 700 }}>
                    Sugerido
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', background: '#f0fdf4', color: '#166534', fontWeight: 700, width: 100 }}>
                    A Pedir
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Costo Unit.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.productoId}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: it.isSelected ? '#fcfdfa' : '#fff',
                    }}
                  >
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={it.isSelected}
                        onChange={() => handleToggleSelect(it.productoId)}
                      />
                    </td>

                    <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-1)' }}>
                      {it.codigoInterno || '-'}
                      {it.codigoProveedor && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>Prov: {it.codigoProveedor}</div>}
                    </td>

                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{it.nombre}</div>
                      {!proveedorId && it.proveedorNombre && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{it.proveedorNombre}</div>
                      )}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                      {it.ventasPeriodo.toLocaleString('es-CL')}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-2)' }}>
                      {it.promedioVentaDiaria}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <span style={{
                        fontWeight: 700,
                        color: it.stockActual <= 0 ? 'var(--red)' : it.stockActual <= it.stockCritico ? 'oklch(0.48 0.14 68)' : 'var(--text-1)',
                      }}>
                        {it.stockActual}
                      </span>
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-3)' }}>
                      {it.stockCritico}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {it.enTransito > 0 ? (
                        <span style={{ color: 'var(--blue)', fontWeight: 600 }}>+{it.enTransito}</span>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>-</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right', background: '#eff6ff', fontWeight: 700, color: '#1e40af' }}>
                      {it.cantidadSugerida.toLocaleString('es-CL')}
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'right', background: '#f0fdf4' }}>
                      <input
                        type="number"
                        min="0"
                        value={it.cantidadPedir}
                        onChange={(e) => handleQtyChange(it.productoId, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: 5,
                          border: '1px solid #bbf7d0',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: 12,
                          background: '#fff',
                        }}
                      />
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        value={it.costoUnitario}
                        onChange={(e) => handleCostChange(it.productoId, e.target.value)}
                        style={{
                          width: 80,
                          padding: '4px 6px',
                          borderRadius: 5,
                          border: '1px solid var(--border)',
                          textAlign: 'right',
                          fontSize: 12,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      />
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                      {money(it.subtotalCalculado)}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Badge
                        tone={
                          it.estadoStock.includes('Quiebre') ? 'red'
                            : it.estadoStock.includes('Crítico') ? 'amber'
                            : it.estadoStock.includes('Requiere') ? 'blue'
                            : 'gray'
                        }
                        size="sm"
                      >
                        {it.estadoStock}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumen y Acciones Inferiores */}
        <div style={{
          padding: '14px 18px',
          background: '#fafafa',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
            <span>Ítems seleccionados: <strong>{selectedList.length}</strong></span>
            <span>Total unidades a pedir: <strong>{totalUnidadesSeleccionadas.toLocaleString('es-CL')} un.</strong></span>
            <span>Monto Neto Total: <strong style={{ color: 'var(--green-700)', fontFamily: "'DM Mono', monospace" }}>{money(montoNetoSeleccionado)}</strong></span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Total c/IVA: {money(Math.round(montoNetoSeleccionado * 1.19))}</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn
              variant="primary"
              icon="send"
              disabled={selectedList.length === 0}
              onClick={handleGenerarBorrador}
            >
              Generar Borrador de OC para Gerencia ({selectedList.length})
            </Btn>
          </div>
        </div>
      </div>

      {/* Modal Confirmación de Creación de OC */}
      {confirmModalOpen && (
        <div onClick={() => setConfirmModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 620, maxWidth: '92vw', padding: 24, boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>Generar Borrador de Orden de Compra</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-2)' }}>
              Se creará una nueva Orden de Compra formal para el proveedor con las cantidades sugeridas y editadas, lista para la revisión y aprobación de Gerencia.
            </p>

            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Proveedor:</span>
                <strong>{selectedProveedor?.nombre || selectedList[0]?.proveedorNombre || 'Proveedor'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Ítems incluidos:</span>
                <strong>{selectedList.length} productos</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Total Unidades:</span>
                <strong>{totalUnidadesSeleccionadas.toLocaleString('es-CL')} unidades</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Subtotal Neto:</span>
                <strong style={{ fontFamily: "'DM Mono', monospace" }}>{money(montoNetoSeleccionado)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <span>Total Estimado (c/IVA 19%):</span>
                <strong style={{ color: 'var(--green-700)', fontFamily: "'DM Mono', monospace", fontSize: 14 }}>
                  {money(Math.round(montoNetoSeleccionado * 1.19))}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="secondary" onClick={() => setConfirmModalOpen(false)}>Cancelar</Btn>
              <Btn variant="primary" icon="check" loading={createOcMutation.isPending} onClick={handleConfirmarGeneracionOC}>
                Confirmar y Crear Borrador
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const presetBtnStyle = {
  padding: '4px 8px',
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: '#fff',
  fontSize: 11,
  cursor: 'pointer',
  color: 'var(--text-2)',
}
