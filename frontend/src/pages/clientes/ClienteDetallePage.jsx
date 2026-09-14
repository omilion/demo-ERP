import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { PageHeader, Btn, KpiCard, Badge, Icon } from '../../components/shared'
import { useCliente, useClienteActivo, useUpdateCliente } from '../../api/clientes'
import { useAuthStore } from '../../store/auth'
import { can, getUserRole } from '../../utils/permissions'
import { toast, confirmDialog } from '../../store/notif'
import { clienteToForm, clienteFormToPayload, TIPOS_CLIENTE } from '../../components/forms/clienteFields'
import { validateClienteData, formatRut } from '../../utils/rut'
import { PAISES_LATAM, REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'

const fmt = n => '$' + Number(n || 0).toLocaleString('es-CL')
const fmtM = n => {
  const v = Number(n || 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'k'
  return v.toLocaleString('es-CL')
}

const PAGO_TONE = { Pagada: 'green', 'No pagada': 'red', Parcial: 'amber' }
const ENTREGA_TONE = { Entregada: 'green', Parcial: 'amber', 'En despacho': 'blue', Pendiente: 'gray' }
const ODT_TONE = { COMPLETADA: 'green', EN_PROCESO: 'blue', PENDIENTE: 'amber', CANCELADA: 'red' }

const renderEmailValue = (emailStr) => {
  if (!emailStr) return '—'
  const list = String(emailStr).split(/[,;]+/).map(e => e.trim()).filter(Boolean)
  if (list.length === 0) return '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
      {list.map((m, idx) => (
        <a key={idx} href={`mailto:${m}`} style={{ color: 'var(--blue, #2563eb)', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
          {m}
        </a>
      ))}
    </div>
  )
}

export default function ClienteDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canReadVentas = can(user, 'ventas')
  const canWriteClientes = can(user, 'clientes', 'write')
  const canDeleteClientes = can(user, 'clientes', 'delete')

  const userRole = getUserRole(user)
  const canEditCredito = userRole === 'admin' || userRole === 'gerencia' || can(user, 'gerencia', 'write') || user?.isGerencia

  const [tab, setTab] = useState('datos')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})
  const [emailsList, setEmailsList] = useState([''])

  const clienteActivo = useClienteActivo()
  const updateMutation = useUpdateCliente()
  const { data: cliente, isLoading, isError } = useCliente(id, { includeInactivos: 'true' })

  function startEditing() {
    if (!cliente) return
    const form = clienteToForm(cliente)
    setFormData(form)
    const parsedEmails = cliente.email ? String(cliente.email).split(/[,;]+/).map(e => e.trim()).filter(Boolean) : []
    setEmailsList(parsedEmails.length > 0 ? parsedEmails : [''])
    setIsEditing(true)
    setTab('datos')
  }

  function cancelEditing() {
    setIsEditing(false)
    setFormData({})
    setEmailsList([''])
  }

  function handleFormChange(field, value) {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'pais' && value !== 'Chile') {
        if (prev.pais === 'Chile') {
          next.region = ''
          next.comuna = ''
        }
      } else if (field === 'region' && next.pais === 'Chile') {
        const comunasDisponibles = COMUNAS_POR_REGION[value] || []
        if (!comunasDisponibles.includes(prev.comuna)) {
          next.comuna = comunasDisponibles[0] || ''
        }
      }
      return next
    })
  }

  function handleEmailChange(idx, val) {
    setEmailsList(prev => {
      const next = [...prev]
      next[idx] = val
      return next
    })
  }

  function addEmailInput() {
    setEmailsList(prev => [...prev, ''])
  }

  function removeEmailInput(idx) {
    setEmailsList(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSaveInline() {
    const { isValid, errors: valErrors } = validateClienteData(formData)
    if (!isValid) {
      const firstError = Object.values(valErrors)[0]
      return toast.warning(firstError || 'Por favor completa los datos válidos del cliente')
    }

    const joinedEmail = emailsList.map(e => e.trim()).filter(Boolean).join(', ')
    const payload = clienteFormToPayload({ ...formData, email: joinedEmail })

    updateMutation.mutate(
      { id: Number(id), data: payload },
      {
        onSuccess: () => {
          toast.success('Cliente actualizado correctamente')
          setIsEditing(false)
        },
        onError: err => toast.error(err?.response?.data?.error || 'Error al guardar cambios'),
      }
    )
  }

  if (isLoading) {
    return (
      <main className="page page-wide">
        <p style={{ padding: 40, color: 'var(--text-3)' }}>Cargando ficha de cliente...</p>
      </main>
    )
  }

  if (isError || !cliente) {
    return (
      <main className="page page-wide">
        <PageHeader title="Cliente no encontrado" breadcrumb={['Inicio', 'Clientes', 'Detalle']} />
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-3)', marginBottom: 16 }}>El cliente solicitado no existe o fue eliminado.</p>
          <Btn variant="primary" onClick={() => navigate('/clientes')}>Volver a Clientes</Btn>
        </div>
      </main>
    )
  }

  const ventas = cliente.ventas ?? []
  const odts = cliente.odts ?? []
  const sucursales = cliente.sucursales ?? []
  const bitacora = cliente.bitacora ?? []

  const totalVentasMonto = ventas.reduce((s, v) => s + (v.total || 0), 0)
  const noPagadasCount = ventas.filter(v => v.estadoPago === 'No pagada').length
  const saldo = cliente.saldo || 0

  async function handleActivoToggle() {
    const activo = cliente.activo === false
    const accion = activo ? 'reactivar' : 'dar de baja'
    const detalle = activo
      ? 'El cliente volverá a estar disponible para nuevas operaciones.'
      : 'El cliente dejará de aparecer en búsquedas operativas.'

    if (!(await confirmDialog({ title: `¿Confirmas ${accion}?`, detail: `¿Confirmas ${accion} al cliente "${cliente.nombre}"?\n\n${detalle}`, tone: activo ? 'primary' : 'danger' }))) return

    clienteActivo.mutate(
      { id: cliente.id, activo, razon: activo ? undefined : 'Baja desde ficha de cliente' },
      {
        onSuccess: () => toast.success(`Cliente ${activo ? 'reactivado' : 'dado de baja'} correctamente`),
        onError: err => toast.error(err?.response?.data?.error || err?.message || 'Error al cambiar estado'),
      }
    )
  }

  const comunasDisponibles = COMUNAS_POR_REGION[formData.region] || []

  return (
    <main className="page page-wide">
      <PageHeader
        title={isEditing ? `Editando: ${cliente.nombre}` : cliente.nombre}
        subtitle={isEditing ? 'Modificando datos directamente en la ficha' : `RUT: ${cliente.rut} · ${cliente.tipo || 'Cliente'} · ${cliente.ciudad || cliente.comuna || 'Chile'}`}
        breadcrumb={['Inicio', 'Clientes', cliente.nombre, isEditing ? 'Edición en línea' : null].filter(Boolean)}
        actions={<>
          {!isEditing ? (
            <>
              <Btn variant="secondary" icon="arrowLeft" size="sm" onClick={() => navigate('/clientes')}>
                Volver a Clientes
              </Btn>
              {canReadVentas && (
                <Btn variant="secondary" icon="shoppingBag" size="sm" onClick={() => navigate('/matriz-ventas?rut=' + encodeURIComponent(cliente.rut || ''))}>
                  Ver Ventas
                </Btn>
              )}
              {canWriteClientes && (
                <Btn variant="primary" icon="edit" size="sm" onClick={startEditing}>
                  Editar Cliente
                </Btn>
              )}
              {canDeleteClientes && (
                <Btn
                  variant={cliente.activo === false ? 'secondary' : 'danger'}
                  size="sm"
                  disabled={clienteActivo.isPending}
                  onClick={handleActivoToggle}
                >
                  {cliente.activo === false ? 'Reactivar' : 'Baja Operativa'}
                </Btn>
              )}
            </>
          ) : (
            <>
              <Btn variant="ghost" size="sm" onClick={cancelEditing} disabled={updateMutation.isPending}>
                Cancelar
              </Btn>
              <Btn
                variant="primary"
                icon={updateMutation.isPending ? 'refreshCw' : 'check'}
                size="sm"
                onClick={handleSaveInline}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
              </Btn>
            </>
          )}
        </>}
      />

      {/* KPI Cards del Cliente */}
      <div className="kpi-strip">
        <KpiCard
          label="Saldo Deuda"
          value={saldo > 0 ? fmt(saldo) : '$0'}
          icon="dollarSign"
          tone={saldo > 0 ? 'red' : 'green'}
          sublabel={saldo > 0 ? 'Saldo pendiente acumulado' : 'Sin deuda pendiente'}
        />
        <KpiCard
          label="Total Ventas"
          value={ventas.length.toLocaleString('es-CL')}
          icon="shoppingCart"
          sublabel={`Monto total: $${fmtM(totalVentasMonto)}`}
        />
        <KpiCard
          label="Ventas No Pagadas"
          value={noPagadasCount.toLocaleString('es-CL')}
          icon="alertTriangle"
          tone={noPagadasCount > 0 ? 'amber' : 'neutral'}
          sublabel="Pendientes de pago"
        />
        <KpiCard
          label="Órdenes de Trabajo"
          value={odts.length.toLocaleString('es-CL')}
          icon="tool"
          sublabel="En taller"
        />
      </div>

      {/* Pestañas de Navegación del Detalle */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { id: 'datos', label: 'Ficha y Datos', count: null },
          { id: 'ventas', label: 'Historial de Ventas', count: ventas.length },
          { id: 'taller', label: 'Órdenes de Taller', count: odts.length },
          { id: 'sucursales', label: 'Sucursales', count: sucursales.length },
          { id: 'bitacora', label: 'Historial de Cambios', count: bitacora.length },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--green-800)' : 'var(--text-2)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--green-700)' : 'transparent'}`,
              background: 'none',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 12,
                background: tab === t.id ? 'var(--green-100)' : 'var(--bg)',
                color: tab === t.id ? 'var(--green-800)' : 'var(--text-3)',
                fontWeight: 600,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido según pestaña activa */}
      {tab === 'datos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {/* Card 1: Identificación */}
          <div style={cardStyle(isEditing)}>
            <div style={cardTitleStyle}>
              <Icon name="user" size={15} /> Identificación {isEditing && <span style={{ color: 'var(--green-700)', fontSize: 11, fontWeight: 500 }}>(Edición activa)</span>}
            </div>
            <DataRow
              label="RUT"
              isEditing={isEditing}
              value={cliente.rut}
              input={
                <input
                  value={formData.rut || ''}
                  onChange={e => handleFormChange('rut', e.target.value)}
                  onBlur={e => {
                    const formatted = formatRut(e.target.value)
                    if (formatted) handleFormChange('rut', formatted)
                  }}
                  style={inlineInputStyle}
                  placeholder="Ej: 76.123.456-7"
                />
              }
              mono
            />
            <DataRow
              label="Nombre / Nombre Comercial"
              isEditing={isEditing}
              value={cliente.nombre}
              bold
              input={
                <input
                  value={formData.nombre || ''}
                  onChange={e => handleFormChange('nombre', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Nombre del cliente"
                />
              }
            />
            <DataRow
              label="Razón Social Oficial"
              isEditing={isEditing}
              value={cliente.razonSocial}
              input={
                <input
                  value={formData.razonSocial || ''}
                  onChange={e => handleFormChange('razonSocial', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Razón Social legal"
                />
              }
            />
            <DataRow
              label="Giro comercial"
              isEditing={isEditing}
              value={cliente.giro}
              input={
                <input
                  value={formData.giro || ''}
                  onChange={e => handleFormChange('giro', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Ej: Venta de artículos plastificados"
                />
              }
            />
            <DataRow
              label="Tipo de Cliente"
              isEditing={isEditing}
              value={<Badge tone={cliente.tipo === 'Empresa' ? 'gray' : 'blue'}>{cliente.tipo || 'Sin clasificar'}</Badge>}
              input={
                <select
                  value={formData.tipo || 'Empresa'}
                  onChange={e => handleFormChange('tipo', e.target.value)}
                  style={inlineSelectStyle}
                >
                  {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              }
            />
            <DataRow
              label="Estado"
              isEditing={false}
              value={<Badge tone={cliente.activo === false ? 'red' : 'green'}>{cliente.activo === false ? 'Inactivo' : 'Activo'}</Badge>}
            />
            <DataRow
              label="Segmento"
              isEditing={isEditing}
              value={cliente.segmento || 'C'}
              input={
                <select
                  value={formData.segmento || 'C'}
                  onChange={e => handleFormChange('segmento', e.target.value)}
                  style={inlineSelectStyle}
                >
                  <option value="A">Segmento A</option>
                  <option value="B">Segmento B</option>
                  <option value="C">Segmento C</option>
                </select>
              }
            />
          </div>

          {/* Card 2: Contacto & Ubicación */}
          <div style={cardStyle(isEditing)}>
            <div style={cardTitleStyle}>
              <Icon name="mapPin" size={15} /> Ubicación & Contacto
            </div>
            <DataRow
              label="Email(s) de contacto"
              isEditing={isEditing}
              value={renderEmailValue(cliente.email)}
              input={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  {emailsList.map((emailVal, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="email"
                        value={emailVal}
                        onChange={e => handleEmailChange(idx, e.target.value)}
                        style={inlineInputStyle}
                        placeholder={`Email #${idx + 1}`}
                      />
                      {emailsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEmailInput(idx)}
                          style={{ border: '1px solid var(--red)', background: '#fff', color: 'var(--red)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                          title="Quitar este email"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addEmailInput}
                    style={{ border: '1px dashed var(--green-600)', background: '#fff', color: 'var(--green-800)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, marginTop: 2, alignSelf: 'flex-end' }}
                  >
                    + Agregar otro email
                  </button>
                </div>
              }
            />
            <DataRow
              label="Teléfono / Fono"
              isEditing={isEditing}
              value={cliente.telefono}
              mono
              input={
                <input
                  value={formData.telefono || ''}
                  onChange={e => handleFormChange('telefono', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="+56 9 1234 5678"
                />
              }
            />
            <DataRow
              label="Dirección"
              isEditing={isEditing}
              value={cliente.direccion}
              input={
                <input
                  value={formData.direccion || ''}
                  onChange={e => handleFormChange('direccion', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Calle, número, oficina"
                />
              }
            />
            <DataRow
              label="Región / Estado"
              isEditing={isEditing}
              value={cliente.region}
              input={
                (formData.pais || 'Chile') === 'Chile' ? (
                  <select
                    value={formData.region || ''}
                    onChange={e => handleFormChange('region', e.target.value)}
                    style={inlineSelectStyle}
                  >
                    <option value="">Selecciona Región</option>
                    {REGIONES_CHILE.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <input
                    value={formData.region || ''}
                    onChange={e => handleFormChange('region', e.target.value)}
                    style={inlineInputStyle}
                    placeholder="Estado / Provincia / Departamento"
                  />
                )
              }
            />
            <DataRow
              label="Comuna / Ciudad"
              isEditing={isEditing}
              value={cliente.comuna}
              input={
                (formData.pais || 'Chile') === 'Chile' ? (
                  <select
                    value={formData.comuna || ''}
                    onChange={e => handleFormChange('comuna', e.target.value)}
                    style={inlineSelectStyle}
                  >
                    <option value="">Selecciona Comuna</option>
                    {comunasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input
                    value={formData.comuna || ''}
                    onChange={e => handleFormChange('comuna', e.target.value)}
                    style={inlineInputStyle}
                    placeholder="Ciudad / Municipio / Localidad"
                  />
                )
              }
            />
            <DataRow
              label="País"
              isEditing={isEditing}
              value={cliente.pais || 'Chile'}
              input={
                <select
                  value={formData.pais || 'Chile'}
                  onChange={e => handleFormChange('pais', e.target.value)}
                  style={inlineSelectStyle}
                >
                  {PAISES_LATAM.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              }
            />
          </div>

          {/* Card 3: Crédito y Alertas */}
          <div style={cardStyle(isEditing)}>
            <div style={cardTitleStyle}>
              <Icon name="creditCard" size={15} /> Crédito & Operativa
              {!canEditCredito && <span style={{ color: 'var(--amber-700)', fontSize: 10, fontWeight: 600, background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>Gerencia Comercial</span>}
            </div>
            <DataRow
              label="Límite de Crédito ($)"
              isEditing={isEditing && canEditCredito}
              value={cliente.limiteCredito != null ? fmt(cliente.limiteCredito) : '—'}
              mono
              input={
                <input
                  type="number"
                  value={formData.limiteCredito || ''}
                  onChange={e => handleFormChange('limiteCredito', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Monto límite en $"
                />
              }
            />
            <DataRow
              label="Saldo Deuda Actual"
              isEditing={false}
              value={<span style={{ color: saldo > 0 ? 'var(--red)' : 'var(--text-1)', fontWeight: saldo > 0 ? 700 : 400 }}>{fmt(saldo)}</span>}
              mono
            />
            <DataRow
              label="Días Alerta Inactividad"
              isEditing={isEditing && canEditCredito}
              value={cliente.diasInactivoAlerta ? `${cliente.diasInactivoAlerta} días` : 'No configurado'}
              input={
                <input
                  type="number"
                  value={formData.diasInactivoAlerta || ''}
                  onChange={e => handleFormChange('diasInactivoAlerta', e.target.value)}
                  style={inlineInputStyle}
                  placeholder="Días inactivo para alerta"
                />
              }
            />
            {isEditing && !canEditCredito && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 11, color: 'var(--amber-800)' }}>
                🔒 La configuración de crédito y alertas está restringida a Gerencia Comercial.
              </div>
            )}
            {cliente.conflictivo && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid var(--red)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>CLIENTE CONFLICTIVO</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{cliente.conflictivoDetalle || 'Registrado con observaciones operativas.'}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ventas' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          {!ventas.length ? (
            <p style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No hay ventas registradas para este cliente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ventas.map(v => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                    padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: 'var(--green-800)' }}>
                        Venta #{v.id} {v.nInterno ? `(int. #${v.nInterno})` : ''}
                      </span>
                      <Badge tone={v.tipo === 'Licitación' ? 'blue' : 'neutral'}>{v.tipo || 'Venta'}</Badge>
                      <Badge tone={PAGO_TONE[v.estadoPago] ?? 'gray'}>{v.estadoPago}</Badge>
                      <Badge tone={ENTREGA_TONE[v.estadoEntrega] ?? 'gray'}>{v.estadoEntrega}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Fecha: {new Date(v.createdAt).toLocaleDateString('es-CL')} · Creado por: {v.creadorNombre || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
                      {fmt(v.total)}
                    </span>
                    {canReadVentas && (
                      <Link
                        to={`/ventas/${v.id}`}
                        style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--blue, #2563eb)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        Ver Venta
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'taller' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          {!odts.length ? (
            <p style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No hay órdenes de taller asociadas a este cliente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {odts.map(odt => (
                <div
                  key={odt.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                    padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, color: 'var(--green-800)' }}>
                        OT #{odt.id}
                      </span>
                      <Badge tone={ODT_TONE[odt.estado] ?? 'gray'}>{odt.estado}</Badge>
                      {odt.prioridad && odt.prioridad !== 'normal' && (
                        <Badge tone={odt.prioridad === 'urgente' ? 'red' : 'amber'}>{odt.prioridad}</Badge>
                      )}
                    </div>
                    {odt.descripcion && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{odt.descripcion}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                      Fecha: {new Date(odt.createdAt).toLocaleDateString('es-CL')} {odt.ordenId ? `· Venta #${odt.ordenId}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sucursales' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          {!sucursales.length ? (
            <p style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sin sucursales adicionales registradas.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {sucursales.map(suc => (
                <div key={suc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 4 }}>{suc.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{suc.direccion || 'Sin dirección'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    {[suc.comuna, suc.ciudad, suc.region, suc.pais].filter(Boolean).join(', ')}
                  </div>
                  {(suc.contacto || suc.telefono) && (
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      {suc.contacto ? `Contacto: ${suc.contacto}` : ''} {suc.telefono ? `· Fono: ${suc.telefono}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'bitacora' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          {!bitacora.length ? (
            <p style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No hay registro de modificaciones registradas en la bitácora para este cliente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bitacora.map(log => {
                const fecha = new Date(log.createdAt).toLocaleString('es-CL')
                const usuario = log.userNombre || log.userEmail || `Usuario #${log.userId || '—'}`
                const accionMap = { PUT: 'Actualización', POST: 'Creación', DELETE: 'Dar de baja / Eliminación' }
                const accion = accionMap[log.method] || log.method
                const payloadKeys = log.payload && typeof log.payload === 'object'
                  ? Object.keys(log.payload).filter(k => !k.startsWith('_')).join(', ')
                  : '—'

                return (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: '#fff',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{usuario}</span>
                        <Badge tone={log.method === 'POST' ? 'blue' : log.method === 'PUT' ? 'green' : 'red'}>{accion}</Badge>
                        {log.role && <Badge tone="neutral">{log.role}</Badge>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        Campos modificados: <strong>{payloadKeys || 'Datos generales'}</strong>
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>
                      {fecha}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function DataRow({ label, value, input, isEditing, mono, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      {isEditing && input ? (
        <div style={{ flex: 1, maxWidth: '65%', textAlign: 'right' }}>{input}</div>
      ) : (
        <span style={{
          fontSize: 12,
          fontFamily: mono ? "'DM Mono', monospace" : 'inherit',
          fontWeight: bold ? 600 : 400,
          color: 'var(--text-1)',
          textAlign: 'right',
        }}>
          {value != null && value !== '' ? value : '—'}
        </span>
      )}
    </div>
  )
}

const cardStyle = isEditing => ({
  background: '#fff',
  borderRadius: 12,
  border: isEditing ? '1.5px solid var(--green-600)' : '1px solid var(--border)',
  boxShadow: isEditing ? '0 4px 14px oklch(0 0 0/0.06)' : 'var(--shadow-sm)',
  padding: '16px 18px',
  transition: 'border-color 0.2s',
})

const cardTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-3)',
  marginBottom: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
}

const inlineInputStyle = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--green-600)',
  background: '#f0fdf4',
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  boxSizing: 'border-box',
  outline: 'none',
}

const inlineSelectStyle = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--green-600)',
  background: '#f0fdf4',
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  cursor: 'pointer',
  boxSizing: 'border-box',
  outline: 'none',
}
