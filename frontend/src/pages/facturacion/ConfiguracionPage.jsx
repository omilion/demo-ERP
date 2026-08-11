import { useRef, useState } from 'react'
import { PageHeader, Btn, Badge, Table } from '../../components/shared'
import { FormField, Input, Select } from '../../components/forms'
import { useEmpresa, useUpdateEmpresa, useUploadCertificado, useCafs, useUploadCaf, useDeleteCaf, useAjustarFolioCaf, useReiniciarCafCertificacion } from '../../api/facturacion'
import { useAuthStore } from '../../store/auth'
import { can } from '../../utils/permissions'
import { toast, confirmDialog } from '../../store/notif'

const panelStyle = { background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 16 }
const errorText = error => error?.response?.data?.error || 'No se pudo completar la acción.'

const EMPRESA_EMPTY = {
  rut: '', razonSocial: '', giro: '', acteco: '', direccion: '', comuna: '', ciudad: '',
  telefono: '', email: '',
  rutEnvia: '', fchResol: '', nroResol: '', ambiente: 'certificacion',
}

const AMBIENTE_OPTIONS = [
  { value: 'certificacion', label: 'Certificación (maullin)' },
  { value: 'produccion', label: 'Producción (palena)' },
]

function EmpresaSection({ canWrite }) {
  const { data, isLoading } = useEmpresa()
  const updateMut = useUpdateEmpresa()
  const [draft, setDraft] = useState({})
  const form = { ...EMPRESA_EMPTY, ...(data?.empresa || {}), ...draft }
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const save = () => {
    updateMut.mutate({ ...form, nroResol: Number(form.nroResol) || 0 }, {
      onSuccess: () => { toast.success('Datos del emisor guardados.'); setDraft({}) },
      onError: err => toast.error(errorText(err)),
    })
  }

  if (isLoading) return <div style={panelStyle}>Cargando...</div>

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Datos del emisor</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="RUT empresa"><Input value={form.rut} disabled={!canWrite} onChange={v => set('rut', v)} placeholder="76.354.051-0" /></FormField>
        <FormField label="Razón social"><Input value={form.razonSocial} disabled={!canWrite} onChange={v => set('razonSocial', v)} /></FormField>
        <FormField label="Giro (tal como en Mi SII, sin abreviar)"><Input value={form.giro} disabled={!canWrite} onChange={v => set('giro', v)} /></FormField>
        <FormField label="Código actividad económica (Acteco)"><Input value={form.acteco} disabled={!canWrite} onChange={v => set('acteco', v)} placeholder="620200" /></FormField>
        <FormField label="Dirección"><Input value={form.direccion} disabled={!canWrite} onChange={v => set('direccion', v)} /></FormField>
        <FormField label="Comuna"><Input value={form.comuna} disabled={!canWrite} onChange={v => set('comuna', v)} /></FormField>
        <FormField label="Ciudad"><Input value={form.ciudad} disabled={!canWrite} onChange={v => set('ciudad', v)} /></FormField>
        <FormField label="Teléfono"><Input value={form.telefono} disabled={!canWrite} onChange={v => set('telefono', v)} /></FormField>
        <FormField label="Email"><Input value={form.email} disabled={!canWrite} onChange={v => set('email', v)} /></FormField>
        <FormField label="RUT firmante (titular del certificado)"><Input value={form.rutEnvia} disabled={!canWrite} onChange={v => set('rutEnvia', v)} placeholder="16608585-3" /></FormField>
        <FormField label="Fecha resolución SII (FchResol)"><Input type="date" value={form.fchResol || ''} disabled={!canWrite} onChange={v => set('fchResol', v)} /></FormField>
        <FormField label="N° resolución (0 en certificación)"><Input type="number" value={form.nroResol} disabled={!canWrite} onChange={v => set('nroResol', v)} /></FormField>
        <FormField label="Ambiente"><Select value={form.ambiente} disabled={!canWrite} onChange={v => set('ambiente', v)} options={AMBIENTE_OPTIONS} /></FormField>
      </div>
      {canWrite && <div style={{ marginTop: 14, textAlign: 'right' }}>
        <Btn variant="primary" onClick={save} disabled={updateMut.isPending}>{updateMut.isPending ? 'Guardando...' : 'Guardar cambios'}</Btn>
      </div>}
    </div>
  )
}

