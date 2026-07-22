import { describe, it, expect } from 'vitest';
import { calcularCosteo } from '../src/routes/costeo/engine.js';

describe('Costeo Engine Unit Tests', () => {
  it('1. Caso con materiales, procesos y accesorios calcula escalones correctamente', () => {
    // Ejemplo:
    // Insumos: Espuma (1.5 * 1000 = 1500), Tela (2 * 2500 = 5000) => costoMateriales = 6500
    // Procesos: Corte (0.5h * 3800 = 1900), Confeccion (1h * 4200 = 4200) => costoManoObra = 6100
    // Accesorios: 1400
    // costoFabricacion = 6500 + 6100 + 1400 = 14000
    // ajusteGlobalPct = 3% => costoAjustado = Math.round(14000 * 1.03) = 14420
    // margenTransferencia = 35% => costoTransferencia = Math.round(14420 * 1.35) = 19467
    const result = calcularCosteo({
      materiales: [
        { cantidad: 1.5, precioUnitario: 1000, nombre: 'Espuma' },
        { cantidad: 2, precioUnitario: 2500, nombre: 'Tela' },
      ],
      procesos: [
        { horas: 0.5, valorHora: 3800, proceso: 'corte' },
        { horas: 1.0, valorHora: 4200, proceso: 'confeccion' },
      ],
      accesoriosMonto: 1400,
      ajusteGlobalPct: 3,
      margenTransferencia: 35,
    });

    expect(result.costoMateriales).toBe(6500);
    expect(result.costoManoObra).toBe(6100);
    expect(result.costoAccesorios).toBe(1400);
    expect(result.costoFabricacion).toBe(14000);
    expect(result.costoAjustado).toBe(14420);
    expect(result.costoTransferencia).toBe(19467);
  });

  it('2. Márgenes de transferencia distintos (35% vs 15%) dan resultados distintos y correctos', () => {
    const baseInput = {
      materiales: [{ cantidad: 1, precioUnitario: 10000 }],
      procesos: [],
      accesoriosMonto: 0,
      ajusteGlobalPct: 0,
    };

    const res35 = calcularCosteo({ ...baseInput, margenTransferencia: 35 });
    const res15 = calcularCosteo({ ...baseInput, margenTransferencia: 15 });

    expect(res35.costoFabricacion).toBe(10000);
    expect(res35.costoTransferencia).toBe(13500);

    expect(res15.costoFabricacion).toBe(10000);
    expect(res15.costoTransferencia).toBe(11500);
  });

  it('3. Receta vacía retorna todo en 0 y sin NaN', () => {
    const result = calcularCosteo({});

    expect(result.costoMateriales).toBe(0);
    expect(result.costoManoObra).toBe(0);
    expect(result.costoAccesorios).toBe(0);
    expect(result.costoFabricacion).toBe(0);
    expect(result.costoAjustado).toBe(0);
    expect(result.costoTransferencia).toBe(0);
    expect(Number.isNaN(result.costoTransferencia)).toBe(false);
  });

  it('4. Cantidades o precios nulos/negativos se tratan como 0 sin NaN', () => {
    const result = calcularCosteo({
      materiales: [
        { cantidad: -5, precioUnitario: 100 },
        { cantidad: null, precioUnitario: undefined },
      ],
      procesos: [{ horas: -1, valorHora: -500 }],
      accesoriosMonto: -100,
      ajusteGlobalPct: -10,
      margenTransferencia: -20,
    });

    expect(result.costoMateriales).toBe(0);
    expect(result.costoManoObra).toBe(0);
    expect(result.costoAccesorios).toBe(0);
    expect(result.costoFabricacion).toBe(0);
    expect(result.costoAjustado).toBe(0);
    expect(result.costoTransferencia).toBe(0);
    expect(Number.isNaN(result.costoTransferencia)).toBe(false);
  });

  it('5. Redondeo: solo se aplica al final de cada uno de los 3 escalones', () => {
    // 0.33 * 10 = 3.3
    // 0.33 * 20 = 6.6
    // costoMateriales = 9.9
    // costoFabricacion = Math.round(9.9) = 10 (no redondear 3.3 a 3 y 6.6 a 7)
    const result = calcularCosteo({
      materiales: [
        { cantidad: 0.33, precioUnitario: 10 },
        { cantidad: 0.33, precioUnitario: 20 },
      ],
      procesos: [],
      accesoriosMonto: 0,
      ajusteGlobalPct: 0,
      margenTransferencia: 0,
    });

    expect(result.costoMateriales).toBeCloseTo(9.9);
    expect(result.costoFabricacion).toBe(10);
  });

  it('6. ajusteGlobalPct = 0 resulta en costoAjustado igual a costoFabricacion', () => {
    const result = calcularCosteo({
      materiales: [{ cantidad: 2, precioUnitario: 5000 }],
      procesos: [{ horas: 1, valorHora: 4000 }],
      accesoriosMonto: 500,
      ajusteGlobalPct: 0,
      margenTransferencia: 20,
    });

    expect(result.costoFabricacion).toBe(14500);
    expect(result.costoAjustado).toBe(14500);
    expect(result.costoTransferencia).toBe(17400);
  });
});
