// Where things live, as functions rather than template literals scattered through the pages.
//
// A MODEL'S PATH IS ITS ID. It used to be its repository, on the argument that the permalink was
// then constructible from a GitHub link and readable in a way a uuid is not — true, and it cost a
// repository per entry that limited nothing. An entry is a name now, and a name is a competitor's
// own words: free text, theirs to edit, and never in a URL. A version is a segment under the
// model, and `/versions/{id}` is the uuid form every API response can be turned into without a
// lookup.
//
// The game is NOT in these paths. It never needed to be — a model id names its game — and
// selection lives in the query string (see lib/selection.ts), not in the route.

export function modelPath(modelId: string) {
  return `/models/${modelId}`
}

export function versionPath(modelId: string, version: number) {
  return `${modelPath(modelId)}/v${version}`
}
