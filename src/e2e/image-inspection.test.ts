import { describe, expect, test } from 'vitest'
import {
  createImagetoolsInspect,
  inspectCandidateImage,
  probeCandidateImage
} from './image-inspection.ts'

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
          architecture: 'amd64',
          os: 'linux',
          config: {
            Labels: {
              'org.opencontainers.image.revision':
                '0123456789abcdef0123456789abcdef01234567',
              'org.opencontainers.image.source':
                'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
            }
          }
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
            stdout: JSON.stringify({
              config: {
                Labels:
                  reference === pinnedImage
                    ? {
                        'org.opencontainers.image.revision':
                          '0123456789abcdef0123456789abcdef01234567',
                        'org.opencontainers.image.source':
                          'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
                      }
                    : {
                        'org.opencontainers.image.revision':
                          'race-on-mutable-tag',
                        'org.opencontainers.image.source':
                          'https://github.com/evil/fork/tree/race-on-mutable-tag'
                      }
              }
            }),
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
        format: '{{json .Image}}',
        reference: pinnedImage
      }
    ])
  })

  test('verifies labels on every platform of a multi-arch image', async () => {
    const matchingLabels = {
      'org.opencontainers.image.revision':
        '0123456789abcdef0123456789abcdef01234567',
      'org.opencontainers.image.source':
        'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
    }
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
          'linux/amd64': { config: { Labels: matchingLabels } },
          'linux/arm64': { config: { Labels: matchingLabels } },
          'unknown/unknown': { config: {} }
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

  test('rejects a multi-arch image when any platform mismatches', async () => {
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
          'linux/amd64': {
            config: {
              Labels: {
                'org.opencontainers.image.revision':
                  '0123456789abcdef0123456789abcdef01234567',
                'org.opencontainers.image.source':
                  'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
              }
            }
          },
          'linux/arm64': {
            config: {
              Labels: {
                'org.opencontainers.image.revision': 'tampered-platform',
                'org.opencontainers.image.source':
                  'https://github.com/evil/fork/tree/tampered-platform'
              }
            }
          }
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
    ).rejects.toThrow('Candidate image revision mismatch')
  })

  test('rejects an index containing only attestation manifests', async () => {
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
        stdout: JSON.stringify({ 'unknown/unknown': { config: {} } }),
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
    ).rejects.toThrow('Invalid candidate image labels')
  })

  test('rejects a multi-arch entry without an image config', async () => {
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
          'linux/amd64': { architecture: 'amd64' }
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
    ).rejects.toThrow('Invalid candidate image labels')
  })

  test('reports missing labels instead of crashing when the config has none', async () => {
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
        stdout: JSON.stringify({ architecture: 'amd64', config: {} }),
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
    ).rejects.toThrow(
      'Candidate image revision mismatch: expected 0123456789abcdef0123456789abcdef01234567, got (missing)'
    )
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
                  config: {
                    Labels: {
                      'org.opencontainers.image.revision':
                        '89abcdef012345670123456789abcdef01234567',
                      'org.opencontainers.image.source':
                        'https://github.com/47ng/actions-clever-cloud/tree/89abcdef012345670123456789abcdef01234567'
                    }
                  }
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
                  config: {
                    Labels: {
                      'org.opencontainers.image.revision':
                        '0123456789abcdef0123456789abcdef01234567',
                      'org.opencontainers.image.source':
                        'https://github.com/evil/fork/tree/0123456789abcdef0123456789abcdef01234567'
                    }
                  }
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

describe('probeCandidateImage', () => {
  test('reports a missing image with the registry stderr', async () => {
    await expect(
      probeCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'ghcr.io/47ng/actions-clever-cloud: not found'
        })
      })
    ).resolves.toEqual({
      missing: true,
      registryStderr: 'ghcr.io/47ng/actions-clever-cloud: not found'
    })
  })

  test('fails on non-missing inspection errors', async () => {
    await expect(
      probeCandidateImage({
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

  test('returns the verified digest identity when the image exists', async () => {
    await expect(
      probeCandidateImage({
        image:
          'ghcr.io/47ng/actions-clever-cloud:git-0123456789abcdef0123456789abcdef01234567',
        expectedRevision: '0123456789abcdef0123456789abcdef01234567',
        expectedSourceRepository: '47ng/actions-clever-cloud',
        inspect: async format => ({
          exitCode: 0,
          stdout:
            format === '{{println .Manifest.Digest}}'
              ? `sha256:${'a'.repeat(64)}\n`
              : JSON.stringify({
                  config: {
                    Labels: {
                      'org.opencontainers.image.revision':
                        '0123456789abcdef0123456789abcdef01234567',
                      'org.opencontainers.image.source':
                        'https://github.com/47ng/actions-clever-cloud/tree/0123456789abcdef0123456789abcdef01234567'
                    }
                  }
                }),
          stderr: ''
        })
      })
    ).resolves.toEqual({
      missing: false,
      digest: `sha256:${'a'.repeat(64)}`,
      image:
        'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    })
  })
})

describe('createImagetoolsInspect', () => {
  test('runs docker buildx imagetools inspect with a 60 second timeout', async () => {
    const calls: Array<{
      file: string
      args: string[]
      options: { encoding: 'utf8'; timeout: number }
    }> = []
    const inspect = createImagetoolsInspect({
      execFileAsync: async (file, args, options) => {
        calls.push({ file, args, options })
        return { stdout: 'digest output', stderr: 'progress noise' }
      }
    })

    await expect(
      inspect('{{println .Manifest.Digest}}', 'ghcr.io/47ng/example:tag')
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'digest output',
      stderr: 'progress noise'
    })

    expect(calls).toEqual([
      {
        file: 'docker',
        args: [
          'buildx',
          'imagetools',
          'inspect',
          '--format',
          '{{println .Manifest.Digest}}',
          'ghcr.io/47ng/example:tag'
        ],
        options: { encoding: 'utf8', timeout: 60_000 }
      }
    ])
  })

  test('maps execution failures to the inspect result shape', async () => {
    const inspect = createImagetoolsInspect({
      execFileAsync: async () => {
        throw Object.assign(new Error('exit status 1'), {
          code: 3,
          stdout: 'partial output',
          stderr: 'manifest unknown'
        })
      }
    })

    await expect(
      inspect('{{json .Image}}', 'ghcr.io/47ng/example:tag')
    ).resolves.toEqual({
      exitCode: 3,
      stdout: 'partial output',
      stderr: 'manifest unknown'
    })
  })

  test('falls back to defaults when the failure has no exec metadata', async () => {
    const inspect = createImagetoolsInspect({
      execFileAsync: async () => {
        throw new Error('spawn docker ENOENT')
      }
    })

    await expect(
      inspect('{{json .Image}}', 'ghcr.io/47ng/example:tag')
    ).resolves.toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'spawn docker ENOENT'
    })
  })
})
