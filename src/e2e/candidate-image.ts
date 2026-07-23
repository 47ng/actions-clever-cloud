type InspectResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type InspectFormat = '{{println .Manifest.Digest}}' | '{{json .Image.Config.Labels}}'

type InspectCommand = (format: InspectFormat) => Promise<InspectResult>

type InspectCandidateImageOptions = {
  image: string
  expectedRevision: string
  expectedSourceRepository: string
  inspect: InspectCommand
}

type CandidateImage = {
  digest: string
  image: string
}

type PinActionMetadataOptions = {
  actionMetadata: string
  image: string
}

function isMissingImage(stderr: string): boolean {
  return /not found|manifest unknown|name unknown/i.test(stderr)
}

const DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/

function inspectFailure(image: string, stderr: string): Error {
  return new Error(
    `Failed to inspect ${image}: ${stderr || 'unknown registry inspection error'}`
  )
}

export function pinActionMetadata({
  actionMetadata,
  image
}: PinActionMetadataOptions): string {
  const imageLine = /^(\s*image:\s*)docker:\/\/([^\s#]+)(.*)$/m
  if (!imageLine.test(actionMetadata)) {
    throw new Error('Candidate action metadata does not declare a docker image')
  }

  return actionMetadata.replace(
    imageLine,
    (_match, prefix: string, _currentImage: string, suffix: string) =>
      `${prefix}docker://${image}${suffix}`
  )
}

export async function inspectCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect
}: InspectCandidateImageOptions): Promise<CandidateImage | undefined> {
  const digestResult = await inspect('{{println .Manifest.Digest}}')
  if (digestResult.exitCode !== 0) {
    if (isMissingImage(digestResult.stderr)) {
      return undefined
    }
    throw inspectFailure(image, digestResult.stderr)
  }

  const digest = digestResult.stdout.trim()
  if (!DIGEST_REGEX.test(digest)) {
    throw new Error(`Invalid candidate image digest: ${digest}`)
  }

  const labelsResult = await inspect('{{json .Image.Config.Labels}}')
  if (labelsResult.exitCode !== 0) {
    throw inspectFailure(image, labelsResult.stderr)
  }

  let labels: Record<string, string>
  try {
    labels = JSON.parse(labelsResult.stdout) as Record<string, string>
  } catch {
    throw new Error(`Invalid candidate image labels for ${image}`)
  }

  const actualRevision = labels['org.opencontainers.image.revision']
  if (actualRevision !== expectedRevision) {
    throw new Error(
      `Candidate image revision mismatch: expected ${expectedRevision}, got ${actualRevision ?? '(missing)'}`
    )
  }

  const expectedSource = `https://github.com/${expectedSourceRepository}/tree/${expectedRevision}`
  const actualSource = labels['org.opencontainers.image.source']
  if (actualSource !== expectedSource) {
    throw new Error(
      `Candidate image source mismatch: expected ${expectedSource}, got ${actualSource ?? '(missing)'}`
    )
  }

  return {
    digest,
    image: image.replace(/:[^:@]+$/, `@${digest}`)
  }
}
