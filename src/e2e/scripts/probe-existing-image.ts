import { appendFile } from 'node:fs/promises'
import {
  createImagetoolsInspect,
  probeCandidateImage
} from '../image-inspection.ts'

const image = process.env.CANDIDATE_IMAGE
const expectedRevision = process.env.EXPECTED_REVISION
const expectedSourceRepository = process.env.EXPECTED_SOURCE_REPOSITORY
const githubOutput = process.env.GITHUB_OUTPUT

if (!image || !expectedRevision || !expectedSourceRepository || !githubOutput) {
  throw new Error('Missing candidate resolution environment variables')
}

const result = await probeCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect: createImagetoolsInspect()
})

if (result.missing) {
  const registryDetail = result.registryStderr.trim().replaceAll('\n', ' ')
  console.log(
    `::warning::Candidate image ${image} not found, building it. Registry said: ${registryDetail}`
  )
  await appendFile(githubOutput, 'missing=true\n')
  process.exit(0)
}

await appendFile(
  githubOutput,
  `missing=false\n` + `digest=${result.digest}\n` + `image=${result.image}\n`
)
