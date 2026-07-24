import { isMap, isScalar, parseDocument, type Scalar, type YAMLMap } from 'yaml'

type PinActionMetadataOptions = {
  actionMetadata: string
  image: string
}

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
