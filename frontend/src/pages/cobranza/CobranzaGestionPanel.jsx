import { useMemo, useState } from 'react'
import { Badge, Btn } from '../../components/shared'
import {
  useActualizarCompromiso,
  useCartolaMovimientos,
  useCobranzaAlertas,
  useCobranzaGestiones,
  useConciliarCartola,
  useCrearCobranzaGestion,
  useDescartarCartola,
  useImportarCartola,
} from '../../api/cobranzaHistorico'
import { toast } from '../../store/notif'
import './CobranzaGestionPanel.css'

const INITIAL_FORM = {
  ordenId: '',
  tipo: 'CONTACTO',
  canal: 'Telefono',
  resultado: '',
  detalle: '',
  fechaCompromiso: '',
  monto: '',
  observacion: '',
}

const errorText = error => error?.response?.data?.error || error?.message || 'No se pudo completar la acción.'
const fmt = value => '$' + Math.abs(Number(value || 0)).toLocaleString('es-CL')
const dateFmt = value => value ? new Date(value).toLocaleDateString('es-CL') : '—'

function targetLabel(item) {
  if (item.ordenId) return `Venta #${item.ordenId}`
  if (item.cobranzaHistoricoId) return `Histórico #${item.cobranzaHistoricoId}`
  return 'Sin objetivo'
}

function alertTargetLabel(item) {
  const target = item.objetivo
  if (item.ordenId) return target?.nInterno ? `Interno ${target.nInterno} · Venta #${item.ordenId}` : `Venta #${item.ordenId}`
  return target?.interno ? `Interno ${target.interno} · Historial #${item.cobranzaHistoricoId}` : `Historial #${item.cobranzaHistoricoId}`
}

