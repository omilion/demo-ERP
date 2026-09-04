import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Btn, FilterSelect, PageHeader, Pager, SearchBar, Table, Tabs } from '../../components/shared';
import { useRecetas, useTarifas, useCreateTarifa, useDeleteTarifa, useRecalcularMasivo, useProcesosCosteo } from '../../api/costeo';
import { useBodegaTaller, useDeleteBodegaTaller } from '../../api/bodegaTaller';
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

const TABS = [
  { id: 'recetas', label: 'Recetas y Costeo (BOM)' },
  { id: 'materias', label: 'Materias Primas' },
  { id: 'tarifas', label: 'Tarifas Mano de Obra' },
];

export default function CosteoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.id === tabParam) ? tabParam : 'recetas';
  const [creandoTarifa, setCreandoTarifa] = useState(false);

  // La accion de cada pestaña vive a la altura de las pestañas, no encima de la
  // tabla: asi la fila de herramientas de la tabla queda solo para filtros.
  const accionDePestana = {
    materias: <Btn size="sm" icon="plusCircle" onClick={() => navigate('/materias-primas/nueva?volver=/costeo%3Ftab%3Dmaterias')}>Nueva materia prima</Btn>,
    tarifas: <Btn size="sm" icon="plusCircle" onClick={() => setCreandoTarifa(true)}>Nueva tarifa de proceso</Btn>,
  }[activeTab];

  return (
    <main className="page page-wide">
      <PageHeader title="Módulo de Costeo de Fabricación" />

      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', borderBottom: '2px solid var(--border)', marginBottom: 20,
      }}>
        <Tabs
          tabs={TABS}
          active={activeTab}
          onChange={(id) => setSearchParams(id === 'recetas' ? {} : { tab: id })}
          style={{ marginBottom: 0, borderBottom: 'none' }}
        />
        {accionDePestana && <div style={{ paddingBottom: 8 }}>{accionDePestana}</div>}
      </div>

      {activeTab === 'recetas' && <PanelCobertura />}
      {activeTab === 'recetas' && <RecetasTab />}
      {activeTab === 'materias' && <MateriasPrimasTab />}
      {activeTab === 'tarifas' && <TarifasTab creando={creandoTarifa} setCreando={setCreandoTarifa} />}
    </main>
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
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [tallerFiltro, setTallerFiltro] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  const { data: talleresData } = useTalleres();
  const deleteBodega = useDeleteBodegaTaller();
  const talleres = toArray(talleresData);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setBusquedaAplicada(busqueda); setPage(1); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [busqueda]);

  // El filtrado corre en el servidor: la lista se sirve paginada de a 200 y el
  // filtro en memoria solo veia la primera pagina, de modo que el contador y la
  // busqueda mentian apenas el catalogo superara ese tamaño.
  const params = { page: String(page) };
  if (busquedaAplicada) params.search = busquedaAplicada;
  if (tallerFiltro === 'sin') params.tallerId = '';
  else if (tallerFiltro) params.tallerId = tallerFiltro;

  const { data: bodegaData, isLoading, isFetching } = useBodegaTaller(params);
  const items = toArray(bodegaData);
  const total = Number(bodegaData?.total) || 0;
  const pages = Math.max(1, Number(bodegaData?.pages) || 1);

  const tallerNombre = (id) => {
    const t = talleres.find((x) => x.id === id);
    return t ? (t.label || t.nombre) : null;
  };

  const materialesEspuma = items.filter((item) => /espuma/i.test(String(tallerNombre(item.tallerId) || '')));
  const espumasSinFichaTecnica = materialesEspuma.filter((item) => item.densidadKgM3 == null || item.espesorMm == null || !item.formato).length;

  const handleDelete = async (item) => {
    const ok = await confirmDialog(`¿Desactivar ${item.nombre}? Se conserva su historial y las recetas ya usadas.`);
    if (!ok) return;
    try {
      await deleteBodega.mutateAsync(item.id);
      toast.success('Materia prima desactivada');
    } catch (error) {
      toast.error(error.response?.data?.error || 'No se pudo desactivar la materia prima');
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
    { key: 'densidadKgM3', label: 'Densidad', render: (v) => v == null ? '—' : `${Number(v).toLocaleString('es-CL')} kg/m³` },
    { key: 'espesorMm', label: 'Espesor', render: (v) => v == null ? '—' : `${Number(v).toLocaleString('es-CL')} mm` },
    { key: 'formato', label: 'Formato', render: (v) => v || '—' },
    { key: 'stock', label: 'Stock', render: (v) => (v || 0).toLocaleString('es-CL') },
    { key: 'precio', label: 'Precio Unitario', render: (v) => `$${(v || 0).toLocaleString('es-CL')}` },
    {
      key: '_actions',
      label: 'Acciones',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="xs" variant="secondary" onClick={() => navigate(`/materias-primas/${r.id}?volver=/costeo%3Ftab%3Dmaterias`)}>Ver</Btn>
          <Btn size="xs" variant="secondary" onClick={() => navigate(`/materias-primas/${r.id}/editar?volver=/costeo%3Ftab%3Dmaterias`)}>Editar</Btn>
          <Btn size="xs" variant="ghost" onClick={() => handleDelete(r)}>Eliminar</Btn>
        </div>
      ),
    },
  ];

  const tallerOptions = [
    { value: '', label: 'Todos los talleres' },
    ...talleres.map((t) => ({ value: String(t.id), label: t.label || t.nombre })),
    { value: 'sin', label: 'Sin taller asignado' },
  ];

  const hayFiltros = Boolean(busqueda || tallerFiltro);

  const toolbarExtra = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
      <FilterSelect
        value={tallerFiltro}
        onChange={(v) => { setTallerFiltro(v); setPage(1); }}
        options={tallerOptions}
        placeholder="Talleres"
        active={Boolean(tallerFiltro)}
        minMenuWidth={220}
      />
      {hayFiltros && (
        <button
          type="button"
          className="table-tool-btn"
          onClick={() => { setBusqueda(''); setTallerFiltro(''); setPage(1); }}
        >
          Limpiar filtros
        </button>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
        {items.length} de {total.toLocaleString('es-CL')}
      </span>
      <div style={{ marginLeft: 'auto' }}>
        <SearchBar
          placeholder="Buscar por código, nombre o detalle"
          value={busqueda}
          onChange={setBusqueda}
          style={{ width: 280, height: 28 }}
        />
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '14px 16px', marginBottom: 14, borderRadius: 10, border: '1px solid #bae6fd', background: '#f0f9ff' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0c4a6e' }}>Ficha técnica de espumas</div>
          <div style={{ fontSize: 12, color: '#075985', marginTop: 3 }}>La densidad, espesor y formato pertenecen a la materia prima; lote, calidad y merma se controlan en Taller.</div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: '#0369a1' }}>{materialesEspuma.length}</div><div style={{ fontSize: 11, color: '#075985' }}>materiales Espumas (en esta vista)</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: espumasSinFichaTecnica ? '#b45309' : '#15803d' }}>{espumasSinFichaTecnica}</div><div style={{ fontSize: 11, color: '#075985' }}>fichas por completar</div></div>
        </div>
      </div>

      <Table
        columns={columns}
        rows={isLoading ? [] : items}
        emptyMessage={isLoading ? 'Cargando materias primas…' : 'Sin materias primas'}
        ariaLabel="Materias primas de costeo"
        columnPrefsKey="costeo-materias-primas"
        getRowKey={(row) => row.id}
        onRowDoubleClick={(row) => navigate(`/materias-primas/${row.id}?volver=/costeo%3Ftab%3Dmaterias`)}
        toolbarExtra={toolbarExtra}
        pager={{ page, pages, onChange: setPage, disabled: isFetching }}
      />
    </div>
  );
}

