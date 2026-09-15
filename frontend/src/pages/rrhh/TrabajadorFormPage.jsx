import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FormPage } from '../../components/forms/FormPage'
import { FormField, FormSection, Input, Select, Textarea } from '../../components/forms'
import { Btn } from '../../components/shared'
import { useTrabajador, useCreateTrabajador, useUpdateTrabajador, useCuentasDisponibles } from '../../api/rrhh'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { toast } from '../../store/notif'
import { REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'
import {
  formatRut,
  isValidRut,
  cleanLetters,
  isValidName,
  isValidEmail,
  isValidPhone,
  getRegionFromComuna,
  parseDireccion,
} from '../../utils/rut'

// Ficha del trabajador: crear y editar en pantalla completa.
//
// Antes era un modal de 640 px con los 25 campos en una sola grilla corrida,
// sin agrupar: había que hacer scroll dentro del modal para llegar al boton de
// guardar y no se distinguia lo obligatorio de lo opcional. Ademas le faltaban
// campos que el backend si acepta -sueldo base, valor de la hora extra y el
// estado-, de modo que no habia forma de cargarlos por pantalla.

const EMPRESAS = [
  { value: 'plastimar', label: 'Plastimar' },
  { value: 'allegro', label: 'Allegro' },
]

const ESTADOS_CIVILES = ['', 'Soltero(a)', 'Casado(a)', 'Conviviente civil', 'Divorciado(a)', 'Viudo(a)', 'Separado(a)']
const TIPOS_CUENTA = ['', 'Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro']
const TIPOS_CONTRATO = ['', 'Indefinido', 'Plazo fijo', 'Por obra o faena', 'Part time', 'Honorarios']

const VACIO = {
  empresa: 'plastimar', nombres: '', apellidoPaterno: '', apellidoMaterno: '', rut: '',
  fechaNacimiento: '', estadoCivil: '', cargasFamiliares: '', nacionalidad: '',
  email: '', telefono: '', region: 'Metropolitana de Santiago', comuna: '', calle: '', depto: '',
  direccion: '', contactoEmergencia: '', numeroEmergencia: '',
  afp: '', salud: '',
  banco: '', tipoCuenta: '', numeroCuenta: '',
  cargo: '', fechaIngreso: '', fechaTermino: '', tipoContrato: '',
  sueldoLiquido: '', sueldoBase: '', valorHoraExtra: '',
  usuarioId: '', estado: true, observacion: '',
}

const texto = valor => (valor === null || valor === undefined ? '' : String(valor))

function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options
  return [...options, current]
}

const desdeTrabajador = t => {
  const { calle, depto } = parseDireccion(t.direccion)
  const region = t.region || getRegionFromComuna(t.comuna) || 'Metropolitana de Santiago'
  return {
    empresa: t.empresa || 'plastimar',
    nombres: t.nombres || '',
    apellidoPaterno: t.apellidoPaterno || '',
    apellidoMaterno: t.apellidoMaterno || '',
    rut: formatRut(t.rut) || t.rut || '',
    fechaNacimiento: t.fechaNacimiento || '',
    estadoCivil: t.estadoCivil || '',
    cargasFamiliares: t.cargasFamiliares || '',
    nacionalidad: t.nacionalidad || '',
    email: t.email || '',
    telefono: t.telefono || '',
    region,
    comuna: t.comuna || '',
    calle,
    depto,
    direccion: t.direccion || '',
    contactoEmergencia: t.contactoEmergencia || '',
    numeroEmergencia: t.numeroEmergencia || '',
    afp: t.afp || '',
    salud: t.salud || '',
    banco: t.banco || '',
    tipoCuenta: t.tipoCuenta || '',
    numeroCuenta: t.numeroCuenta || '',
    cargo: t.cargo || '',
    fechaIngreso: t.fechaIngreso || '',
    fechaTermino: t.fechaTermino ? String(t.fechaTermino).slice(0, 10) : '',
    tipoContrato: t.tipoContrato || '',
    sueldoLiquido: t.sueldoLiquido || '',
    sueldoBase: texto(t.sueldoBase),
    valorHoraExtra: texto(t.valorHoraExtra),
    usuarioId: t.usuarioId ? String(t.usuarioId) : '',
    estado: t.estado !== false,
    observacion: t.observacion || '',
  }
}