function parseCartola(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error('Ingresa al menos un movimiento.')
  return lines.map((line, index) => {
    const [fecha, montoRaw, descripcion, referencia = '', banco = '', cuenta = ''] = line.split(';').map(value => value.trim())
    const monto = Number(String(montoRaw || '').replace(/\./g, '').replace(',', '.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !Number.isFinite(monto) || monto === 0 || !descripcion) {
      throw new Error(`Línea ${index + 1}: usa fecha;monto;descripción;referencia;banco;cuenta.`)
    }
    return { fecha: `${fecha}T12:00:00.000Z`, monto, descripcion, referencia: referencia || undefined, banco: banco || undefined, cuenta: cuenta || undefined, moneda: 'CLP' }
  })
}

export default function CobranzaGestionPanel({ canWrite, initialTarget }) {
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    ordenId: initialTarget?.id ? String(initialTarget.id) : '',
  }))
  const [cartolaText, setCartolaText] = useState('')
  const [showAllGestiones, setShowAllGestiones] = useState(false)
  const { data: alerts = { items: [], counts: {} }, isLoading: alertsLoading, isError: alertsError, error: alertError } = useCobranzaAlertas()
  const { data: gestiones = { items: [] }, isLoading: gestionesLoading, isError: gestionesError, error: gestionError } = useCobranzaGestiones()
  const { data: cartola = { items: [] }, isLoading: cartolaLoading, isError: cartolaError, error: cartolaQueryError } = useCartolaMovimientos({ estado: 'PENDIENTE' })
  const crearGestion = useCrearCobranzaGestion()
  const actualizarCompromiso = useActualizarCompromiso()
  const importarCartola = useImportarCartola()
  const conciliarCartola = useConciliarCartola()
  const descartarCartola = useDescartarCartola()

  const visibleGestiones = useMemo(
    () => showAllGestiones ? gestiones.items : gestiones.items.slice(0, 8),
    [gestiones.items, showAllGestiones],
  )

  const submitGestion = async event => {
    event.preventDefault()
    const ordenId = Number(form.ordenId)
    if (!Number.isInteger(ordenId) || ordenId <= 0) return toast.warning('Ingresa el ID de una venta válida.')
    if (form.detalle.trim().length < 3) return toast.warning('Describe el resultado de la gestión.')
    const payload = {
      ordenId,
      tipo: form.tipo,
      canal: form.canal || undefined,
      resultado: form.resultado || undefined,
      detalle: form.detalle.trim(),
    }
    if (form.tipo === 'COMPROMISO') {
      const monto = Number(form.monto)
      if (!form.fechaCompromiso || !Number.isFinite(monto) || monto <= 0) return toast.warning('Completa fecha y monto del compromiso.')
      payload.compromiso = {
        fechaCompromiso: `${form.fechaCompromiso}T12:00:00.000Z`,
        monto,
        observacion: form.observacion || undefined,
      }
    }
    try {
      await crearGestion.mutateAsync(payload)
      setForm(current => ({ ...INITIAL_FORM, ordenId: current.ordenId }))
      toast.success(form.tipo === 'COMPROMISO' ? 'Gestión y promesa de pago registradas.' : 'Gestión registrada.')
    } catch (error) { toast.error(errorText(error)) }
  }

  const closeCompromiso = async (id, estado) => {
    try {
      await actualizarCompromiso.mutateAsync({ id, estado })
      toast.success(estado === 'CUMPLIDO' ? 'Compromiso marcado como cumplido.' : 'Compromiso marcado como incumplido.')
    } catch (error) { toast.error(errorText(error)) }
  }

  const importCartola = async event => {
    event.preventDefault()
    try {
      const movimientos = parseCartola(cartolaText)
      const result = await importarCartola.mutateAsync(movimientos)
      setCartolaText('')
      toast.success(`${result.importados} movimiento(s) importado(s); ${result.duplicados} duplicado(s) omitido(s).`)
    } catch (error) { toast.error(errorText(error)) }
  }

  const conciliar = async movimiento => {
    if (!movimiento.sugerencia?.ordenId) return toast.warning('Este movimiento no tiene una venta sugerida.')
    try {
      await conciliarCartola.mutateAsync({ id: movimiento.id, ordenId: movimiento.sugerencia.ordenId, observacion: 'Conciliación asistida por N° interno detectado.' })
      toast.success(`Movimiento vinculado a venta #${movimiento.sugerencia.ordenId}.`)
    } catch (error) { toast.error(errorText(error)) }
  }

  const descartar = async movimiento => {
    try {
      await descartarCartola.mutateAsync({ id: movimiento.id, observacion: 'Descartado manualmente desde conciliación.' })
      toast.success('Movimiento descartado de la bandeja pendiente.')
    } catch (error) { toast.error(errorText(error)) }
  }

  return (
    <div className="cobranza-gestion">
      <section className="cobranza-gestion__intro" aria-label="Alertas de promesas de pago">
        <div>
          <span className="cobranza-gestion__eyebrow">Seguimiento preventivo</span>
          <h2>Promesas próximas o vencidas</h2>
          <p>Los avisos se activan automáticamente a 15, 5 y 0 días del compromiso.</p>
        </div>
        <div className="cobranza-gestion__alert-counts">
          <div><strong>{alerts.counts?.preventiva || 0}</strong><span>15 días</span></div>
          <div className="is-high"><strong>{alerts.counts?.alta || 0}</strong><span>5 días</span></div>
          <div className="is-critical"><strong>{alerts.counts?.critica || 0}</strong><span>Vencidas / hoy</span></div>
        </div>
      </section>

      <div className="cobranza-gestion__grid">
        <section className="cobranza-gestion__card">
          <header><div><h3>Alertas activas</h3><p>Prioriza los compromisos con menor plazo.</p></div><Badge tone="red">{alerts.items.length}</Badge></header>
          {alertsLoading ? <div className="cobranza-gestion__state">Cargando alertas…</div>
            : alertsError ? <div className="cobranza-gestion__state is-error">{errorText(alertError)}</div>
            : !alerts.items.length ? <div className="cobranza-gestion__state">No hay promesas dentro de los próximos 15 días.</div>
            : <div className="cobranza-gestion__list">{alerts.items.map(item => (
              <article key={item.id} className={`cobranza-gestion__alert is-${item.severidad}`}>
                <div><strong>{alertTargetLabel(item)}</strong><span>{dateFmt(item.fechaCompromiso)} · {fmt(item.monto)}</span></div>
                <div className="cobranza-gestion__alert-actions">
                  <Badge tone={item.severidad === 'critica' ? 'red' : item.severidad === 'alta' ? 'amber' : 'gray'}>{item.diasRestantes <= 0 ? 'Hoy / vencida' : `${item.diasRestantes} días`}</Badge>
                  {canWrite && <>
                    <button type="button" onClick={() => closeCompromiso(item.id, 'CUMPLIDO')} disabled={actualizarCompromiso.isPending}>Cumplido</button>
                    <button type="button" onClick={() => closeCompromiso(item.id, 'INCUMPLIDO')} disabled={actualizarCompromiso.isPending}>Incumplido</button>
                  </>}
                </div>
              </article>
            ))}</div>}
        </section>

        <section className="cobranza-gestion__card">
          <header><div><h3>Nueva gestión</h3><p>Registra contacto, resultado y próxima acción.</p></div></header>
          {!canWrite ? <div className="cobranza-gestion__state">Tu perfil tiene acceso de lectura.</div> : (
            <form className="cobranza-gestion__form" onSubmit={submitGestion}>
              <label><span>ID de venta</span><input type="number" min="1" required value={form.ordenId} onChange={event => setForm(value => ({ ...value, ordenId: event.target.value }))} /></label>
              <label><span>Tipo</span><select value={form.tipo} onChange={event => setForm(value => ({ ...value, tipo: event.target.value }))}><option value="CONTACTO">Contacto</option><option value="SEGUIMIENTO">Seguimiento</option><option value="COMPROMISO">Promesa de pago</option><option value="RECLAMO">Reclamo</option><option value="OTRO">Otro</option></select></label>
              <label><span>Canal</span><select value={form.canal} onChange={event => setForm(value => ({ ...value, canal: event.target.value }))}><option>Telefono</option><option>Correo</option><option>WhatsApp</option><option>Presencial</option><option>Otro</option></select></label>
              <label><span>Resultado</span><input maxLength="160" value={form.resultado} onChange={event => setForm(value => ({ ...value, resultado: event.target.value }))} placeholder="Ej. cliente confirma recepción" /></label>
              <label className="is-wide"><span>Detalle</span><textarea required minLength="3" maxLength="2000" rows="3" value={form.detalle} onChange={event => setForm(value => ({ ...value, detalle: event.target.value }))} placeholder="Qué se conversó y cuál es el siguiente paso" /></label>
              {form.tipo === 'COMPROMISO' && <>
                <label><span>Fecha comprometida</span><input type="date" required value={form.fechaCompromiso} onChange={event => setForm(value => ({ ...value, fechaCompromiso: event.target.value }))} /></label>
                <label><span>Monto comprometido</span><input type="number" min="1" required value={form.monto} onChange={event => setForm(value => ({ ...value, monto: event.target.value }))} /></label>
                <label className="is-wide"><span>Observación de la promesa</span><input maxLength="1000" value={form.observacion} onChange={event => setForm(value => ({ ...value, observacion: event.target.value }))} /></label>
              </>}
              <div className="cobranza-gestion__form-actions"><Btn variant="primary" type="submit" disabled={crearGestion.isPending}>{crearGestion.isPending ? 'Guardando…' : 'Guardar gestión'}</Btn></div>
            </form>
          )}
        </section>
      </div>

      <section className="cobranza-gestion__card cobranza-gestion__cartola">
        <header><div><h3>Conciliación de cartola</h3><p>Vincula depósitos con ventas; esta acción no registra un pago en caja.</p></div><Badge tone="amber">{cartola.items.length} pendientes</Badge></header>
        {canWrite && <form className="cobranza-gestion__import" onSubmit={importCartola}>
          <label><span>Importar movimientos, uno por línea</span><textarea rows="3" value={cartolaText} onChange={event => setCartolaText(event.target.value)} placeholder="2026-08-28;125000;Transferencia interno 10458;OP-882;Banco Estado;Cuenta corriente" /></label>
          <div><small>Formato: fecha;monto;descripción;referencia;banco;cuenta</small><Btn type="submit" variant="secondary" disabled={importarCartola.isPending || !cartolaText.trim()}>{importarCartola.isPending ? 'Importando…' : 'Importar cartola'}</Btn></div>
        </form>}
        {cartolaLoading ? <div className="cobranza-gestion__state">Cargando movimientos…</div>
          : cartolaError ? <div className="cobranza-gestion__state is-error">{errorText(cartolaQueryError)}</div>
          : !cartola.items.length ? <div className="cobranza-gestion__state">No hay movimientos pendientes de conciliación.</div>
          : <div className="cobranza-gestion__table-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Monto</th><th>Sugerencia</th><th>Acción</th></tr></thead><tbody>{cartola.items.map(item => (
            <tr key={item.id}><td>{dateFmt(item.fecha)}</td><td><strong>{item.descripcion}</strong><span>{item.referencia || 'Sin referencia'}</span></td><td>{fmt(item.monto)}</td><td>{item.sugerencia ? <><strong>Interno {item.sugerencia.nInterno}</strong><span>Venta #{item.sugerencia.ordenId}</span></> : <span>Sin coincidencia</span>}</td><td><div className="cobranza-gestion__row-actions">{canWrite && item.sugerencia && <button type="button" onClick={() => conciliar(item)} disabled={conciliarCartola.isPending}>Vincular</button>}{canWrite && <button type="button" onClick={() => descartar(item)} disabled={descartarCartola.isPending}>Descartar</button>}</div></td></tr>
          ))}</tbody></table></div>}
      </section>

      <section className="cobranza-gestion__card">
        <header><div><h3>Bitácora de gestiones</h3><p>Últimos contactos y compromisos registrados.</p></div>{gestiones.items.length > 8 && <button type="button" className="cobranza-gestion__link" onClick={() => setShowAllGestiones(value => !value)}>{showAllGestiones ? 'Ver menos' : `Ver las ${gestiones.items.length}`}</button>}</header>
        {gestionesLoading ? <div className="cobranza-gestion__state">Cargando bitácora…</div>
          : gestionesError ? <div className="cobranza-gestion__state is-error">{errorText(gestionError)}</div>
          : !visibleGestiones.length ? <div className="cobranza-gestion__state">Aún no se han registrado gestiones.</div>
          : <div className="cobranza-gestion__timeline">{visibleGestiones.map(item => <article key={item.id}><div className="cobranza-gestion__timeline-dot" /><div><div className="cobranza-gestion__timeline-heading"><strong>{targetLabel(item)}</strong><Badge tone={item.tipo === 'COMPROMISO' ? 'amber' : 'gray'}>{item.tipo}</Badge><time>{dateFmt(item.createdAt)}</time></div><p>{item.detalle}</p><span>{[item.canal, item.resultado, item.usuarioNombre].filter(Boolean).join(' · ') || 'Sin información adicional'}</span>{item.compromiso && <div className="cobranza-gestion__promise"><strong>{fmt(item.compromiso.monto)}</strong><span>para {dateFmt(item.compromiso.fechaCompromiso)}</span><Badge tone={item.compromiso.estado === 'PENDIENTE' ? 'amber' : item.compromiso.estado === 'CUMPLIDO' ? 'green' : 'red'}>{item.compromiso.estado}</Badge></div>}</div></article>)}</div>}
      </section>
    </div>
  )
}
