import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Table } from './index.jsx'

describe('Table Sorting and Column Ordering', () => {
  beforeEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  const sampleColumns = [
    { key: 'comuna', label: 'Comuna' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'total', label: 'Total' },
    { key: '_actions', label: '', sortable: false },
  ]

  const sampleRows = [
    { id: 1, comuna: 'Santiago', cliente: 'Zeta Corp', total: '$50.000' },
    { id: 2, comuna: 'Antofagasta', cliente: 'Alfa Spa', total: '$10.000' },
    { id: 3, comuna: 'Concepción', cliente: 'Beta Ltda', total: '$120.000' },
  ]

  it('ordena filas alfabéticamente (A-Z y Z-A) al hacer clic en la cabecera', () => {
    render(
      <Table
        columns={sampleColumns}
        rows={sampleRows}
        getRowKey={row => row.id}
      />
    )

    // Inicial: Santiago, Antofagasta, Concepción
    const getRenderedComunas = () => {
      const rows = document.querySelectorAll('.data-table tbody tr')
      return Array.from(rows).map(r => r.querySelectorAll('td')[0].textContent.trim())
    }

    expect(getRenderedComunas()).toEqual(['Santiago', 'Antofagasta', 'Concepción'])

    // Clic en cabecera 'Comuna' -> Orden ascendente: Antofagasta, Concepción, Santiago
    const comunaHeader = screen.getByTitle('Ordenar por Comuna')
    fireEvent.click(comunaHeader)

    expect(getRenderedComunas()).toEqual(['Antofagasta', 'Concepción', 'Santiago'])
    expect(comunaHeader.getAttribute('aria-sort')).toBe('ascending')

    // Segundo clic en cabecera 'Comuna' -> Orden descendente: Santiago, Concepción, Antofagasta
    fireEvent.click(comunaHeader)

    expect(getRenderedComunas()).toEqual(['Santiago', 'Concepción', 'Antofagasta'])
    expect(comunaHeader.getAttribute('aria-sort')).toBe('descending')

    // Tercer clic -> Restablece al orden natural original
    fireEvent.click(comunaHeader)
    expect(getRenderedComunas()).toEqual(['Santiago', 'Antofagasta', 'Concepción'])
    expect(comunaHeader.getAttribute('aria-sort')).toBeNull()
  })

  it('ordena montos monetarios formateados en CLP correctamente por valor numérico', () => {
    render(
      <Table
        columns={sampleColumns}
        rows={sampleRows}
        getRowKey={row => row.id}
      />
    )

    const getTotalValues = () => {
      const rows = document.querySelectorAll('.data-table tbody tr')
      return Array.from(rows).map(r => r.querySelectorAll('td')[2].textContent.trim())
    }

    const totalHeader = screen.getByTitle('Ordenar por Total')
    // Clic ascendente: $10.000 < $50.000 < $120.000
    fireEvent.click(totalHeader)
    expect(getTotalValues()).toEqual(['$10.000', '$50.000', '$120.000'])

    // Clic descendente: $120.000 > $50.000 > $10.000
    fireEvent.click(totalHeader)
    expect(getTotalValues()).toEqual(['$120.000', '$50.000', '$10.000'])
  })

  it('no permite ordenar columnas marcadas con sortable: false o _actions', () => {
    render(
      <Table
        columns={sampleColumns}
        rows={sampleRows}
        getRowKey={row => row.id}
      />
    )

    const headers = document.querySelectorAll('.data-table thead th')
    const actionHeader = headers[3]

    expect(actionHeader.getAttribute('title')).toBeFalsy()
    expect(actionHeader.style.cursor).toBe('default')
    expect(actionHeader.getAttribute('aria-sort')).toBeNull()
  })

  it('permite abrir el menú de Columnas y reordenar con los botones de posición', () => {
    const manyColumns = [
      { key: 'col1', label: 'Columna 1' },
      { key: 'col2', label: 'Columna 2' },
      { key: 'col3', label: 'Columna 3' },
      { key: 'col4', label: 'Columna 4' },
      { key: 'col5', label: 'Columna 5' },
      { key: 'col6', label: 'Columna 6' },
    ]
    const manyRows = [{ id: 1, col1: 'A', col2: 'B', col3: 'C', col4: 'D', col5: 'E', col6: 'F' }]

    render(
      <Table
        ariaLabel="Tabla Reordenamiento"
        columns={manyColumns}
        rows={manyRows}
        columnPrefsKey="test-reorder"
        getRowKey={r => r.id}
      />
    )

    // Abrir menú de columnas
    const colBtn = screen.getByTitle('Columnas visibles y orden')
    fireEvent.click(colBtn)

    expect(screen.getByText('Columnas & Orden')).toBeTruthy()

    // Bajar Columna 1
    const downButtons = screen.getAllByTitle('Mover abajo')
    fireEvent.click(downButtons[0]) // Mueve Columna 1 abajo de Columna 2

    const headers = Array.from(document.querySelectorAll('.data-table thead th')).map(th => th.textContent.trim())
    // Ahora Columna 2 debe ser la primera
    expect(headers[0]).toBe('Columna 2')
    expect(headers[1]).toBe('Columna 1')
  })
})
