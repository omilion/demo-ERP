import { describe, it, expect, vi } from 'vitest';
import {
  getMaterialesHistorialPrecios,
  getTarifas,
  createTarifa,
  disableTarifa,
  getRecetas,
  getRecetaByProductoId,
  upsertReceta,
  disableReceta,
  calcularCosteoProducto,
  aplicarCosteoProducto,
  getSnapshots,
  recalcularMasivo,
  getCosteoBlockers,
} from '../src/routes/costeo/service.js';

describe('Costeo Service Unit & Logic Tests', () => {
  it('1. getMaterialesHistorialPrecios llama a prisma con bodegaTallerId', async () => {
    const mockPrisma = {
      bodegaTallerPrecioHistorial: {
        findMany: vi.fn().mockResolvedValue([{ id: 1, precioNuevo: 5000 }]),
      },
    };
    const result = await getMaterialesHistorialPrecios(mockPrisma, 10);
    expect(mockPrisma.bodegaTallerPrecioHistorial.findMany).toHaveBeenCalledWith({
      where: { bodegaTallerId: 10 },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
  });

  it('2. getTarifas sin historico retorna solo la tarifa vigente mas reciente por proceso', async () => {
    const mockPrisma = {
      tarifaProceso: {
        findMany: vi.fn().mockResolvedValue([
          { id: 2, tallerId: 1, proceso: 'corte', valorHora: 4000, vigenteDesde: new Date('2026-07-02') },
          { id: 1, tallerId: 1, proceso: 'corte', valorHora: 3800, vigenteDesde: new Date('2026-07-01') },
        ]),
      },
    };
    const result = await getTarifas(mockPrisma, { historico: false });
    expect(result).toHaveLength(1);
    expect(result[0].valorHora).toBe(4000);
  });

  it('3. createTarifa valida datos y crea la tarifa', async () => {
    const mockPrisma = {
      taller: { findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Espumas' }) },
      tarifaProceso: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 10, ...data })) },
    };

    await expect(createTarifa(mockPrisma, { tallerId: null, proceso: 'corte', valorHora: 100 })).rejects.toThrow();

    const created = await createTarifa(mockPrisma, { tallerId: 1, proceso: ' corte ', valorHora: 4200 });
    expect(created.proceso).toBe('corte');
    expect(created.valorHora).toBe(4200);
  });

  it('4. upsertReceta valida regla XOR (ambos o ninguno retornan error)', async () => {
    const mockPrisma = {
      producto: { findUnique: vi.fn().mockResolvedValue({ id: 5 }) },
    };

    // Ambos presentes
    await expect(
      upsertReceta(mockPrisma, 5, {
        materiales: [{ bodegaTallerId: 1, telaId: 2, cantidad: 1 }],
      })
    ).rejects.toThrow('Cada linea de material debe tener exactamente uno entre bodegaTallerId y telaId');

    // Ninguno presente
    await expect(
      upsertReceta(mockPrisma, 5, {
        materiales: [{ cantidad: 1 }],
      })
    ).rejects.toThrow('Cada linea de material debe tener exactamente uno entre bodegaTallerId y telaId');
  });

  it('5. calcularCosteoProducto realiza el cálculo con precios de bodega/tela y tarifas vigentes', async () => {
    const mockPrisma = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 100,
          codigoInterno: 'MK-100',
          nombre: 'Colchon Test',
          precioLista: 20000,
          receta: {
            activo: true,
            accesoriosMonto: 1000,
            ajusteGlobalPct: 3,
            margenTransferencia: 35,
            materiales: [
              { bodegaTallerId: 1, telaId: null, cantidad: 2, unidad: 'kg', material: { precio: 2000, nombre: 'Espuma', unidadMedida: 'kg' } },
              { bodegaTallerId: null, telaId: 2, cantidad: 3, unidad: 'm', tela: { precio: 3000, nombre: 'Tela Jacquard', codigo: 'T-01' } },
            ],
            procesos: [
              { tallerId: 1, proceso: 'corte', horas: 1 },
            ],
          },
        }),
      },
      tarifaProceso: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1, tallerId: 1, proceso: 'corte', valorHora: 4000, vigenteDesde: new Date() },
        ]),
      },
    };

    const res = await calcularCosteoProducto(mockPrisma, 100);

    // costoMateriales = 2*2000 + 3*3000 = 4000 + 9000 = 13000
    // costoManoObra = 1*4000 = 4000
    // accesorios = 1000
    // costoFabricacion = 13000 + 4000 + 1000 = 18000
    // costoAjustado = Math.round(18000 * 1.03) = 18540
    // costoTransferencia = Math.round(18540 * 1.35) = 25029
    expect(res.costoMateriales).toBe(13000);
    expect(res.costoManoObra).toBe(4000);
    expect(res.costoFabricacion).toBe(18000);
    expect(res.costoAjustado).toBe(18540);
    expect(res.costoTransferenciaCalculado).toBe(25029);
    expect(res.diferenciaMonto).toBe(5029);
    expect(res.alertas).toEqual({ materialesSinPrecio: [], procesosSinTarifa: [] });
  });

  it('6. identifica líneas valorizadas en cero antes de aplicar un precio', () => {
    expect(getCosteoBlockers({
      materiales: [
        { nombre: 'Espuma sin precio', cantidad: 2, precioUnitario: 0 },
        { nombre: 'Muestra sin consumo', cantidad: 0, precioUnitario: 0 },
      ],
      procesos: [
        { proceso: 'corte', horas: 1, valorHora: 0 },
        { proceso: 'enfundado', horas: 0, valorHora: 0 },
      ],
    })).toEqual({
      materialesSinPrecio: ['Espuma sin precio'],
      procesosSinTarifa: ['corte'],
    });
  });

  it('7. recalcularMasivo lanza error si se exceden 500 productos', async () => {
    const mockPrisma = {};
    const manyIds = Array.from({ length: 501 }, (_, i) => i + 1);

    await expect(
      recalcularMasivo(mockPrisma, { productoIds: manyIds })
    ).rejects.toThrow('Maximo 500 productos por llamada de recálculo masivo');
  });
});
