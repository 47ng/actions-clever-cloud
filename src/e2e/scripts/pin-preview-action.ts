import { readFile, writeFile } from 'node:fs/promises'
import { pinActionMetadata } from '../candidate-image.ts'
import {
  createImagetoolsInspect,
  inspectCandidateImage
} from '../image-inspection.ts'
import { writeStepOutputs } from '../step-output.ts'

const image = process.env.CANDIDATE_IMAGE
const expectedRevision = process.env.EXPECTED_REVISION
const expectedSourceRepository = process.env.EXPECTED_SOURCE_REPOSITORY
const outputActionPath = process.env.OUTPUT_ACTION_PATH
const githubOutput = process.env.GITHUB_OUTPUT

if (
  !image ||
  !expectedRevision ||
  !expectedSourceRepository ||
  !outputActionPath ||
  !githubOutput
) {
  throw new Error('Missing candidate verification environment variables')
}

const candidate = await inspectCandidateImage({
  image,
  expectedRevision,
  expectedSourceRepository,
  inspect: createImagetoolsInspect()
})

if (!candidate) {
  throw new Error(`Missing candidate image ${image}`)
}

const actionMetadata = await readFile('action.yml', 'utf8')
const pinnedMetadata = pinActionMetadata({
  actionMetadata,
  image: candidate.image
})

await writeFile(outputActionPath, pinnedMetadata)
await writeStepOutputs(githubOutput, {
  digest: candidate.digest,
  image: candidate.image,
  action_metadata_path: outputActionPath
})
