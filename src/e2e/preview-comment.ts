export const DOCKER_BUILD_COMMENT_MARKER = '<!-- docker-build-comment -->'

export type DockerPreviewCommentInputs = {
  tag: string
  sha: string
  digest: string
  tags: string
  labels: string
}

export function buildDockerPreviewComment({
  tag,
  sha,
  digest,
  tags,
  labels
}: DockerPreviewCommentInputs): string {
  return [
    DOCKER_BUILD_COMMENT_MARKER,
    '## 🐳 &nbsp;Docker image preview',
    '',
    'Preview this PR in your workflow:',
    '',
    '```yaml',
    '# Use the PR number to follow changes in this PR',
    `- uses: docker://ghcr.io/47ng/actions-clever-cloud:${tag}`,
    '',
    '# Use the git SHA for pinning to a specific commit',
    `- uses: docker://ghcr.io/47ng/actions-clever-cloud:git-${sha}`,
    '```',
    '',
    '<details>',
    '<summary>Image metadata</summary>',
    '',
    `Digest: \`${digest}\``,
    '',
    '### 📌 &nbsp;Tags',
    '```',
    tags,
    '```',
    '',
    '### 🏷 &nbsp;Labels',
    '```',
    labels,
    '```',
    '',
    '</details>',
    '',
    '---',
    '<sub>🤖 This comment is updated on every push</sub>'
  ].join('\n')
}
