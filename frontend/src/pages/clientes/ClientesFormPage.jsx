import { toast } from '../../store/notif'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Btn, Icon } from '../../components/shared'
import { clienteToForm, clienteFormToPayload, TIPOS_CLIENTE } from '../../components/forms/clienteFields'
import { SucursalesCliente, sucursalToPayload } from '../../components/forms/SucursalesCliente'
import { PAISES_LATAM, REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'
import { useCliente, useCreateCliente, useUpdateCliente, useCreateClienteSucursal } from '../../api/clientes'
import { useAuthStore } from '../../store/auth'
import { can, getUserRole } from '../../utils/permissions'

export default function ClientesFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { user } = useAuthStore()
  const userRole = getUserRole(user)
  const canEditCredito = userRole === 'admin' || userRole === 'gerencia' || can(user, 'gerencia', 'write') || user?.isGerencia

  const { data: found, isLoading } = useCliente(isEdit ? Number(id) : null, isEdit ? { includeInactivos: 'true' } : {})

  // State del formulario
  const [data, setData] = useState(() => clienteToForm(null))
  const [emailsList, setEmailsList] = useState([''])
  const [errors, setErrors] = useState({})
  const [sucursalesNuevas, setSucursalesNuevas] = useState([])

  useEffect(() => {
    if (isEdit && found) {
      // Si entra a la ruta /clientes/:id/editar, redirigir a la vista de detalle /clientes/:id
      navigate(`/clientes/${id}`, { replace: true })
    }
  }, [isEdit, found, id, navigate])

  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente()
  const createSucursal = useCreateClienteSucursal()

  const saving = createMutation.isPending || updateMutation.isPending || createSucursal.isPending

  function handleChange(field, value) {
    setData(prev => {
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
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
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

  const handleSave = () => {
    const errs = {}
    if (!data.nombre?.trim()) errs.nombre = 'El nombre es obligatorio'
    if (!data.rut?.trim()) errs.rut = 'El RUT es obligatorio'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      toast.warning('Por favor completa los campos obligatorios (RUT y Nombre)')
      return
    }

    const joinedEmail = emailsList.map(e => e.trim()).filter(Boolean).join(', ')
    const payload = clienteFormToPayload({ ...data, email: joinedEmail })

    if (!canEditCredito) {
      delete payload.limiteCredito
      delete payload.diasInactivoAlerta
    }

    const onError = (err) => toast.error(err?.response?.data?.error || 'Error al guardar cliente')

    createMutation.mutate(payload, {
      onSuccess: async (creado) => {
        const fallidas = []
        for (const sucursal of sucursalesNuevas) {
          try {
            await createSucursal.mutateAsync({ clienteId: creado.id, data: sucursalToPayload(sucursal) })
          } catch {
            fallidas.push(sucursal.nombre)
          }
        }
        if (fallidas.length) toast.error(`Cliente creado, pero no se pudieron agregar: ${fallidas.join(', ')}`)
        else toast.success('Cliente registrado correctamente')

        navigate(`/clientes/${creado.id}`)
      },
      onError,
    })
  }

  if (isEdit && isLoading) return <main style={{ padding: 24 }}><p>Cargando cliente...</p></main>

  const comunasDisponibles = COMUNAS_POR_REGION[data.region] || []

  return (
    <main className="page page-wide">
      <PageHeader
        title="Nuevo Cliente"
        subtitle="Registrar un nuevo cliente en el sistema con el formato unificado de tarjetas"
        breadcrumb={['Inicio', 'Clientes', 'Nuevo Cliente']}
        actions={<>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/clientes')} disabled={saving}>
            Cancelar
          </Btn>
          <Btn
            variant="primary"
            icon={saving ? 'refreshCw' : 'check'}
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar Cliente'}
          </Btn>
        </>}
      />

      {/* Grid de 3 Tarjetas con el mismo formato que ClienteDetallePage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Card 1: Identificación */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <Icon name="user" size={15} /> Identificación
          </div>

          <FormFieldRow label="RUT / Identificador" required error={errors.rut}>
            <input
              value={data.rut}
              onChange={e => handleChange('rut', e.target.value)}
              style={inputStyle(errors.rut)}
              placeholder="Ej: 76123456-7"
            />
          </FormFieldRow>

          <FormFieldRow label="Nombre / Nombre Comercial" required error={errors.nombre}>
            <input
              value={data.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              style={inputStyle(errors.nombre)}
              placeholder="Nombre comercial o corto"
            />
          </FormFieldRow>

          <FormFieldRow label="Razón Social Oficial">
            <input
              value={data.razonSocial}
              onChange={e => handleChange('razonSocial', e.target.value)}
              style={inputStyle()}
              placeholder="Razón Social jurídica completa"
            />
          </FormFieldRow>

          <FormFieldRow label="Giro Comercial">
            <input
              value={data.giro}
              onChange={e => handleChange('giro', e.target.value)}
              style={inputStyle()}
              placeholder="Ej: Comercio al por mayor"
            />
          </FormFieldRow>

          <FormFieldRow label="Tipo de Cliente">
            <select
              value={data.tipo}
              onChange={e => handleChange('tipo', e.target.value)}
              style={selectStyle}
            >
              {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormFieldRow>

          <FormFieldRow label="Segmento">
            <select
              value={data.segmento}
              onChange={e => handleChange('segmento', e.target.value)}
              style={selectStyle}
            >
              <option value="A">Segmento A</option>
              <option value="B">Segmento B</option>
              <option value="C">Segmento C</option>
            </select>
          </FormFieldRow>
        </div>

        {/* Card 2: Ubicación & Contacto */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <Icon name="mapPin" size={15} /> Ubicación & Contacto
          </div>

          <FormFieldRow label="Email(s) corporativo(s)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {emailsList.map((emailVal, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="email"
                    value={emailVal}
                    onChange={e => handleEmailChange(idx, e.target.value)}
                    style={inputStyle()}
                    placeholder={`Email #${idx + 1} (ej: contacto@empresa.cl)`}
                  />
                  {emailsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEmailInput(idx)}
                      style={{ border: '1px solid var(--red)', background: '#fff', color: 'var(--red)', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                      title="Quitar email"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addEmailInput}
                style={{ border: '1px dashed var(--green-600)', background: '#fff', color: 'var(--green-800)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, alignSelf: 'flex-end', marginTop: 2 }}
              >
                + Agregar otro email
              </button>
            </div>
          </FormFieldRow>

          <FormFieldRow label="Teléfono / Fono">
            <input
              value={data.telefono}
              onChange={e => handleChange('telefono', e.target.value)}
              style={inputStyle()}
              placeholder="+56 9 1234 5678"
            />
          </FormFieldRow>

          <FormFieldRow label="Dirección">
            <input
              value={data.direccion}
              onChange={e => handleChange('direccion', e.target.value)}
              style={inputStyle()}
              placeholder="Calle, número, depto / ofic"
            />
          </FormFieldRow>

          <FormFieldRow label="Región / Estado">
            {data.pais === 'Chile' ? (
              <select
                value={data.region}
                onChange={e => handleChange('region', e.target.value)}
                style={selectStyle}
              >
                <option value="">Selecciona Región</option>
                {REGIONES_CHILE.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <input
                value={data.region}
                onChange={e => handleChange('region', e.target.value)}
                style={inputStyle()}
                placeholder="Estado / Provincia / Departamento"
              />
            )}
          </FormFieldRow>

          <FormFieldRow label="Comuna / Ciudad">
            {data.pais === 'Chile' ? (
              <select
                value={data.comuna}
                onChange={e => handleChange('comuna', e.target.value)}
                style={selectStyle}
              >
                <option value="">Selecciona Comuna</option>
                {comunasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                value={data.comuna}
                onChange={e => handleChange('comuna', e.target.value)}
                style={inputStyle()}
                placeholder="Ciudad / Municipio / Localidad"
              />
            )}
          </FormFieldRow>

          <FormFieldRow label="País">
            <select
              value={data.pais}
              onChange={e => handleChange('pais', e.target.value)}
              style={selectStyle}
            >
              {PAISES_LATAM.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormFieldRow>
        </div>

        {/* Card 3: Crédito & Operativa */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>
            <Icon name="creditCard" size={15} /> Crédito & Operativa
            {!canEditCredito && <span style={{ color: 'var(--amber-700)', fontSize: 10, fontWeight: 600, background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>Gerencia Comercial</span>}
          </div>

          <FormFieldRow label="Límite de Crédito ($)">
            <input
              type="number"
              value={data.limiteCredito}
              disabled={!canEditCredito}
              onChange={e => handleChange('limiteCredito', e.target.value)}
              style={{ ...inputStyle(), opacity: canEditCredito ? 1 : 0.6, cursor: canEditCredito ? 'text' : 'not-allowed' }}
              placeholder={canEditCredito ? "Ej: 500000" : "Solo editable por Gerencia Comercial"}
            />
          </FormFieldRow>

          <FormFieldRow label="Días Alerta Inactividad">
            <input
              type="number"
              value={data.diasInactivoAlerta}
              disabled={!canEditCredito}
              onChange={e => handleChange('diasInactivoAlerta', e.target.value)}
              style={{ ...inputStyle(), opacity: canEditCredito ? 1 : 0.6, cursor: canEditCredito ? 'text' : 'not-allowed' }}
              placeholder={canEditCredito ? "Ej: 30" : "Solo editable por Gerencia Comercial"}
            />
          </FormFieldRow>
          {!canEditCredito && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 11, color: 'var(--amber-800)' }}>
              🔒 La configuración de crédito y alertas está restringida a Gerencia Comercial.
            </div>
          )}
        </div>
      </div>

      {/* Sucursales iniciales si se desea agregar */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 20px' }}>
        <SucursalesCliente cliente={null} borradores={sucursalesNuevas} onBorradoresChange={setSucursalesNuevas} />
      </div>
    </main>
  )
}

function FormFieldRow({ label, required, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: error ? 'var(--red)' : 'var(--text-3)' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 500 }}>{error}</span>}
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
  padding: '18px 20px',
}

const cardTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-3)',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
}

const inputStyle = error => ({
  width: '100%',
  padding: '7px 10px',
  fontSize: 12,
  borderRadius: 7,
  border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
  background: '#fff',
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  boxSizing: 'border-box',
})

const selectStyle = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 12,
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: '#fff',
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  cursor: 'pointer',
  boxSizing: 'border-box',
}
