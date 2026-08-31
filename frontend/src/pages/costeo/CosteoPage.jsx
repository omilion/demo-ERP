import { useState } from 'react';
import { Badge, Btn, Icon, PageHeader, Pager, SearchBar, Table } from '../../components/shared';
import { useRecetas, useTarifas, useCreateTarifa, useDeleteTarifa, useMaterialesHistorialPrecios, useRecalcularMasivo } from '../../api/costeo';
import { useBodegaTaller, useUpdateBodegaTaller, useCreateBodegaTaller } from '../../api/bodegaTaller';
import { useTalleres } from '../../api/pasarTaller';
import { EditorRecetaModal } from './components/EditorRecetaModal';
import { toast, confirmDialog } from '../../store/notif';
import PanelCobertura from './components/PanelCobertura'

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};

const COSTEO_PAGE_SIZE = 50;

export default function CosteoPage() {
  const [activeTab, setActiveTab] = useState('recetas');

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Módulo de Costeo de Fabricación"
        subtitle="Cálculo de costos reales Allegro, margen de transferencia y snapshots inmutables"
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('recetas')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            borderBottom: activeTab === 'recetas' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'recetas' ? 'var(--primary)' : 'var(--text-2)',
          }}
        >
          Recetas y Costeo (BOM)
        </button>

        <button
          onClick={() => setActiveTab('materias')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            borderBottom: activeTab === 'materias' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'materias' ? 'var(--primary)' : 'var(--text-2)',
          }}
        >
          Materias Primas
        </button>

        <button
          onClick={() => setActiveTab('tarifas')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            borderBottom: activeTab === 'tarifas' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'tarifas' ? 'var(--primary)' : 'var(--text-2)',
          }}
        >
          Tarifas Mano de Obra
        </button>
      </div>

      {activeTab === 'recetas' && <PanelCobertura />}
      {activeTab === 'recetas' && <RecetasTab />}
      {activeTab === 'materias' && <MateriasPrimasTab />}
      {activeTab === 'tarifas' && <TarifasTab />}
    </div>
  );
}