function CertificadoSection({ canWrite }) {
  const { data } = useEmpresa()
  const uploadMut = useUploadCertificado()
  const [password, setPassword] = useState('')
  const fileRef = useRef(null)
  const cert = data?.certificado || { cargado: false }

  const handleFile = e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const formData = new FormData()
    formData.append('certificado', file)
    if (password) formData.append('password', password)
    uploadMut.mutate(formData, {
      onSuccess: res => {
        setPassword('')
        if (res.certificado?.valido) toast.success('Certificado cargado y validado.')
        else toast.warning(`Certificado cargado con advertencia: ${res.certificado?.error || 'no se pudo validar.'}`)
      },
      onError: err => toast.error(errorText(err)),
    })
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Certificado digital (.p12 / .pfx)</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: canWrite ? 14 : 0 }}>
        {!cert.cargado && <Badge tone="red">Sin certificado cargado</Badge>}
        {cert.cargado && cert.valido && <Badge tone="green">Certificado válido</Badge>}
        {cert.cargado && !cert.valido && <Badge tone="amber">Certificado inválido</Badge>}
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {!cert.cargado && 'Es obligatorio para firmar y autenticarse ante el SII.'}
          {cert.cargado && cert.valido && <>
            <strong style={{ color: 'var(--text-1)' }}>{cert.subject}</strong>
            {cert.rutTitular && <> — RUT {cert.rutTitular}</>}
            {cert.validTo && <> — vence {new Date(cert.validTo).toLocaleDateString('es-CL')}</>}
          </>}
          {cert.cargado && !cert.valido && cert.error}
        </div>
      </div>
      {canWrite && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ width: 220 }}>
          <FormField label="Contraseña del certificado">
            <Input type="password" value={password} onChange={setPassword} />
          </FormField>
        </div>
        <input ref={fileRef} type="file" accept=".p12,.pfx" hidden onChange={handleFile} />
        <Btn variant="secondary" icon="upload" disabled={uploadMut.isPending} onClick={() => fileRef.current?.click()}>
          {uploadMut.isPending ? 'Subiendo...' : 'Subir certificado'}
        </Btn>
      </div>}
    </div>
  )
}

