// Las grafias de tipo de venta se definian por separado en cinco modulos, con
// conjuntos distintos, de modo que el mismo filtro entregaba totales distintos
// segun la pantalla. Este test fija el catalogo unico para que no vuelva a
// divergir en silencio: cualquier modulo que agregue una grafia a mano y no al
// catalogo hace fallar el barrido del final.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GRAFIAS_CONVENIO_MARCO,
  GRAFIAS_LICITACION,
  GRAFIAS_VENTA_DIRECTA,
  GRAFIAS_VENTA_SALA,
  LICITACION_MOJIBAKE,
  TIPOS_VENTA_MOSTRADOR,
  normalizeTipoVenta,
} from '../src/routes/ventas/estados-normalize.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RUTAS = path.join(AQUI, '..', 'src', 'routes')

describe('catalogo de grafias de tipo de venta', () => {
  it('incluye la forma canonica y la legacy sin tilde', () => {
    expect(GRAFIAS_LICITACION).toContain('Licitación')
    expect(GRAFIAS_LICITACION).toContain('Licitacion')
  })

  // El mojibake existe realmente en la base: UTF-8 leido como latin1 en alguna
  // importacion. Hasta ahora solo el reporte de comisiones lo contemplaba, asi
  // que esas ordenes quedaban fuera del resto de las pantallas.
  it('incluye el mojibake heredado de la importacion', () => {
    expect(LICITACION_MOJIBAKE).toBe('LicitaciÃ³n')
    expect(GRAFIAS_LICITACION).toContain(LICITACION_MOJIBAKE)
  })

  it('cubre ambas capitalizaciones de convenio marco y venta sala', () => {
    expect(GRAFIAS_CONVENIO_MARCO).toEqual(expect.arrayContaining(['Convenio Marco', 'Convenio marco']))
    expect(GRAFIAS_VENTA_SALA).toEqual(expect.arrayContaining(['Venta Sala', 'Venta sala']))
    expect(GRAFIAS_VENTA_DIRECTA).toEqual(expect.arrayContaining(['Venta directa', 'Venta Directa']))
  })

  it('no repite valores, que en un IN serian ruido', () => {
    for (const grafias of [GRAFIAS_LICITACION, GRAFIAS_CONVENIO_MARCO, TIPOS_VENTA_MOSTRADOR]) {
      expect(new Set(grafias).size).toBe(grafias.length)
    }
  })
})

describe('agrupacion de venta de mostrador', () => {
  it('reune sala, directa y la forma legacy Normal', () => {
    expect(TIPOS_VENTA_MOSTRADOR).toEqual(expect.arrayContaining([
      ...GRAFIAS_VENTA_SALA,
      ...GRAFIAS_VENTA_DIRECTA,
      'Normal',
    ]))
  })

  // Es una agrupacion de negocio, no de grafia: Convenio Marco es un tipo
  // distinto y no debe colarse aqui, como ocurria en matriz-ventas.
  it('no arrastra Convenio Marco', () => {
    for (const grafia of GRAFIAS_CONVENIO_MARCO) {
      expect(TIPOS_VENTA_MOSTRADOR).not.toContain(grafia)
    }
  })
})

describe('normalizeTipoVenta escribe siempre la forma canonica', () => {
  it('resuelve toda grafia de licitacion a la canonica', () => {
    for (const grafia of ['Licitación', 'Licitacion', 'licitacion', '  LICITACION  ']) {
      expect(normalizeTipoVenta(grafia)).toBe('Licitación')
    }
  })

  it('resuelve las capitalizaciones de convenio marco y venta sala', () => {
    expect(normalizeTipoVenta('Convenio marco')).toBe('Convenio Marco')
    expect(normalizeTipoVenta('venta sala')).toBe('Venta Sala')
  })

  it('devuelve null para un tipo desconocido, en vez de inventarlo', () => {
    expect(normalizeTipoVenta('Trato Directo')).toBeNull()
    expect(normalizeTipoVenta('')).toBeNull()
    expect(normalizeTipoVenta(null)).toBeNull()
  })
})

describe('ningun modulo filtra por una sola grafia', () => {
  function archivosJs(dir) {
    const salida = []
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name)
      if (entrada.isDirectory()) salida.push(...archivosJs(completo))
      else if (entrada.name.endsWith('.js')) salida.push(completo)
    }
    return salida
  }

  // Un `where.tipo = 'Licitación'` deja fuera en silencio las ordenes escritas
  // por los importadores legacy. El filtro tiene que nombrar el catalogo.
  it('no quedan asignaciones de where.tipo con una grafia suelta', () => {
    const sospechoso = /(?:where\.tipo|ordenWhere\.tipo)\s*=\s*'(?:Licitaci|Convenio|Venta [Ss]ala|Venta [Dd]irecta)/
    const infractores = []
    for (const archivo of archivosJs(RUTAS)) {
      const src = fs.readFileSync(archivo, 'utf8')
      src.split('\n').forEach((linea, i) => {
        if (sospechoso.test(linea)) infractores.push(`${path.relative(RUTAS, archivo)}:${i + 1}`)
      })
    }
    expect(infractores).toEqual([])
  })
})
