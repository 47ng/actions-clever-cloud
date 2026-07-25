import {
  createImagetoolsInspect,
  probeCandidateImage
} from '../image-inspection.ts'
import { writeStepOutputs } from '../step-output.ts'

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
  await writeStepOutputs(githubOutput, { missing: 'true' })
  process.exit(0)
}

await writeStepOutputs(githubOutput, {
  missing: 'false',
  digest: result.digest,
  image: result.image
})
