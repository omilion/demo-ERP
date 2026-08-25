// Definicion unica de la ficha de cliente.
//
// El cliente se crea desde dos lugares: el modulo Clientes (pagina completa) y
// Nueva Venta (panel lateral). Cada uno vuelve a donde corresponde, pero los
// campos, las validaciones y el payload que se envia al servidor tienen que ser
// exactamente los mismos: si divergen, un cliente creado desde una venta queda
// con menos datos que uno creado desde Clientes, sin que nadie lo note.
import { FormField, FormDivider, Input, Select } from './index'
import { PAISES_LATAM, REGIONES_CHILE, COMUNAS_POR_REGION } from '../../data/geoLatam'

// eslint-disable-next-line react-refresh/only-export-components
export const TIPOS_CLIENTE = ['Persona natural', 'Empresa', 'Institucional', 'Municipal', 'Gobierno', 'Distribuidor']

// eslint-disable-next-line react-refresh/only-export-components
export const CLIENTE_RULES = { nombre: { required: true }, rut: { required: true } }

const VACIO = {
  rut: '', nombre: '', razonSocial: '', giro: '', tipo: 'Empresa',
  direccion: '', pais: 'Chile', region: '', comuna: '',
  email: '', telefono: '',
  segmento: 'C', limiteCredito: '', diasInactivoAlerta: '',
}

// Convierte un cliente del servidor al estado del formulario.
// eslint-disable-next-line react-refresh/only-export-components
export function clienteToForm(cliente) {
  if (!cliente) return { ...VACIO }
  return {
    rut: cliente.rut || '',
    nombre: cliente.nombre || '',
    razonSocial: cliente.razonSocial || '',
    giro: cliente.giro || '',
    tipo: cliente.tipo || 'Empresa',
    direccion: cliente.direccion || '',
    pais: cliente.pais || 'Chile',
    region: cliente.region || '',
    comuna: cliente.comuna || '',
    email: cliente.email || '',
    // Historicamente este panel usaba `tel` y la pagina usaba `telefono`.
    telefono: cliente.telefono || cliente.tel || '',
    segmento: cliente.segmento || 'C',
    limiteCredito: cliente.limiteCredito != null ? String(cliente.limiteCredito) : '',
    diasInactivoAlerta: cliente.diasInactivoAlerta != null ? String(cliente.diasInactivoAlerta) : '',
  }
}

// Convierte el estado del formulario al cuerpo que espera el API.
// eslint-disable-next-line react-refresh/only-export-components
export function clienteFormToPayload(data) {
  return {
    rut: data.rut,
    nombre: data.nombre,
    razonSocial: data.razonSocial || undefined,
    giro: data.giro || undefined,
    tipo: data.tipo || undefined,
    direccion: data.direccion || undefined,
    region: data.region || undefined,
    comuna: data.comuna || undefined,
    pais: data.pais || undefined,
    email: data.email || undefined,
    telefono: data.telefono || undefined,
    segmento: data.segmento || undefined,
    limiteCredito: data.limiteCredito ? Number(data.limiteCredito) : undefined,
    diasInactivoAlerta: data.diasInactivoAlerta ? Number(data.diasInactivoAlerta) : undefined,
  }
}

// Si el valor guardado no calza con ninguna opcion del desplegable (dato legacy
// sin normalizar, o de un pais sin division en el catalogo), se agrega como
// opcion extra al final para no perderlo silenciosamente al editar.
function withCurrentValue(options, current) {
  if (!current || options.includes(current)) return options
  return [...options, current]
}

export function ClienteCampos({ data, set, errors = {} }) {
  return (
    <>
      <FormDivider label="Identificación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="RUT / Identificador" required error={errors.rut}>
          <Input value={data.rut} onChange={v => set('rut', v)} placeholder="76123456-7" error={errors.rut} />
        </FormField>
        <FormField label="Tipo de Cliente">
          <Select value={data.tipo} onChange={v => set('tipo', v)} options={TIPOS_CLIENTE} />
        </FormField>
      </div>
      <FormField label="Nombre / Nombre Comercial" required error={errors.nombre}>
        <Input value={data.nombre} onChange={v => set('nombre', v)} placeholder="Nombre o razón social corta" error={errors.nombre} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Razón Social" hint="Como en SII">
          <Input value={data.razonSocial} onChange={v => set('razonSocial', v)} placeholder="Razón social legal completa" />
        </FormField>
        <FormField label="Giro" hint="Actividad económica">
          <Input value={data.giro} onChange={v => set('giro', v)} placeholder="Ej: Comercio al por mayor" />
        </FormField>
      </div>

      <FormDivider label="Dirección" />
      <FormField label="Dirección">
        <Input value={data.direccion} onChange={v => set('direccion', v)} placeholder="Calle, número, depto/oficina" />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="País">
          <Select
            value={data.pais}
            onChange={v => { set('pais', v); if (v !== 'Chile') { set('region', ''); set('comuna', '') } }}
            options={withCurrentValue(PAISES_LATAM, data.pais)}
          />
        </FormField>
        <FormField label="Región">
          {data.pais === 'Chile'
            ? <Select value={data.region} onChange={v => { set('region', v); set('comuna', '') }} options={['', ...withCurrentValue(REGIONES_CHILE, data.region)]} />
            : <Input value={data.region} onChange={v => set('region', v)} placeholder="Región / provincia" />}
        </FormField>
        <FormField label="Comuna">
          {data.pais === 'Chile'
            ? <Select value={data.comuna} onChange={v => set('comuna', v)} options={['', ...withCurrentValue(COMUNAS_POR_REGION[data.region] || [], data.comuna)]} disabled={!data.region} />
            : <Input value={data.comuna} onChange={v => set('comuna', v)} placeholder="Comuna / distrito" />}
        </FormField>
      </div>

      <FormDivider label="Contacto" />
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
        <FormField label="Email">
          <Input value={data.email} onChange={v => set('email', v)} type="email" placeholder="correo@empresa.cl" />
        </FormField>
        <FormField label="Teléfono">
          <Input value={data.telefono} onChange={v => set('telefono', v)} placeholder="+56 9 1234 5678" />
        </FormField>
      </div>

      <FormDivider label="Crédito y segmentación" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <FormField label="Segmento" hint="A=Top, B=Medio, C=Base">
          <Select value={data.segmento} onChange={v => set('segmento', v)} options={['A', 'B', 'C']} />
        </FormField>
        <FormField label="Límite de Crédito" hint="0 = sin límite">
          <Input value={data.limiteCredito} onChange={v => set('limiteCredito', v)} type="number" prefix="$" placeholder="0" />
        </FormField>
        <FormField label="Días inactivo alerta" hint="Avisa si no compra">
          <Input value={data.diasInactivoAlerta} onChange={v => set('diasInactivoAlerta', v)} type="number" placeholder="90" />
        </FormField>
      </div>
    </>
  )
}
