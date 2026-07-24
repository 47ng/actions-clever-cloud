import { describe, expect, test } from 'vitest'
import {
  buildDockerPreviewComment,
  DOCKER_BUILD_COMMENT_MARKER
} from './preview-comment.ts'

describe('preview-comment', () => {
  test('marker matches the docker build comment sentinel', () => {
    expect(DOCKER_BUILD_COMMENT_MARKER).toBe('<!-- docker-build-comment -->')
  })

  test('builds the exact preview comment body', () => {
    const body = buildDockerPreviewComment({
      tag: 'pr-123',
      sha: 'a'.repeat(40),
      digest: `sha256:${'b'.repeat(64)}`,
      tags: [
        'ghcr.io/47ng/actions-clever-cloud:pr-123',
        `ghcr.io/47ng/actions-clever-cloud:git-${'a'.repeat(40)}`
      ].join('\n'),
      labels: [
        'org.opencontainers.image.title=47ng/actions-clever-cloud',
        'org.opencontainers.image.licenses=MIT'
      ].join('\n')
    })

    expect(body).toBe(
      `<!-- docker-build-comment -->
## 🐳 &nbsp;Docker image preview

Preview this PR in your workflow:

\`\`\`yaml
# Use the PR number to follow changes in this PR
- uses: docker://ghcr.io/47ng/actions-clever-cloud:pr-123

# Use the git SHA for pinning to a specific commit
- uses: docker://ghcr.io/47ng/actions-clever-cloud:git-${'a'.repeat(40)}
\`\`\`

<details>
<summary>Image metadata</summary>

Digest: \`sha256:${'b'.repeat(64)}\`

### 📌 &nbsp;Tags
\`\`\`
ghcr.io/47ng/actions-clever-cloud:pr-123
ghcr.io/47ng/actions-clever-cloud:git-${'a'.repeat(40)}
\`\`\`

### 🏷 &nbsp;Labels
\`\`\`
org.opencontainers.image.title=47ng/actions-clever-cloud
org.opencontainers.image.licenses=MIT
\`\`\`

</details>

---
<sub>🤖 This comment is updated on every push</sub>`
    )
  })

  test('body starts with the marker so updates can find it', () => {
    const body = buildDockerPreviewComment({
      tag: 'pr-1',
      sha: 'c'.repeat(40),
      digest: `sha256:${'d'.repeat(64)}`,
      tags: 'tags',
      labels: 'labels'
    })
    expect(body.startsWith(DOCKER_BUILD_COMMENT_MARKER)).toBe(true)
  })
})
