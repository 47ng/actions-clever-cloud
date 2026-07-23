import { describe, expect, test } from 'vitest'
import { inspectCandidateImage, pinActionMetadata } from './candidate-image'

describe('inspectCandidateImage', () => {
  test('returns the pinned digest for a matching candidate image', async () => {
    const inspect = async (format: string) => {
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
          'org.opencontainers.image.revision': '0123456789abcdef0123456789abcdef01234567',
          'org.opencontainers.image.source':
            'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
        }),
        stderr: ''
      }
    }

    await expect(
      inspectCandidateImage({
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
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

  test('returns undefined when the candidate image is missing', async () => {
    await expect(
      inspectCandidateImage({
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
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
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
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
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async format => ({
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
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async format => ({
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
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async format => ({
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
        image: 'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async format => ({
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
  test('preserves the candidate metadata while replacing its image with the pinned digest', () => {
    const candidate = [
      'name: Example',
      'description: Example action',
      'inputs:',
      '  foo:',
      '    required: false',
      'runs:',
      '  using: docker',
      '  image: docker://ghcr.io/47ng/actions-clever-cloud:git-deadbeef # keep me',
      ''
    ].join('\n')

    expect(
      pinActionMetadata({
        actionMetadata: candidate,
        image:
          'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    ).toBe([
      'name: Example',
      'description: Example action',
      'inputs:',
      '  foo:',
      '    required: false',
      'runs:',
      '  using: docker',
      '  image: docker://ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # keep me',
      ''
    ].join('\n'))
  })

  test('fails when the candidate metadata has no docker image to pin', () => {
    expect(() =>
      pinActionMetadata({
        actionMetadata: 'name: Example\nruns:\n  using: composite\n',
        image:
          'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    ).toThrow('Candidate action metadata does not declare a docker image')
  })
})
