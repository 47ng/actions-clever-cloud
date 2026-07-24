import { appendFile } from 'node:fs/promises'
import {
  createImagetoolsInspect,
  inspectionFailure,
  probeCandidateImage
} from '../image-inspection.ts'

const image = process.env.CANDIDATE_IMAGE
const expectedRevision = process.env.EXPECTED_REVISION
const expectedSourceRepository = process.env.EXPECTED_SOURCE_REPOSITORY
const githubOutput = process.env.GITHUB_OUTPUT

if (!image || !expectedRevision || !expectedSourceRepository || !githubOutput) {
  throw new Error('Missing candidate verification environment variables')
}

const result = await probeCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect: createImagetoolsInspect()
})

if (result.missing) {
  throw inspectionFailure(image, result.registryStderr)
}

await appendFile(
  githubOutput,
  `digest=${result.digest}\n` + `image=${result.image}\n`
)
