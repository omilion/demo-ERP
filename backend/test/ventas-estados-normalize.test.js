import { describe, it, expect } from 'vitest'
import {
  ESTADO_ENTREGA_VALUES,
  ESTADO_PAGO_VALUES,
  TIPO_VENTA_VALUES,
  normalizeEstadoEntrega,
  normalizeEstadoPago,
  normalizeTipoVenta,
} from '../src/routes/ventas/estados-normalize.js'

// Contexto: el ERP convive con el legacy MySQL, que escribe otra grafia de los
// mismos estados ("Entregado" en vez de "Entregada", "Venta sala" en vez de
// "Venta Sala"). La validacion aceptaba solo la grafia nativa, por lo que el
// 98% de las ordenes de produccion respondia 400 al editarse. Estos casos
// vienen de contar los valores reales en la base productiva el 26-08-2026.

describe('normalizeEstadoEntrega', () => {
  it('convierte la grafia legacy masculina a la forma canonica femenina', () => {
    // 15.813 ordenes en produccion tienen exactamente este valor.
    expect(normalizeEstadoEntrega('Entregado')).toBe('Entregada')
  })

  it('deja intactos los valores que ya son canonicos', () => {
    for (const value of ESTADO_ENTREGA_VALUES) {
      expect(normalizeEstadoEntrega(value)).toBe(value)
    }
  })

  it('tolera diferencias de mayusculas, acentos y espacios sobrantes', () => {
    expect(normalizeEstadoEntrega('  entregado ')).toBe('Entregada')
    expect(normalizeEstadoEntrega('PENDIENTE ENTREGA')).toBe('Pendiente entrega')
    expect(normalizeEstadoEntrega('en despacho')).toBe('En despacho')
  })

  it('devuelve null para un valor que no corresponde a ningun estado conocido', () => {
    expect(normalizeEstadoEntrega('cualquier cosa')).toBeNull()
    expect(normalizeEstadoEntrega('')).toBeNull()
    expect(normalizeEstadoEntrega(null)).toBeNull()
    expect(normalizeEstadoEntrega(undefined)).toBeNull()
  })
})

describe('normalizeTipoVenta', () => {
  it('unifica las grafias duplicadas que existen en produccion', () => {
    // 4.909 ordenes con minuscula contra 7 con mayuscula; 2.648 sin tilde contra 5 con tilde.
    expect(normalizeTipoVenta('Venta sala')).toBe('Venta Sala')
    expect(normalizeTipoVenta('Licitacion')).toBe('Licitación')
  })

  it('deja intactos los valores que ya son canonicos', () => {
    for (const value of TIPO_VENTA_VALUES) {
      expect(normalizeTipoVenta(value)).toBe(value)
    }
  })

  it('devuelve null para un tipo que no existe en el catalogo', () => {
    // "Test" son 2 filas de prueba en produccion: no es una grafia alternativa
    // de ningun tipo real, asi que no se adivina a que deberia mapear.
    expect(normalizeTipoVenta('Test')).toBeNull()
    expect(normalizeTipoVenta('')).toBeNull()
  })
})

describe('normalizeEstadoPago', () => {
  it('preserva los estados Webpay en vez de aplastarlos a "No pagada"', () => {
    // Describen un estado real del flujo de pago en linea. Su forma canonica
    // definitiva es una decision de negocio pendiente, asi que se conservan
    // tal cual: lo unico que se corrige es que dejen de bloquear la edicion.
    expect(normalizeEstadoPago('Rechazada Webpay')).toBe('Rechazada Webpay')
    expect(normalizeEstadoPago('Pendiente Webpay')).toBe('Pendiente Webpay')
  })

  it('deja intactos los valores que ya son canonicos', () => {
    for (const value of ESTADO_PAGO_VALUES) {
      expect(normalizeEstadoPago(value)).toBe(value)
    }
  })

  it('devuelve null para un estado de pago desconocido', () => {
    expect(normalizeEstadoPago('inventado')).toBeNull()
  })
})
