import { describe, expect, test } from 'vitest'
import { inspectCandidateImage, pinActionMetadata } from './candidate-image'

describe('inspectCandidateImage', () => {
  test('returns the pinned digest for a matching candidate image', async () => {
    const inspect = async (format: string, reference: string) => {
      expect(reference).toMatch(
        /ghcr\.io\/47ng\/actions-clever-cloud(?:[:@].+)?$/
      )

      if (format === '{{println .Manifest.Digest}}') {
        return {
          exitCode: 0,
          stdout: `sha256:${'a'.repeat(64)}\n`,
          stderr: ''
        }
      }

      return {
        exitCode: 0,
        stdout: JSON.stringify({
          'org.opencontainers.image.revision':
            '0123456789abcdef0123456789abcdef01234567',
          'org.opencontainers.image.source':
            'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
        }),
        stderr: ''
      }
    }

    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect
      })
    ).resolves.toEqual({
      digest: `sha256:${'a'.repeat(64)}`,
      image:
        'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    })
  })

  test('inspects labels from the verified digest instead of the mutable tag', async () => {
    const mutableImage =
      'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567'
    const pinnedImage =
      'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const inspections: Array<{ format: string; reference: string }> = []

    await expect(
      inspectCandidateImage({
        image: mutableImage,
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async (format, reference) => {
          inspections.push({ format, reference })

          if (format === '{{println .Manifest.Digest}}') {
            return {
              exitCode: 0,
              stdout: `sha256:${'a'.repeat(64)}\n`,
              stderr: ''
            }
          }

          return {
            exitCode: 0,
            stdout: JSON.stringify(
              reference === pinnedImage
                ? {
                    'org.opencontainers.image.revision':
                      '0123456789abcdef0123456789abcdef01234567',
                    'org.opencontainers.image.source':
                      'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
                  }
                : {
                    'org.opencontainers.image.revision': 'race-on-mutable-tag',
                    'org.opencontainers.image.source':
                      'https://github.com/evil/fork/tree/race-on-mutable-tag'
                  }
            ),
            stderr: ''
          }
        }
      })
    ).resolves.toEqual({
      digest: `sha256:${'a'.repeat(64)}`,
      image: pinnedImage
    })

    expect(inspections).toEqual([
      {
        format: '{{println .Manifest.Digest}}',
        reference: mutableImage
      },
      {
        format: '{{json .Image.Config.Labels}}',
        reference: pinnedImage
      }
    ])
  })

  test('returns undefined when the candidate image is missing', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'manifest unknown'
        })
      })
    ).resolves.toBeUndefined()
  })

  test('fails when image inspection errors for another reason', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'dial tcp: lookup ghcr.io: no such host'
        })
      })
    ).rejects.toThrow(
      'Failed to inspect ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567: dial tcp: lookup ghcr.io: no such host'
    )
  })

  test('rejects a malformed digest', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async (format, _reference) => ({
          exitCode: 0,
          stdout:
            format === '{{println .Manifest.Digest}}'
              ? 'not-a-digest\n'
              : JSON.stringify({
                  'org.opencontainers.image.revision':
                    '0123456789abcdef0123456789abcdef01234567',
                  'org.opencontainers.image.source':
                    'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
                }),
          stderr: ''
        })
      })
    ).rejects.toThrow('Invalid candidate image digest: not-a-digest')
  })

  test('rejects an image built from another revision', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async (format, _reference) => ({
          exitCode: 0,
          stdout:
            format === '{{println .Manifest.Digest}}'
              ? `sha256:${'a'.repeat(64)}\n`
              : JSON.stringify({
                  'org.opencontainers.image.revision':
                    '89abcdef012345670123456789abcdef01234567',
                  'org.opencontainers.image.source':
                    'https://github.com/47ng/actions-clever-cloud/tree/89abcdef012345670123456789abcdef01234567'
                }),
          stderr: ''
        })
      })
    ).rejects.toThrow(
      'Candidate image revision mismatch: expected 0123456789abcdef0123456789abcdef01234567, got 89abcdef012345670123456789abcdef01234567'
    )
  })

  test('rejects an image built from another repository source', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async (format, _reference) => ({
          exitCode: 0,
          stdout:
            format === '{{println .Manifest.Digest}}'
              ? `sha256:${'a'.repeat(64)}\n`
              : JSON.stringify({
                  'org.opencontainers.image.revision':
                    '0123456789abcdef0123456789abcdef01234567',
                  'org.opencontainers.image.source':
                    'https://github.com/evil/fork/tree/0123456789abcdef0123456789abcdef01234567'
                }),
          stderr: ''
        })
      })
    ).rejects.toThrow(
      'Candidate image source mismatch: expected https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567, got https://github.com/evil/fork/tree/0123456789abcdef0123456789abcdef01234567'
    )
  })

  test('rejects malformed label output', async () => {
    await expect(
      inspectCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async (format, _reference) => ({
          exitCode: 0,
          stdout:
            format === '{{println .Manifest.Digest}}'
              ? `sha256:${'a'.repeat(64)}\n`
              : '{not json',
          stderr: ''
        })
      })
    ).rejects.toThrow(
      'Invalid candidate image labels for ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567'
    )
  })
})

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
