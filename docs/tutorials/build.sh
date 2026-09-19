#!/bin/sh
# Rebuild the book's teaching replays, and the viewer that plays them.
#
# A lesson replay is ENGINE OUTPUT, exactly as the reference observations are: it is produced by
# playing a written script through the real cartridge, so what a page shows is what the rules do
# rather than a drawing of what someone believed they do. That also means it goes stale when the
# engine changes, which is why this is a script and not a one-off.
#
#     tutorials/build.sh              # needs `tinybrains` on PATH and a viewer at $ANTS_DIST/viz
#
# ANTS_DIST is a cartridge's artifact set: an ants checkout's dist/ (the default, ../../../ants/dist),
# or an unpacked ants release -- the same tree. ../Dockerfile runs this with both taken from
# releases -- the cartridge from ants', the binary from the CLI's -- so neither needs a sibling
# checkout. Run it by hand the same way, or after `ants/build.sh` and `ants/viz/build.sh`.
#
# The lessons are played by the cartridge at $ANTS_DIST too, the one the viewer comes from: unless
# TINYBRAINS_REGISTRY names one, this writes a registry whose entry is that path. The binary has no
# registry of its own to fall back on.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"

command -v tinybrains > /dev/null 2>&1 || {
  echo "tinybrains is not on PATH." >&2
  echo "  brew tap tiny-brains/cli https://github.com/Tiny-Brains/cli && brew install tiny-brains/cli/tinybrains" >&2
  echo "  or from a checkout:  cargo install --locked --path ../../cli" >&2
  exit 1; }

if [ -z "${TINYBRAINS_REGISTRY:-}" ]; then
  dist=$(cd "${ANTS_DIST:-../../../ants/dist}" 2>/dev/null && pwd) || {
    echo "no cartridge at ${ANTS_DIST:-../../../ants/dist} -- run ants/build.sh, or set ANTS_DIST" >&2
    exit 1; }
  TINYBRAINS_REGISTRY=$(mktemp "${TMPDIR:-/tmp}/tinybrains-registry.XXXXXX")
  trap 'rm -f "$TINYBRAINS_REGISTRY"' EXIT
  printf '[games.ants]\nname = "Ants"\npath = "%s"\n' "$dist" > "$TINYBRAINS_REGISTRY"
  export TINYBRAINS_REGISTRY
fi

