import { useState } from 'react';
import { Badge, Btn, Icon, PageHeader, SearchBar, Table } from '../../components/shared';
import { useRecetas, useTarifas, useCreateTarifa, useDeleteTarifa, useMaterialesHistorialPrecios, useRecalcularMasivo } from '../../api/costeo';
import { useBodegaTaller, useUpdateBodegaTaller } from '../../api/bodegaTaller';
import { EditorRecetaModal } from './components/EditorRecetaModal';
import { toast, confirmDialog } from '../../store/notif';

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
  const [selectedProducto, setSelectedProducto] = useState(null);

  const { data: recetasData, isLoading } = useRecetas({
    search,
    tallerId: tallerIdFilter || undefined,
    conReceta: conRecetaFilter || undefined,
  });

  const recalcularMasivo = useRecalcularMasivo();

  const handleRecalcularMasivo = async () => {
    const ok = await confirmDialog('¿Deseas simular la recalculación masiva de recetas activas?');
    if (!ok) return;

    try {
      const res = await recalcularMasivo.mutateAsync({ aplicar: false });
      toast.success(`Recálculo masivo procesado en ${res.totalProcesados} productos`);
    } catch (e) {
      toast.error('Error al realizar recálculo masivo');
    }
  };

  const productos = recetasData?.data || [];

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
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto..." />

          <select
            value={tallerIdFilter}
            onChange={(e) => setTallerIdFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Todos los talleres</option>
            <option value="1">Espumas</option>
            <option value="2">Confecciones</option>
            <option value="3">Madera</option>
          </select>

          <select
            value={conRecetaFilter}
            onChange={(e) => setConRecetaFilter(e.target.value)}
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

      <Table columns={columns} data={productos} isLoading={isLoading} />

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
  const { data: bodegaData, isLoading } = useBodegaTaller();
  const updateBodega = useUpdateBodegaTaller();

  const [editingItem, setEditingItem] = useState(null);
  const [newPrecio, setNewPrecio] = useState('');
  const [motivo, setMotivo] = useState('');
  const [historyMaterialId, setHistoryMaterialId] = useState(null);

  const items = Array.isArray(bodegaData) ? bodegaData : (bodegaData?.data || []);

  const handleSavePrecio = async () => {
    if (!editingItem || !newPrecio) return;
    try {
      await updateBodega.mutateAsync({
        id: editingItem.id,
        data: { precio: Number(newPrecio), motivo },
      });
      toast.success('Precio actualizado correctamente');
      setEditingItem(null);
    } catch (e) {
      toast.error('Error al actualizar precio');
    }
  };

  const columns = [
    { key: 'codigoInterno', label: 'Código', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'nombre', label: 'Nombre Material' },
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
      <Table columns={columns} data={items} isLoading={isLoading} />

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

function MaterialHistoryModal({ materialId, onClose }) {
  const { data: history = [] } = useMaterialesHistorialPrecios(materialId);

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
  const { data: tarifas = [], isLoading } = useTarifas();
  const createTarifa = useCreateTarifa();
  const deleteTarifa = useDeleteTarifa();

  const [showCreate, setShowCreate] = useState(false);
  const [tallerId, setTallerId] = useState(1);
  const [proceso, setProceso] = useState('corte');
  const [valorHora, setValorHora] = useState('');

  const handleCreate = async () => {
    if (!valorHora) return;
    try {
      await createTarifa.mutateAsync({
        tallerId: Number(tallerId),
        proceso,
        valorHora: Number(valorHora),
      });
      toast.success('Nueva tarifa agregada exitosamente');
      setShowCreate(false);
      setValorHora('');
    } catch (e) {
      toast.error('Error al agregar tarifa');
    }
  };

  const handleDisable = async (id) => {
    const ok = await confirmDialog('¿Desactivar esta tarifa?');
    if (!ok) return;
    try {
      await deleteTarifa.mutateAsync(id);
      toast.success('Tarifa desactivada');
    } catch (e) {
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

      <Table columns={columns} data={tarifas} isLoading={isLoading} />

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 400 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Nueva Tarifa de Mano de Obra</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Taller</label>
                <select value={tallerId} onChange={(e) => setTallerId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginTop: 4 }}>
                  <option value="1">Espumas</option>
                  <option value="2">Confecciones</option>
                  <option value="3">Madera</option>
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
