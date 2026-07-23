import { isMap, isScalar, parseDocument, type Scalar, type YAMLMap } from 'yaml'

type InspectResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type InspectFormat =
  '{{println .Manifest.Digest}}' | '{{json .Image.Config.Labels}}'

type InspectCommand = (
  format: InspectFormat,
  reference: string
) => Promise<InspectResult>

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
const PINNED_IMAGE_REGEX = /^[^@\s]+@sha256:[0-9a-f]{64}$/
const ROOT_EXECUTION_KEYS = new Set([
  'using',
  'main',
  'pre',
  'pre-if',
  'post',
  'post-if',
  'steps',
  'image',
  'pre-entrypoint',
  'entrypoint',
  'post-entrypoint',
  'args',
  'env'
])
const DOCKER_RUNS_KEYS = new Set([
  'using',
  'image',
  'pre-entrypoint',
  'pre-if',
  'entrypoint',
  'post-entrypoint',
  'post-if',
  'args',
  'env'
])

function inspectFailure(image: string, stderr: string): Error {
  return new Error(
    `Failed to inspect ${image}: ${stderr || 'unknown registry inspection error'}`
  )
}

function candidateMetadataError(message: string): Error {
  return new Error(message)
}

function parseCandidateActionMetadata(actionMetadata: string) {
  const document = parseDocument(actionMetadata)
  const [error] = document.errors

  if (!error) {
    return document
  }

  if (error.code === 'DUPLICATE_KEY') {
    throw candidateMetadataError(
      'Candidate action metadata must not contain duplicate keys'
    )
  }

  if (error.code === 'MULTIPLE_DOCS') {
    throw candidateMetadataError(
      'Candidate action metadata must contain exactly one YAML document'
    )
  }

  throw candidateMetadataError(
    `Invalid candidate action metadata: ${error.message.split('\n', 1)[0]}`
  )
}

function keyName(key: unknown, context: string): string {
  if (
    !isScalar(key) ||
    typeof key.value !== 'string' ||
    key.value.length === 0
  ) {
    throw candidateMetadataError(`${context} must use non-empty string keys`)
  }

  return key.value
}

function expectMap(node: unknown, path: string): YAMLMap {
  if (!isMap(node)) {
    throw candidateMetadataError(
      `Candidate action metadata must define ${path} as a mapping`
    )
  }

  return node
}

function expectStringScalar(node: unknown, path: string): Scalar<string> {
  if (
    !isScalar(node) ||
    typeof node.value !== 'string' ||
    node.value.length === 0
  ) {
    throw candidateMetadataError(
      `Candidate action metadata must define ${path} as a non-empty string`
    )
  }

  return node as Scalar<string>
}

function rejectTopLevelExecutionKeys(root: YAMLMap): void {
  for (const pair of root.items) {
    const key = keyName(pair.key, 'Candidate action metadata')
    if (ROOT_EXECUTION_KEYS.has(key)) {
      throw candidateMetadataError(
        `Candidate action metadata must not define top-level execution key: ${key}`
      )
    }
  }
}

function rejectUnexpectedDockerRunsKeys(runs: YAMLMap): void {
  for (const pair of runs.items) {
    const key = keyName(pair.key, 'Candidate action metadata runs')
    if (!DOCKER_RUNS_KEYS.has(key)) {
      throw candidateMetadataError(
        `Candidate action metadata must not define runs.${key} for a docker action`
      )
    }
  }
}

export function pinActionMetadata({
  actionMetadata,
  image
}: PinActionMetadataOptions): string {
  if (!PINNED_IMAGE_REGEX.test(image)) {
    throw new Error('Pinned image must be a canonical sha256 digest reference')
  }

  const document = parseCandidateActionMetadata(actionMetadata)
  const root = expectMap(document.contents, 'the document root')
  rejectTopLevelExecutionKeys(root)

  const runs = expectMap(root.get('runs', true), 'runs')
  rejectUnexpectedDockerRunsKeys(runs)

  const using = expectStringScalar(runs.get('using', true), 'runs.using').value
  if (using !== 'docker') {
    throw candidateMetadataError(
      'Candidate action metadata must describe a docker action'
    )
  }

  const imageNode = expectStringScalar(runs.get('image', true), 'runs.image')
  imageNode.value = `docker://${image}`

  return String(document)
}

export async function inspectCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect
}: InspectCandidateImageOptions): Promise<CandidateImage | undefined> {
  const digestResult = await inspect('{{println .Manifest.Digest}}', image)
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

  const pinnedImage = image.replace(/:[^:@]+$/, `@${digest}`)
  const labelsResult = await inspect(
    '{{json .Image.Config.Labels}}',
    pinnedImage
  )
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
    image: pinnedImage
  }
}
