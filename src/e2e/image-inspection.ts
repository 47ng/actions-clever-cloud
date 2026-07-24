import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type InspectResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type InspectFormat = '{{println .Manifest.Digest}}' | '{{json .Image}}'

export type InspectCommand = (
  format: InspectFormat,
  reference: string
) => Promise<InspectResult>

export type InspectCandidateImageOptions = {
  image: string
  expectedRevision: string
  expectedSourceRepository: string
  inspect: InspectCommand
}

export type CandidateImage = {
  digest: string
  image: string
}

export type CandidateImageProbe =
  | { missing: true; registryStderr: string }
  | { missing: false; digest: string; image: string }

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { encoding: 'utf8'; timeout: number }
) => Promise<{ stdout: string; stderr: string }>

function isMissingImage(stderr: string): boolean {
  return /not found|manifest unknown|name unknown/i.test(stderr)
}

const DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/

export function inspectionFailure(image: string, stderr: string): Error {
  return new Error(
    `Failed to inspect ${image}: ${stderr || 'unknown registry inspection error'}`
  )
}

export function createImagetoolsInspect({
  execFileAsync = promisify(execFile) as ExecFileAsync
}: { execFileAsync?: ExecFileAsync } = {}): InspectCommand {
  return async (format, reference) => {
    try {
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['buildx', 'imagetools', 'inspect', '--format', format, reference],
        { encoding: 'utf8', timeout: 60_000 }
      )
      return { exitCode: 0, stdout, stderr }
    } catch (error) {
      const failure = error as {
        code?: number
        stdout?: string
        stderr?: string
        message: string
      }
      return {
        exitCode: failure.code ?? 1,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message
      }
    }
  }
}

export async function probeCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect
}: InspectCandidateImageOptions): Promise<CandidateImageProbe> {
  const digestResult = await inspect('{{println .Manifest.Digest}}', image)
  if (digestResult.exitCode !== 0) {
    if (isMissingImage(digestResult.stderr)) {
      return { missing: true, registryStderr: digestResult.stderr }
    }
    throw inspectionFailure(image, digestResult.stderr)
  }

  const digest = digestResult.stdout.trim()
  if (!DIGEST_REGEX.test(digest)) {
    throw new Error(`Invalid candidate image digest: ${digest}`)
  }

  const pinnedImage = image.replace(/:[^:@]+$/, `@${digest}`)
  const imageResult = await inspect('{{json .Image}}', pinnedImage)
  if (imageResult.exitCode !== 0) {
    throw inspectionFailure(image, imageResult.stderr)
  }

  const expectedSource = `https://github.com/${expectedSourceRepository}/tree/${expectedRevision}`
  for (const labels of parsePlatformLabels(imageResult.stdout, image)) {
    const actualRevision = labels['org.opencontainers.image.revision']
    if (actualRevision !== expectedRevision) {
      throw new Error(
        `Candidate image revision mismatch: expected ${expectedRevision}, got ${actualRevision ?? '(missing)'}`
      )
    }

    const actualSource = labels['org.opencontainers.image.source']
    if (actualSource !== expectedSource) {
      throw new Error(
        `Candidate image source mismatch: expected ${expectedSource}, got ${actualSource ?? '(missing)'}`
      )
    }
  }

  return {
    missing: false,
    digest,
    image: pinnedImage
  }
}

export async function inspectCandidateImage(
  options: InspectCandidateImageOptions
): Promise<CandidateImage | undefined> {
  const probe = await probeCandidateImage(options)
  if (probe.missing) {
    return undefined
  }

  return {
    digest: probe.digest,
    image: probe.image
  }
}

type InspectedImageConfig = {
  config?: { Labels?: Record<string, string> | null }
}

function parsePlatformLabels(
  stdout: string,
  image: string
): Array<Record<string, string>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`Invalid candidate image labels for ${image}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid candidate image labels for ${image}`)
  }

  if ('config' in parsed) {
    return [(parsed as InspectedImageConfig).config?.Labels ?? {}]
  }

  const platforms = Object.entries(
    parsed as Record<string, InspectedImageConfig | null>
  ).filter(([platform]) => !platform.startsWith('unknown/'))

  if (
    platforms.length === 0 ||
    platforms.some(
      ([, platformImage]) => typeof platformImage?.config !== 'object'
    )
  ) {
    throw new Error(`Invalid candidate image labels for ${image}`)
  }

  return platforms.map(
    ([, platformImage]) => platformImage?.config?.Labels ?? {}
  )
}
