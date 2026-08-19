import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { RadioGroup } from './index.jsx'

function DeliveryTypeHarness() {
  const [value, setValue] = useState('corridos')

  return (
    <RadioGroup
      name="plazoEntregaTipo"
      ariaLabel="Tipo de días para la entrega"
      value={value}
      onChange={setValue}
      options={[
        { value: 'habiles', label: 'Días hábiles' },
        { value: 'corridos', label: 'Días corridos' },
      ]}
    />
  )
}

describe('RadioGroup', () => {
  it('muestra las dos alternativas y permite cambiar la selección', () => {
    render(<DeliveryTypeHarness />)

    const habiles = screen.getByRole('radio', { name: 'Días hábiles' })
    const corridos = screen.getByRole('radio', { name: 'Días corridos' })

    expect(screen.getByRole('radiogroup', { name: 'Tipo de días para la entrega' })).toBeTruthy()
    expect(corridos.checked).toBe(true)
    expect(habiles.checked).toBe(false)

    fireEvent.click(habiles)

    expect(habiles.checked).toBe(true)
    expect(corridos.checked).toBe(false)
  })
})
