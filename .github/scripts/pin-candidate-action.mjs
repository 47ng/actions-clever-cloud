import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pinActionMetadata } from '../../src/e2e/candidate-image.ts'

const image = process.env.CANDIDATE_IMAGE
const outputActionPath = process.env.OUTPUT_ACTION_PATH
const candidateActionPath =
  process.env.CANDIDATE_ACTION_PATH ?? './.candidate-source/action.yml'

if (!image || !outputActionPath) {
  throw new Error('Missing candidate pinning environment variables')
}

const actionMetadata = await readFile(candidateActionPath, 'utf8')
const pinnedMetadata = pinActionMetadata({
  actionMetadata,
  image
})

await mkdir(path.dirname(outputActionPath), {
  recursive: true
})
await writeFile(outputActionPath, pinnedMetadata)
