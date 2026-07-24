import { describe, expect, test } from 'vitest'
import { pinActionMetadata } from './candidate-image.ts'

describe('pinActionMetadata', () => {
  const pinnedImage =
    'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  test('preserves the candidate metadata while replacing its image with the pinned digest', () => {
    const candidate = [
      'name: Example',
      'description: Example action',
      'branding:',
      '  icon: upload-cloud',
      'inputs:',
      '  foo:',
      '    required: false',
      'runs:',
      '  using: docker',
      '  image: docker://ghcr.io/47ng/actions-clever-cloud:git-deadbeef # keep me',
      '  args:',
      '    - --flag',
      ''
    ].join('\n')

    expect(
      pinActionMetadata({
        actionMetadata: candidate,
        image: pinnedImage
      })
    ).toBe(
      [
        'name: Example',
        'description: Example action',
        'branding:',
        '  icon: upload-cloud',
        'inputs:',
        '  foo:',
        '    required: false',
        'runs:',
        '  using: docker',
        '  image: docker://ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # keep me',
        '  args:',
        '    - --flag',
        ''
      ].join('\n')
    )
  })

  test('rejects a decoy top-level image key', () => {
    expect(() =>
      pinActionMetadata({
        actionMetadata: [
          'name: Example',
          'image: docker://ghcr.io/evil/decoy:latest',
          'runs:',
          '  using: docker',
          '  image: docker://ghcr.io/47ng/actions-clever-cloud:git-deadbeef',
          ''
        ].join('\n'),
        image: pinnedImage
      })
    ).toThrow(/top-level execution key: image/)
  })

  test('rejects non-docker actions', () => {
    expect(() =>
      pinActionMetadata({
        actionMetadata: 'name: Example\nruns:\n  using: composite\n',
        image: pinnedImage
      })
    ).toThrow(/must describe a docker action/)
  })

  test('rejects duplicate image keys', () => {
    expect(() =>
      pinActionMetadata({
        actionMetadata: [
          'name: Example',
          'runs:',
          '  using: docker',
          '  image: docker://ghcr.io/47ng/actions-clever-cloud:git-deadbeef',
          '  image: docker://ghcr.io/evil/decoy:latest',
          ''
        ].join('\n'),
        image: pinnedImage
      })
    ).toThrow(/duplicate/i)
  })

  test('rejects malformed runs metadata', () => {
    expect(() =>
      pinActionMetadata({
        actionMetadata: 'name: Example\nruns: docker\n',
        image: pinnedImage
      })
    ).toThrow(/runs.*mapping/)
  })
})