echo "==> boards"
for txt in boards/*.txt; do
  name=$(basename "$txt" .txt)
  python3 make-map.py "$txt" --id "lesson-$name" > "boards/$name.json"
  echo "    $name"
done

# A lesson spec carries its own copy of the board, because `tinybrains` takes the map inline.
# That copy is what is played, so it has to agree with the drawing -- an edit to a `.txt` that
# never reached the spec would regenerate a board nothing reads, and the lesson would go on
# playing the old one.
python3 - <<'MAPEOF'
import glob, json, os, sys
bad = []
for board in sorted(glob.glob("boards/*.json")):
    name = os.path.basename(board)[:-5]
    want = json.load(open(board))
    for spec in sorted(glob.glob("*.json")):
        row = json.load(open(spec))["rows"][0]
        if isinstance(row.get("map"), dict) and row["map"].get("id") == want["id"]:
            if row["map"] != want:
                bad.append((spec, board))
            break
    else:
        bad.append((None, board))
if bad:
    print("    MISMATCH -- a board and the spec that plays it disagree", file=sys.stderr)
    for spec, board in bad:
        if spec is None:
            print(f"      {board} is generated but no spec's inline map names it", file=sys.stderr)
        else:
            print(f"      {board} != the inline map in {spec}", file=sys.stderr)
    print(file=sys.stderr)
    print("    The spec's copy is the one that plays. Copy the board into it (or delete the", file=sys.stderr)
    print("    drawing) rather than leaving two maps with one name.", file=sys.stderr)
    sys.exit(1)
print("    boards agree with the specs that play them")
MAPEOF

echo "==> replays"
mkdir -p replays
# From scratch, keeping the one file that is source. A replay whose spec was deleted would otherwise
# go on being copied into the book -- which is how thirty-two boards no season ships could outlive
# the specs that drew them.
find replays -name '*.json' ! -name real-match.json -delete
# Every scenario spec in this directory. `real-match.json` under replays/ is NOT one: it is a real
# match, captured from a running stack, and it is copied rather than regenerated -- the digest
# check below is what catches it going stale.
#
# A `board-*` spec plays one turn on a BASIC board the release ships, named by id: the registry's
# maps/ resolves it. Those five are the only boards in any release (N28) -- a season's are uploaded,
# never shipped -- so they are the only ones a page here can draw.
for spec in *.json; do
  tinybrains "$spec" --out replays | grep -E "turns  board" | sed 's/^/    /'
done

echo "==> into the book"
rm -rf ../src/tutorials
mkdir -p ../src/tutorials ../src/viz
cp replays/*.json ../src/tutorials/

# The viewer, from the cartridge that produced the replays. Vendored rather than fetched, so the
# book builds offline -- and checked against the digest the replays name, because a viewer
# re-simulating with a different engine draws a plausible match that never happened.
VIZ="${ANTS_DIST:-../../../ants/dist}/viz"
[ -d "$VIZ" ] || { echo "no viewer at $VIZ -- run ants/viz/build.sh" >&2; exit 1; }
cp -R "$VIZ/." ../src/viz/

# Every `data-turn` a page asks for, against the replay it asks it of. A turn past the end of a
# match is not an error in the viewer -- it clamps to the last frame -- so a page pointing at turn
# 246 of a 161-turn capture shows the end of a different moment and says nothing. Cheap to check
# here, and it is what goes wrong when `real-match.json` is re-captured shorter.
python3 - <<'SLOTEOF'
import glob, json, re, sys
slot = re.compile(r'data-src="tutorials/([^"]+)\.json"(?:[^>]*?data-turn="(\d+)")?')
bad = []
seen = 0
for page in sorted(glob.glob("../src/**/*.md", recursive=True)):
    for name, turn in slot.findall(open(page).read()):
        seen += 1
        try:
            env = json.load(open(f"../src/tutorials/{name}.json"))
        except OSError:
            bad.append(f"{page}: tutorials/{name}.json does not exist")
            continue
        turns = int(env.get("turns", 0))
        if turn and int(turn) > turns:
            bad.append(f"{page}: asks for turn {turn} of {name}, which has {turns}")
if bad:
    print("    OUT OF RANGE -- a page points at a turn its replay does not have", file=sys.stderr)
    for b in bad:
        print(f"      {b}", file=sys.stderr)
    sys.exit(1)
print(f"    {seen} slots point inside the replay they name")
SLOTEOF

# EVERY replay, not the first one. A captured match is copied rather than regenerated, so it is
# exactly the file that goes stale without anyone noticing -- and a viewer re-simulating with the
# wrong engine does not fail, it draws a plausible match that never happened.
python3 - <<'CHECKEOF'
import glob, json, sys
built = json.load(open("../src/viz/engine.json"))["engine_digest"]
bad = []
for f in sorted(glob.glob("replays/*.json")):
    played = json.load(open(f)).get("engine_digest")
    if played != built:
        bad.append((f, played))
if bad:
    print("    MISMATCH -- the viewer was built against", built, file=sys.stderr)
    for f, played in bad:
        print(f"      {f} was played on {played}", file=sys.stderr)
    print(file=sys.stderr)
    # Which file it is decides what the fix is, and only one of the two is this build's to make.
    if any("real-match" in f for f, _ in bad):
        print("    replays/real-match.json is a real match CAPTURED FROM A RUNNING STACK. Nothing",
              file=sys.stderr)
        print("    here can reproduce it: it is source, not build output, and it is referenced from",
              file=sys.stderr)
        print("    four pages. Re-capture a match played on the current engine and replace it --",
              file=sys.stderr)
        print("    and check the `data-turn` on each of those pages still falls inside the new match.",
              file=sys.stderr)
    if any("real-match" not in f for f, _ in bad):
        print("    The scenario replays are generated here; re-run this script to bring them forward.",
              file=sys.stderr)
    print(file=sys.stderr)
    print("    A viewer re-simulating with a different engine does not fail. It draws a plausible",
          file=sys.stderr)
    print("    match that never happened, which is why this is an error and not a warning.",
          file=sys.stderr)
    sys.exit(1)
print(f"    {len(glob.glob('replays/*.json'))} replays agree with the viewer on {built[:14]}...")
CHECKEOF
