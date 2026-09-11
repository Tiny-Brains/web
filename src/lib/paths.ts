// Where things live, as functions rather than template literals scattered through the pages.
//
// A MODEL'S PATH IS ITS REPOSITORY, because the repository is the entry's key: the permalink is
// then constructible from a GitHub link, readable, and stable across every rename. A version is a
// segment under it, and `/versions/{id}` is the uuid form every API response can be turned into
// without a lookup.

export function modelPath(game: string, repo: string) {
  return `/${game}/models/${repo}`
}

export function versionPath(game: string, repo: string, version: number) {
  return `${modelPath(game, repo)}/v${version}`
}
