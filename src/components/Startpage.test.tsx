// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Startpage, { type StartpageCategory } from './Startpage'

const categories: StartpageCategory[] = [
  {
    id: 'first-category',
    name: 'First',
    visibility: 'public',
    apps: [
      {
        id: 'panel',
        name: 'Panel',
        url: 'https://panel.example.com',
        icon: 'cloud',
        domain: 'panel.example.com',
      },
      {
        id: 'unmatched',
        name: 'Cloudflare',
        url: 'https://cloudflare.example.com',
        icon: 'cloud',
        domain: 'cloudflare.example.com',
      },
    ],
  },
  {
    id: 'second-category',
    name: 'Second',
    visibility: 'public',
    apps: [
      {
        id: 'node',
        name: 'Node',
        url: 'https://node.example.com',
        icon: 'cloud',
        domain: 'node.example.com',
      },
      {
        id: 'neon',
        name: 'Neon',
        url: 'https://neon.example.com',
        icon: 'cloud',
        domain: 'neon.example.com',
      },
    ],
  },
]

function focusedAppId() {
  return (document.activeElement as HTMLElement | null)?.dataset.appId
}

describe('Startpage free-typing search', () => {
  afterEach(cleanup)

  it('selects matches in visual order and wraps with Left and Right', () => {
    render(<Startpage categories={categories} />)

    fireEvent.keyDown(document, { key: 'n', keyCode: 78, which: 78 })
    expect(focusedAppId()).toBe('panel')

    fireEvent.keyDown(document, { key: 'ArrowRight', keyCode: 39, which: 39 })
    expect(focusedAppId()).toBe('node')

    fireEvent.keyDown(document, { key: 'ArrowRight', keyCode: 39, which: 39 })
    expect(focusedAppId()).toBe('neon')

    fireEvent.keyDown(document, { key: 'ArrowRight', keyCode: 39, which: 39 })
    expect(focusedAppId()).toBe('panel')

    fireEvent.keyDown(document, { key: 'ArrowLeft', keyCode: 37, which: 37 })
    expect(focusedAppId()).toBe('neon')
  })

  it('resets selection to the first visible match when the query changes', () => {
    render(<Startpage categories={categories} />)

    fireEvent.keyDown(document, { key: 'n', keyCode: 78, which: 78 })
    fireEvent.keyDown(document, { key: 'ArrowLeft', keyCode: 37, which: 37 })
    expect(focusedAppId()).toBe('neon')

    fireEvent.keyDown(document, { key: 'o', keyCode: 79, which: 79 })
    expect(focusedAppId()).toBe('node')
    expect(document.activeElement?.getAttribute('href')).toBe(
      'https://node.example.com',
    )
  })

  it('leaves Left and Right to the search input when it is focused', () => {
    render(<Startpage categories={categories} />)
    const input = screen.getByRole('textbox', { name: 'Search apps' })

    input.focus()
    fireEvent.change(input, { target: { value: 'n' } })
    fireEvent.keyDown(input, { key: 'ArrowRight', keyCode: 39, which: 39 })

    expect(document.activeElement).toBe(input)
  })
})
