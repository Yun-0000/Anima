import { CHARACTER_OPTIONS, DEFAULT_CHARACTER_ID } from './catalog'

describe('character catalog', () => {
  test('uses Jane as the default female character identity', () => {
    expect(DEFAULT_CHARACTER_ID).toBe('jane')
    expect(CHARACTER_OPTIONS[0]).toMatchObject({
      id: 'jane',
      label: 'Jane',
    })
  })
})