function CafsSection({ canWrite, canAdjustFolios }) {
  const { data: empresaData } = useEmpresa()
  const { data, isLoading } = useCafs()
  const uploadMut = useUploadCaf()
  const deleteMut = useDeleteCaf()
  const ajustarMut = useAjustarFolioCaf()
  const reiniciarMut = useReiniciarCafCertificacion()
  const fileRef = useRef(null)
  const ambiente = empresaData?.empresa?.ambiente || 'certificacion'

  const handleFile = e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const formData = new FormData()
    formData.append('caf', file)
    formData.append('ambiente', ambiente)
    uploadMut.mutate(formData, {
      onSuccess: () => toast.success('CAF cargado. Folios disponibles para emitir.'),
      onError: err => toast.error(errorText(err)),
    })
  }

  const handleDelete = async row => {
    const ok = await confirmDialog({ title: 'Eliminar CAF', detail: `¿Eliminar el CAF de ${row.tipoNombre} (folios ${row.folioDesde}–${row.folioHasta})? Esta acción no se puede deshacer.`, tone: 'danger' })
    if (!ok) return
    deleteMut.mutate(row.id, {
      onSuccess: () => toast.success('CAF eliminado.'),
      onError: err => toast.error(errorText(err)),
    })
  }

  const handleAdjust = row => {
    const value = window.prompt(`Nuevo siguiente folio para ${row.tipoNombre}. Rango CAF ${row.folioDesde}-${row.folioHasta}:`, String(row.siguienteFolio))
    if (value == null) return
    const siguienteFolio = Number(value)
    const motivo = window.prompt('Motivo del ajuste (minimo 10 caracteres):', '')
    if (!motivo) return
    const confirmacion = window.prompt('Escribe AJUSTAR FOLIO para confirmar. Nunca se permite reutilizar folios ya emitidos:', '')
    if (confirmacion !== 'AJUSTAR FOLIO') return toast.error('Confirmacion cancelada o incorrecta.')
    ajustarMut.mutate({ id: row.id, siguienteFolio, motivo: motivo.trim(), confirmacion }, {
      onSuccess: result => toast.success(`Siguiente folio actualizado de ${result.ajuste.folioAnterior} a ${result.ajuste.folioNuevo}.`),
      onError: err => toast.error(errorText(err)),
    })
  }

  const handleResetCertification = async row => {
    const ok = await confirmDialog({
      title: 'Reiniciar folios de certificación',
      detail: `El CAF de ${row.tipoNombre} volverá al folio ${row.folioDesde}. Esto reutiliza folios solo para continuar las pruebas ante el SII y nunca está permitido en producción.`,
      tone: 'danger',
    })
    if (!ok) return
    const confirmacion = window.prompt('Escribe REINICIAR CAF CERTIFICACION para confirmar:', '')
    if (confirmacion !== 'REINICIAR CAF CERTIFICACION') return toast.error('Confirmación cancelada o incorrecta.')
    reiniciarMut.mutate({
      id: row.id,
      motivo: 'Reinicio del rango para continuar pruebas SII',
      confirmacion,
    }, {
      onSuccess: result => toast.success(`CAF reiniciado. Próximo folio: ${result.caf.siguienteFolio}; disponibles: ${result.disponibles}.`),
      onError: err => toast.error(errorText(err)),
    })
  }

  const columns = [
    { key: 'tipoNombre', label: 'Documento', render: (v, row) => `${v} (${row.tipoDte})` },
    { key: 'folioDesde', label: 'Rango', render: (_, row) => `${row.folioDesde} — ${row.folioHasta}` },
    { key: 'siguienteFolio', label: 'Siguiente folio' },
    { key: 'disponibles', label: 'Disponibles', align: 'right', render: v => <Badge tone={v > 0 ? 'green' : 'red'}>{v}</Badge> },
    { key: 'ambiente', label: 'Ambiente', render: v => v === 'produccion' ? 'Producción' : 'Certificación' },
    ...(canWrite ? [{ key: 'id', label: '', align: 'right', render: (_, row) => <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{canAdjustFolios && row.ambiente === 'certificacion' && <button onClick={() => handleResetCertification(row)} disabled={reiniciarMut.isPending} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: reiniciarMut.isPending ? 'wait' : 'pointer', fontWeight: 600, fontSize: 12 }}>Reiniciar pruebas</button>}{canAdjustFolios && <button onClick={() => handleAdjust(row)} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Ajustar folio</button>}<button onClick={() => handleDelete(row)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Borrar</button></div> }] : []),
  ]

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Folios (CAF)</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Descárgalo en el Menú de Postulantes (certificación) o Timbraje electrónico (producción). Se cargará al ambiente: <strong>{ambiente === 'produccion' ? 'Producción' : 'Certificación'}</strong>.
          </div>
        </div>
        {canWrite && <>
          <input ref={fileRef} type="file" accept=".xml" hidden onChange={handleFile} />
          <Btn variant="secondary" icon="upload" disabled={uploadMut.isPending} onClick={() => fileRef.current?.click()}>
            {uploadMut.isPending ? 'Subiendo...' : 'Subir CAF'}
          </Btn>
        </>}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <Table columns={columns} rows={isLoading ? [] : (data?.cafs || [])} emptyMessage="Sin CAF cargados. Sin folios no se puede emitir." ariaLabel="Folios CAF" columnPrefsKey="facturacion-cafs" getRowKey={row => row.id} />
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  const user = useAuthStore(s => s.user)
  const canWrite = can(user, 'facturacion', 'write')
  const canAdjustFolios = user?.role === 'admin'
  return (
    <main className="page page-wide">
      <PageHeader title="Configuración" subtitle="Facturación electrónica DTE/SII" breadcrumb={['Inicio', 'Facturación', 'Configuración']} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <EmpresaSection canWrite={canWrite} />
        <CertificadoSection canWrite={canWrite} />
        <CafsSection canWrite={canWrite} canAdjustFolios={canAdjustFolios} />
      </div>
    </main>
  )
}
