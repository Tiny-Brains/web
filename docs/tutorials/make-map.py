#!/usr/bin/env python3
"""Draw half a board; get a symmetric one.

A lesson board has to be symmetric or the cartridge refuses it -- water, hills and turn-zero food
each closed under the orbit `(rows/p, cols/p)k`. Working that out by hand is how the first attempt
at these lessons failed, twice, with a message about cell 12 and its image 66.

So don't work it out. For two players the top half of the board is a fundamental domain: every cell
in it has exactly one image in the bottom half. Draw the top half and this translates it, which is
what `state.rs:worldgen` does and why generated boards are symmetric by construction.

    # a 4-row drawing becomes an 8-row board
    ............
    .H..........
    ...##.......
    ............

Legend
    .   land
    #   water
    H   the hill (exactly one; seat 1's is placed by the translation)
    *   food at turn zero

    python3 make-map.py lesson.txt --id lesson-fight > lesson.json
"""
import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drawing", help="the top half of the board, as text")
    ap.add_argument("--id", required=True)
    ap.add_argument("--players", type=int, default=2)
    # `default=None`, not 0: `--food-target 0` means "nothing respawns", and a falsy check turned
    # that into "keep as much as you drew" -- so a lesson about gathering had food that never
    # disappeared, because it was replaced the same turn.
    ap.add_argument("--food-target", type=int, default=None,
                    help="how much food the board is kept stocked with; 0 means none respawns")
    args = ap.parse_args()

    lines = [ln.rstrip("\n") for ln in open(args.drawing) if ln.strip()]
    if not lines:
        sys.exit("the drawing is empty")
    cols = max(len(ln) for ln in lines)
    lines = [ln.ljust(cols, ".") for ln in lines]
    half = len(lines)
    rows = half * args.players

    if rows % args.players or cols % args.players:
        sys.exit(f"a {rows}x{cols} board does not divide by {args.players} seats")
    dr, dc = rows // args.players, cols // args.players

    water, hills, food = set(), [], []
    for r, line in enumerate(lines):
        for c, ch in enumerate(line):
            if ch == "#":
                water.add((r, c))
            elif ch == "H":
                hills.append((r, c))
            elif ch == "*":
                food.append((r, c))
            elif ch != ".":
                sys.exit(f"row {r} column {c}: '{ch}' is not one of . # H *")
    if len(hills) != 1:
        sys.exit(f"draw exactly one hill; the other seats' are placed by the translation "
                 f"(found {len(hills)})")

    # The translation. Everything drawn in the top half gets its image in every other, which is
    # what makes the board symmetric rather than merely checked for symmetry.
    def orbit(r, c):
        return [((r + dr * k) % rows, (c + dc * k) % cols) for k in range(args.players)]

    all_water = {p for (r, c) in water for p in orbit(r, c)}
    all_food = [p for (r, c) in food for p in orbit(r, c)]
    all_hills = orbit(*hills[0])

    for (r, c) in all_hills:
        if (r, c) in all_water:
            sys.exit(f"the hill at {r},{c} stands on water")

    # `[value, run, value, run, ...]`, row-major -- `Bits::rle()`, the protocol's own encoding.
    rle, cur, run = [], 0, 0
    for i in range(rows * cols):
        v = 1 if ((i // cols), (i % cols)) in all_water else 0
        if v == cur:
            run += 1
        else:
            rle += [cur, run]
            cur, run = v, 1
    rle += [cur, run]

    json.dump({
        "id": args.id,
        "rows": rows,
        "cols": cols,
        "players": args.players,
        "water": rle,
        "hills": [list(p) for p in all_hills],
        "food": [list(p) for p in all_food],
        "food_target": args.food_target if args.food_target is not None else len(all_food),
        "symmetry": {"dr": dr, "dc": dc},
    }, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
