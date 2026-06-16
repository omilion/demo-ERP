import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Markdown } from '../components/Markdown.jsx'

describe('Markdown', () => {
  it('renderiza tabla GFM como <table>', () => {
    const md = `| Código | Producto | Stock |
|--------|----------|-------|
| FIB-001 | Fibra Dacron | 2 |
| VIS-002 | Viscoelástico | 3 |

**Interpretación:** Los casos más urgentes.`
    const { container } = render(<Markdown text={md} />)
    expect(container.querySelectorAll('table').length).toBe(1)
    expect(container.querySelectorAll('th').length).toBe(3)
    expect(container.querySelectorAll('tbody tr').length).toBe(2)
    expect(container.querySelector('strong')?.textContent).toBe('Interpretación:')
  })
  it('renderiza listas y negrita', () => {
    const { container } = render(<Markdown text={'- uno\n- **dos**\n'} />)
    expect(container.querySelectorAll('li').length).toBe(2)
  })
})