// ── TAB 1: RECETAS Y COSTEO ──────────────────────────────────────────────────
function RecetasTab() {
  const [search, setSearch] = useState('');
  const [tallerIdFilter, setTallerIdFilter] = useState('');
  const [conRecetaFilter, setConRecetaFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedProducto, setSelectedProducto] = useState(null);
  // Los talleres se leen de la base: estaban fijos en el codigo y ademas mal
  // mapeados (decia 1=Espumas cuando 1 es confecciones, y "Madera" no existe).
  const { data: talleresData } = useTalleres();
  const talleres = toArray(talleresData);

  const { data: recetasData, isLoading, isFetching } = useRecetas({
    search,
    tallerId: tallerIdFilter || undefined,
    conReceta: conRecetaFilter || undefined,
    page,
    limit: COSTEO_PAGE_SIZE,
  });

  const recalcularMasivo = useRecalcularMasivo();

  const handleRecalcularMasivo = async () => {
    const ok = await confirmDialog('¿Deseas simular la recalculación masiva de recetas activas?');
    if (!ok) return;

    try {
      const res = await recalcularMasivo.mutateAsync({ aplicar: false });
      toast.success(`Recálculo masivo procesado en ${res.totalProcesados} productos`);
    } catch {
      toast.error('Error al realizar recálculo masivo');
    }
  };

  const productos = toArray(recetasData);
  const total = Number(recetasData?.total) || 0;
  const pages = Math.max(1, Number(recetasData?.totalPages) || 1);

  const columns = [
    { key: 'codigoInterno', label: 'Código', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'nombre', label: 'Producto' },
    { key: 'precioLista', label: 'Precio Lista Actual', render: (v) => `$${(v || 0).toLocaleString('es-CL')}` },
    {
      key: 'receta',
      label: 'Estado Receta',
      render: (_, r) =>
        r.receta && r.receta.activo ? (
          <Badge tone="green">Con Receta</Badge>
        ) : (
          <Badge tone="amber">Sin Receta</Badge>
        ),
    },
    {
      key: 'costeoSnapshots',
      label: 'Último Snapshot',
      render: (v) => {
        const last = v?.[0];
        if (!last) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Sin snapshot</span>;
        return (
          <div style={{ fontSize: 12 }}>
            <div>${(last.costoTransferencia || 0).toLocaleString('es-CL')}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{new Date(last.createdAt).toLocaleDateString()}</div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Acciones',
      render: (_, r) => (
        <Btn size="xs" variant="secondary" onClick={() => setSelectedProducto(r)}>
          {r.receta ? 'Editar Receta' : 'Crear Receta'}
        </Btn>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <SearchBar
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar producto MK..."
          />

          <select
            value={tallerIdFilter}
            onChange={(e) => {
              setTallerIdFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Todos los talleres</option>
            {talleres.map((t) => <option key={t.id} value={String(t.id)}>{t.label || t.nombre}</option>)}
          </select>

          <select
            value={conRecetaFilter}
            onChange={(e) => {
              setConRecetaFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Todos los estados</option>
            <option value="true">Con receta</option>
            <option value="false">Sin receta</option>
          </select>
        </div>

        <Btn variant="secondary" onClick={handleRecalcularMasivo}>
          Simular Recálculo Masivo
        </Btn>
      </div>

      {pages > 1 && (
        <div
          aria-label="Paginación de productos MK"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '10px 14px',
            marginBottom: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: '#fff',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <strong>{total.toLocaleString('es-CL')}</strong> productos MK · {COSTEO_PAGE_SIZE} por página
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Btn size="xs" variant="secondary" onClick={() => setPage(1)} disabled={page <= 1 || isFetching}>
              Primera
            </Btn>
            <Btn size="xs" variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || isFetching}>
              Anterior
            </Btn>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
              Página
              <select
                aria-label="Ir a página de productos MK"
                value={page}
                onChange={(event) => setPage(Number(event.target.value))}
                disabled={isFetching}
                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
              >
                {Array.from({ length: pages }, (_, index) => index + 1).map((pageNumber) => (
                  <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
                ))}
              </select>
              de {pages}
            </label>
            <Btn size="xs" variant="secondary" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || isFetching}>
              Siguiente
            </Btn>
            <Btn size="xs" variant="secondary" onClick={() => setPage(pages)} disabled={page >= pages || isFetching}>
              Última
            </Btn>
          </div>
        </div>
      )}

      <Table columns={columns} rows={isLoading ? [] : productos} emptyMessage={isLoading ? 'Cargando recetas…' : 'Sin productos'} />
      <Pager
        page={page}
        pages={pages}
        total={total}
        limit={Number(recetasData?.limit) || COSTEO_PAGE_SIZE}
        shown={productos.length}
        onChange={setPage}
        disabled={isFetching}
      />

      {selectedProducto && (
        <EditorRecetaModal
          producto={selectedProducto}
          isOpen={true}
          onClose={() => setSelectedProducto(null)}
        />
      )}
    </div>
  );
}

// ── TAB 2: MATERIAS PRIMAS ──────────────────────────────────────────────────
function MateriasPrimasTab() {
  const [tallerFiltro, setTallerFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { data: bodegaData, isLoading } = useBodegaTaller();
  const { data: talleresData } = useTalleres();
  const updateBodega = useUpdateBodegaTaller();

  const [editingItem, setEditingItem] = useState(null);
  const [newPrecio, setNewPrecio] = useState('');
  const [motivo, setMotivo] = useState('');
  const [historyMaterialId, setHistoryMaterialId] = useState(null);
  const [creando, setCreando] = useState(false);

  const talleres = toArray(talleresData);
  const todos = toArray(bodegaData);
  const tallerNombre = id => { const t = talleres.find(x => x.id === id); return t ? (t.label || t.nombre) : null; };

  // Filtro en memoria: el listado de materias primas es chico (decenas), no
  // vale la pena ida y vuelta al servidor por cada tecla.
  const items = todos.filter(item => {
    const porTaller = !tallerFiltro
      || (tallerFiltro === 'sin' ? !item.tallerId : String(item.tallerId) === tallerFiltro);
    const texto = busqueda.trim().toLowerCase();
    const porTexto = !texto
      || [item.codigoInterno, item.nombre, item.detalle].filter(Boolean).join(' ').toLowerCase().includes(texto);
    return porTaller && porTexto;
  });

  const handleSavePrecio = async () => {
    if (!editingItem || !newPrecio) return;
    try {
      await updateBodega.mutateAsync({
        id: editingItem.id,
        data: { precio: Number(newPrecio), motivo },
      });
      toast.success('Precio actualizado correctamente');
      setEditingItem(null);
    } catch {
      toast.error('Error al actualizar precio');
    }
  };

  const columns = [
    { key: 'codigoInterno', label: 'Código', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'nombre', label: 'Nombre Material' },
    { key: 'detalle', label: 'Detalle', render: (v) => v || <span style={{ color: 'var(--text-3)' }}>—</span> },
    {
      key: 'tallerId',
      label: 'Taller',
      render: (v) => v
        ? <Badge tone="blue">{tallerNombre(v) || `#${v}`}</Badge>
        : <Badge tone="gray">Sin asignar</Badge>,
    },
    { key: 'unidadMedida', label: 'Unidad', render: (v) => v || 'u' },
    { key: 'stock', label: 'Stock', render: (v) => (v || 0).toLocaleString('es-CL') },
    { key: 'precio', label: 'Precio Unitario', render: (v) => `$${(v || 0).toLocaleString('es-CL')}` },
    {
      key: 'actions',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="xs" variant="secondary" onClick={() => { setEditingItem(r); setNewPrecio(r.precio || ''); }}>
            Editar Precio
          </Btn>
          <Btn size="xs" variant="ghost" onClick={() => setHistoryMaterialId(r.id)}>
            Histórico
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <SearchBar placeholder="Buscar por código, nombre o detalle" value={busqueda} onChange={setBusqueda} style={{ width: 300 }} />
        <select
          value={tallerFiltro}
          onChange={(e) => setTallerFiltro(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
        >
          <option value="">Todos los talleres</option>
          {talleres.map((t) => <option key={t.id} value={String(t.id)}>{t.label || t.nombre}</option>)}
          <option value="sin">Sin taller asignado</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} de {todos.length}</span>
        <div style={{ marginLeft: 'auto' }}>
          <Btn icon="plusCircle" onClick={() => setCreando(true)}>Nueva materia prima</Btn>
        </div>
      </div>

      <Table columns={columns} rows={isLoading ? [] : items} emptyMessage={isLoading ? 'Cargando materias primas…' : 'Sin materias primas'} />

      {creando && <NuevaMateriaPrimaModal talleres={talleres} onClose={() => setCreando(false)} />}

      {/* Edit Price Modal */}
      {editingItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 400 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Editar Precio: {editingItem.nombre}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Precio Nuevo ($)</label>
                <input
                  type="number"
                  value={newPrecio}
                  onChange={(e) => setNewPrecio(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo del cambio</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ej. Ajuste proveedor"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <Btn variant="secondary" onClick={() => setEditingItem(null)}>Cancelar</Btn>
                <Btn onClick={handleSavePrecio}>Guardar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyMaterialId && <MaterialHistoryModal materialId={historyMaterialId} onClose={() => setHistoryMaterialId(null)} />}
    </div>
  );
}

const UNIDADES = ['kg', 'mt', 'm2', 'm3', 'lt', 'plancha', 'rollo', 'unidad'];

function NuevaMateriaPrimaModal({ talleres, onClose }) {
  const crear = useCreateBodegaTaller();
  const [form, setForm] = useState({
    codigoInterno: '', nombre: '', detalle: '', unidadMedida: 'kg', precio: '', tallerId: '',
  });
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!form.codigoInterno.trim() || !form.nombre.trim()) {
      toast.warning('Código y nombre son obligatorios');
      return;
    }
    try {
      await crear.mutateAsync({
        codigoInterno: form.codigoInterno.trim(),
        nombre: form.nombre.trim(),
        detalle: form.detalle.trim() || undefined,
        unidadMedida: form.unidadMedida || undefined,
        precio: Number(form.precio) || 0,
        tallerId: form.tallerId ? Number(form.tallerId) : undefined,
      });
      toast.success('Materia prima creada');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo crear la materia prima');
    }
  };

  const campo = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4, fontFamily: 'inherit' };
  const etiqueta = { fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Nueva materia prima</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={etiqueta}>Código <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={form.codigoInterno} onChange={(e) => set('codigoInterno', e.target.value)} placeholder="ej. MP-ALGODON" style={campo} />
            </div>
            <div>
              <label style={etiqueta}>Taller</label>
              <select value={form.tallerId} onChange={(e) => set('tallerId', e.target.value)} style={{ ...campo, background: '#fff' }}>
                <option value="">Sin asignar</option>
                {talleres.map((t) => <option key={t.id} value={String(t.id)}>{t.label || t.nombre}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={etiqueta}>Nombre <span style={{ color: 'var(--red)' }}>*</span></label>
            <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="ej. Algodón" style={campo} />
          </div>

          <div>
            <label style={etiqueta}>Detalle</label>
            <input value={form.detalle} onChange={(e) => set('detalle', e.target.value)} placeholder="marca, formato u observación" style={campo} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={etiqueta}>Unidad</label>
              <select value={form.unidadMedida} onChange={(e) => set('unidadMedida', e.target.value)} style={{ ...campo, background: '#fff' }}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={etiqueta}>Costo por unidad ($)</label>
              <input type="number" value={form.precio} onChange={(e) => set('precio', e.target.value)} placeholder="0" style={campo} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
            <Btn onClick={guardar} disabled={crear.isPending}>{crear.isPending ? 'Creando…' : 'Crear'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialHistoryModal({ materialId, onClose }) {
  const { data: historyData } = useMaterialesHistorialPrecios(materialId);
  const history = toArray(historyData);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 500, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Historial de Precios de Materia Prima</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>

        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin cambios registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <div key={h.id} style={{ padding: 10, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>${h.precioAnterior.toLocaleString('es-CL')} ➔ ${h.precioNuevo.toLocaleString('es-CL')}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(h.createdAt).toLocaleDateString()}</span>
                </div>
                {h.motivo && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Motivo: {h.motivo}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB 3: TARIFAS DE MANO DE OBRA ─────────────────────────────────────────
function TarifasTab() {
  const { data: tarifasData, isLoading } = useTarifas();
  const { data: talleresData } = useTalleres();
  const createTarifa = useCreateTarifa();
  const deleteTarifa = useDeleteTarifa();

  const tarifas = toArray(tarifasData);
  const talleres = toArray(talleresData);

  const [showCreate, setShowCreate] = useState(false);
  const [tallerId, setTallerId] = useState('');
  const [proceso, setProceso] = useState('corte');
  const [valorHora, setValorHora] = useState('');

  const handleCreate = async () => {
    if (!tallerId || !proceso.trim() || valorHora === '') {
      toast.warning('Selecciona taller, proceso y valor hora');
      return;
    }
    try {
      await createTarifa.mutateAsync({
        tallerId: Number(tallerId),
        proceso,
        valorHora: Number(valorHora),
      });
      toast.success('Nueva tarifa agregada exitosamente');
      setShowCreate(false);
      setValorHora('');
    } catch {
      toast.error('Error al agregar tarifa');
    }
  };

  const handleDisable = async (id) => {
    const ok = await confirmDialog('¿Desactivar esta tarifa?');
    if (!ok) return;
    try {
      await deleteTarifa.mutateAsync(id);
      toast.success('Tarifa desactivada');
    } catch {
      toast.error('Error al desactivar tarifa');
    }
  };

  const columns = [
    { key: 'taller', label: 'Taller', render: (v) => v?.nombre || 'General' },
    { key: 'proceso', label: 'Proceso', render: (v) => String(v).toUpperCase() },
    { key: 'valorHora', label: 'Valor Hora ($)', render: (v) => `$${(v || 0).toLocaleString('es-CL')}` },
    { key: 'vigenteDesde', label: 'Vigente Desde', render: (v) => new Date(v).toLocaleDateString() },
    {
      key: 'actions',
      label: 'Acciones',
      render: (_, r) => (
        <Btn size="xs" variant="secondary" onClick={() => handleDisable(r.id)}>
          Desactivar
        </Btn>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Btn onClick={() => setShowCreate(true)}>+ Nueva Tarifa Proceso</Btn>
      </div>

      <Table columns={columns} rows={isLoading ? [] : tarifas} emptyMessage={isLoading ? 'Cargando tarifas…' : 'Sin tarifas vigentes'} />

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 400 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Nueva Tarifa de Mano de Obra</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Taller</label>
                <select value={tallerId} onChange={(e) => setTallerId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}>
                  <option value="">Selecciona un taller</option>
                  {talleres.map((t) => <option key={t.id} value={String(t.id)}>{t.label || t.nombre}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Proceso</label>
                <input
                  type="text"
                  value={proceso}
                  onChange={(e) => setProceso(e.target.value)}
                  placeholder="ej. corte, confeccion, enfundado"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Valor Hora ($)</label>
                <input
                  type="number"
                  value={valorHora}
                  onChange={(e) => setValorHora(e.target.value)}
                  placeholder="ej. 4200"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Btn>
                <Btn onClick={handleCreate}>Guardar Vigencia</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