export default function TrabajadorFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const puedeEscribir = can(user, 'rrhh', 'write')

  const esNuevo = !id
  const { data: trabajador, isLoading, isError } = useTrabajador(id)
  const { data: cuentasData } = useCuentasDisponibles()
  const crear = useCreateTrabajador()
  const actualizar = useUpdateTrabajador()

  const cuentas = cuentasData?.items || []
  const [form, setForm] = useState(VACIO)
  const [errors, setErrors] = useState({})

  const set = (campo, valor) => {
    setForm(actual => ({ ...actual, [campo]: valor }))
    if (errors[campo]) setErrors(prev => ({ ...prev, [campo]: null }))
  }

  const handleRutChange = valor => {
    const filtrado = valor.replace(/[^0-9kK.\-\s]/g, '')
    set('rut', filtrado)
  }

  const handleRutBlur = () => {
    if (!form.rut.trim()) return
    const formateado = formatRut(form.rut)
    setForm(actual => ({ ...actual, rut: formateado }))
    if (!isValidRut(form.rut)) {
      setErrors(prev => ({ ...prev, rut: 'RUT inválido: revisa el dígito verificador' }))
    } else {
      setErrors(prev => ({ ...prev, rut: null }))
    }
  }

  const handleNombreChange = (campo, valor) => {
    const limpio = cleanLetters(valor)
    set(campo, limpio)
  }

  const handleRegionChange = nuevaRegion => {
    setForm(actual => {
      const comunasDeNuevaRegion = nuevaRegion ? (COMUNAS_POR_REGION[nuevaRegion] || []) : []
      const comunaSigueValida = comunasDeNuevaRegion.includes(actual.comuna)
      return {
        ...actual,
        region: nuevaRegion,
        comuna: comunaSigueValida ? actual.comuna : '',
      }
    })
    if (errors.region) setErrors(prev => ({ ...prev, region: null }))
  }

  useEffect(() => {
    if (trabajador) {
      // El formulario se rehidrata cuando cambia la ficha remota.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(desdeTrabajador(trabajador))
    }
  }, [trabajador])

  const volver = () => navigate(esNuevo ? '/rrhh' : `/rrhh/${id}`)

  const guardar = () => {
    const nuevosErrores = {}

    if (!form.nombres.trim()) nuevosErrores.nombres = 'Nombres es obligatorio'
    else if (!isValidName(form.nombres)) nuevosErrores.nombres = 'Solo se permiten letras en nombres'

    if (!form.apellidoPaterno.trim()) nuevosErrores.apellidoPaterno = 'Apellido paterno es obligatorio'
    else if (!isValidName(form.apellidoPaterno)) nuevosErrores.apellidoPaterno = 'Solo se permiten letras en apellido paterno'

    if (form.apellidoMaterno.trim() && !isValidName(form.apellidoMaterno)) {
      nuevosErrores.apellidoMaterno = 'Solo se permiten letras en apellido materno'
    }

    if (!form.rut.trim()) nuevosErrores.rut = 'RUT es obligatorio'
    else if (!isValidRut(form.rut)) nuevosErrores.rut = 'RUT inválido: revisa el dígito verificador'

    if (form.email.trim() && !isValidEmail(form.email)) {
      nuevosErrores.email = 'Email inválido (ej: usuario@empresa.cl)'
    }

    if (form.telefono.trim() && !isValidPhone(form.telefono)) {
      nuevosErrores.telefono = 'Teléfono inválido (ej: +56 9 1234 5678)'
    }

    if (form.numeroEmergencia.trim() && !isValidPhone(form.numeroEmergencia)) {
      nuevosErrores.numeroEmergencia = 'N° de emergencia inválido (ej: +56 9 8765 4321)'
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrors(nuevosErrores)
      const primerMensaje = Object.values(nuevosErrores)[0]
      toast.warning(primerMensaje)
      return
    }

    const direccionPartes = [
      form.calle.trim(),
      form.depto.trim()
        ? (/^(depto|dpto|departamento|oficina|of|casa|block)\b/i.test(form.depto.trim())
          ? form.depto.trim()
          : `Depto ${form.depto.trim()}`)
        : null,
    ].filter(Boolean)
    const direccionCompleta = direccionPartes.join(', ')

    const payload = {
      ...form,
      rut: formatRut(form.rut) || form.rut,
      direccion: direccionCompleta,
      comuna: form.comuna || '',
      region: form.region || '',
      sueldoBase: form.sueldoBase === '' ? null : Number(form.sueldoBase),
      valorHoraExtra: form.valorHoraExtra === '' ? null : Number(form.valorHoraExtra),
      usuarioId: form.usuarioId || null,
      fechaTermino: form.fechaTermino || null,
    }

    const alFallar = error => toast.error(error.response?.data?.error || 'No se pudo guardar el trabajador')

    if (esNuevo) {
      crear.mutate(payload, {
        onSuccess: creado => {
          toast.success('Trabajador creado')
          navigate(`/rrhh/${creado.id}`)
        },
        onError: alFallar,
      })
      return
    }
    actualizar.mutate({ id: Number(id), ...payload }, {
      onSuccess: () => {
        toast.success('Ficha actualizada')
        navigate(`/rrhh/${id}`)
      },
      onError: alFallar,
    })
  }

  if (!puedeEscribir) {
    return (
      <main className="page page-wide" style={{ padding: 24 }}>
        <p>No tienes permiso para editar fichas de trabajadores.</p>
        <Btn variant="secondary" onClick={() => navigate('/rrhh')}>← Volver a RRHH</Btn>
      </main>
    )
  }
  if (!esNuevo && isLoading) return <main style={{ padding: 24 }}>Cargando ficha…</main>
  if (!esNuevo && (isError || !trabajador)) return <main style={{ padding: 24 }}>Trabajador no encontrado</main>

  const guardando = crear.isPending || actualizar.isPending
  const nombreCompleto = [form.nombres, form.apellidoPaterno, form.apellidoMaterno].filter(Boolean).join(' ')
  const titulo = esNuevo ? 'Nuevo trabajador' : `Editar ficha · ${nombreCompleto || form.rut}`

  const acciones = (
    <>
      <Btn variant="ghost" onClick={volver}>Cancelar</Btn>
      <Btn variant="primary" icon={guardando ? 'refreshCw' : 'check'} onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : esNuevo ? 'Crear trabajador' : 'Guardar cambios'}
      </Btn>
    </>
  )

  const opcionesCuenta = [
    { value: '', label: 'Sin vincular' },
    ...cuentas.map(cuenta => ({
      value: String(cuenta.id),
      label: `${cuenta.nombre} (${cuenta.email})${cuenta.linked && cuenta.id !== trabajador?.usuarioId ? ' · ya vinculada' : ''}`,
    })),
  ]

  const opcionesRegion = [
    { value: '', label: '— Selecciona región —' },
    ...withCurrentValue(REGIONES_CHILE, form.region).map(r => ({ value: r, label: r })),
  ]

  const comunasDisponibles = form.region ? (COMUNAS_POR_REGION[form.region] || []) : []
  const opcionesComuna = [
    { value: '', label: form.region ? '— Selecciona comuna —' : 'Elige región primero' },
    ...withCurrentValue(comunasDisponibles, form.comuna).map(c => ({ value: c, label: c })),
  ]

  const grilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }

  return (
    <FormPage title={titulo} headerActions={acciones} footerActions={acciones}>
      <FormSection title="Identificación">
        <div style={grilla}>
          <FormField label="Empresa" required>
            <Select value={form.empresa} onChange={v => set('empresa', v)} options={EMPRESAS} />
          </FormField>
          <FormField label="RUT" required hint="Se valida el dígito verificador." error={errors.rut}>
            <Input
              value={form.rut}
              onChange={handleRutChange}
              onBlur={handleRutBlur}
              placeholder="12.345.678-9"
              error={errors.rut}
            />
          </FormField>
          <FormField label="Nombres" required error={errors.nombres}>
            <Input
              value={form.nombres}
              onChange={v => handleNombreChange('nombres', v)}
              placeholder="Ej: Juan Andrés"
              error={errors.nombres}
            />
          </FormField>
          <FormField label="Apellido paterno" required error={errors.apellidoPaterno}>
            <Input
              value={form.apellidoPaterno}
              onChange={v => handleNombreChange('apellidoPaterno', v)}
              placeholder="Ej: Pérez"
              error={errors.apellidoPaterno}
            />
          </FormField>
          <FormField label="Apellido materno" error={errors.apellidoMaterno}>
            <Input
              value={form.apellidoMaterno}
              onChange={v => handleNombreChange('apellidoMaterno', v)}
              placeholder="Ej: González"
              error={errors.apellidoMaterno}
            />
          </FormField>
          <FormField label="Fecha de nacimiento">
            <Input type="date" value={form.fechaNacimiento} onChange={v => set('fechaNacimiento', v)} />
          </FormField>
          <FormField label="Estado civil">
            <Select value={form.estadoCivil} onChange={v => set('estadoCivil', v)}
              options={ESTADOS_CIVILES.map(e => ({ value: e, label: e || 'Sin especificar' }))} />
          </FormField>
          <FormField label="Cargas familiares">
            <Input
              value={form.cargasFamiliares}
              onChange={v => set('cargasFamiliares', v.replace(/\D/g, ''))}
              placeholder="0"
            />
          </FormField>
          <FormField label="Nacionalidad">
            <Input value={form.nacionalidad} onChange={v => set('nacionalidad', v)} placeholder="Chilena" />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Contacto">
        <div style={grilla}>
          <FormField label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={v => set('email', v)}
              placeholder="correo@ejemplo.cl"
              error={errors.email}
            />
          </FormField>
          <FormField label="Teléfono" error={errors.telefono}>
            <Input
              value={form.telefono}
              onChange={v => set('telefono', v)}
              placeholder="+56 9 1234 5678"
              error={errors.telefono}
            />
          </FormField>
          <FormField label="Región">
            <Select
              value={form.region}
              onChange={handleRegionChange}
              options={opcionesRegion}
            />
          </FormField>
          <FormField label="Comuna">
            <Select
              value={form.comuna}
              onChange={v => set('comuna', v)}
              options={opcionesComuna}
              disabled={!form.region}
            />
          </FormField>
          <FormField label="Calle y numeración">
            <Input
              value={form.calle}
              onChange={v => set('calle', v)}
              placeholder="Ej: Av. Providencia 1234"
            />
          </FormField>
          <FormField label="N° Depto / Casa (opcional)">
            <Input
              value={form.depto}
              onChange={v => set('depto', v)}
              placeholder="Ej: Depto 402, Block B (opcional)"
            />
          </FormField>
          <FormField label="Contacto de emergencia">
            <Input
              value={form.contactoEmergencia}
              onChange={v => handleNombreChange('contactoEmergencia', v)}
              placeholder="Nombre del contacto"
            />
          </FormField>
          <FormField label="N° de emergencia" error={errors.numeroEmergencia}>
            <Input
              value={form.numeroEmergencia}
              onChange={v => set('numeroEmergencia', v)}
              placeholder="+56 9 8765 4321"
              error={errors.numeroEmergencia}
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Previsión y salud">
        <div style={grilla}>
          <FormField label="AFP" hint="Sin AFP y salud la liquidación no sirve para F30.">
            <Input value={form.afp} onChange={v => set('afp', v)} />
          </FormField>
          <FormField label="Salud">
            <Input value={form.salud} onChange={v => set('salud', v)} placeholder="Fonasa / Isapre" />
          </FormField>
        </div>
      </FormSection>


      <FormSection title="Datos bancarios">
        <div style={grilla}>
          <FormField label="Banco">
            <Input value={form.banco} onChange={v => set('banco', v)} />
          </FormField>
          <FormField label="Tipo de cuenta">
            <Select value={form.tipoCuenta} onChange={v => set('tipoCuenta', v)}
              options={TIPOS_CUENTA.map(t => ({ value: t, label: t || 'Sin especificar' }))} />
          </FormField>
          <FormField label="N° de cuenta">
            <Input value={form.numeroCuenta} onChange={v => set('numeroCuenta', v)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Contrato y remuneración" tone="price">
        <div style={grilla}>
          <FormField label="Cargo">
            <Input value={form.cargo} onChange={v => set('cargo', v)} />
          </FormField>
          <FormField label="Tipo de contrato">
            <Select value={form.tipoContrato} onChange={v => set('tipoContrato', v)}
              options={TIPOS_CONTRATO.map(t => ({ value: t, label: t || 'Sin especificar' }))} />
          </FormField>
          <FormField label="Fecha de ingreso">
            <Input type="date" value={form.fechaIngreso} onChange={v => set('fechaIngreso', v)} />
          </FormField>
          <FormField label="Fecha de término" hint="Al pasar la fecha, la baja se aplica sola.">
            <Input type="date" value={form.fechaTermino} onChange={v => set('fechaTermino', v)} />
          </FormField>
          <FormField label="Sueldo base ($)" hint="Base imponible del contrato.">
            <Input type="number" min="0" value={form.sueldoBase} onChange={v => set('sueldoBase', v)} />
          </FormField>
          <FormField label="Sueldo líquido">
            <Input value={form.sueldoLiquido} onChange={v => set('sueldoLiquido', v)} />
          </FormField>
          <FormField label="Valor hora extra ($)">
            <Input type="number" min="0" value={form.valorHoraExtra} onChange={v => set('valorHoraExtra', v)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Cuenta de sistema y estado">
        <div style={grilla}>
          <FormField label="Cuenta de sistema (login)" hint="Permite reconocerlo al asignar trabajo de taller.">
            <Select value={form.usuarioId} onChange={v => set('usuarioId', v)} options={opcionesCuenta} />
          </FormField>
          <FormField label="Estado" hint="Dar de baja lo saca de la plantilla vigente.">
            <Select
              value={form.estado ? 'activo' : 'baja'}
              onChange={v => set('estado', v === 'activo')}
              options={[{ value: 'activo', label: 'Activo' }, { value: 'baja', label: 'Dado de baja' }]}
            />
          </FormField>
        </div>
        <FormField label="Observación">
          <Textarea value={form.observacion} onChange={v => set('observacion', v)} rows={3} />
        </FormField>
      </FormSection>
    </FormPage>
  )
}