// ── TAB 3: TARIFAS DE MANO DE OBRA ─────────────────────────────────────────
function TarifasTab({ creando, setCreando }) {
  const { data: tarifasData, isLoading } = useTarifas();
  const { data: talleresData } = useTalleres();
  const { data: procesosData } = useProcesosCosteo();
  const createTarifa = useCreateTarifa();
  const deleteTarifa = useDeleteTarifa();

  const tarifas = toArray(tarifasData);
  const talleres = toArray(talleresData);
  const procesos = toArray(procesosData);

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
      setCreando(false);
      setValorHora('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al agregar tarifa');
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
      <Table columns={columns} rows={isLoading ? [] : tarifas} emptyMessage={isLoading ? 'Cargando tarifas…' : 'Sin tarifas vigentes'} />

      {creando && (
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
                {/* El proceso sale del catalogo: escrito libre, un nombre que no
                    cruza con la receta deja esa hora en cero sin avisar. */}
                <label style={{ fontSize: 12, fontWeight: 600 }}>Proceso</label>
                <select
                  value={proceso}
                  onChange={(e) => setProceso(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}
                >
                  {procesos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
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
                <Btn variant="secondary" onClick={() => setCreando(false)}>Cancelar</Btn>
                <Btn onClick={handleCreate}>Guardar Vigencia</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
