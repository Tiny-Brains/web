#!/usr/bin/env python3
"""DataLogic Studio links for adapter examples: an mdBook preprocessor, and a command.

**A link to a picture of a program has to be the program.** A Studio link carries its whole
expression and data inside the URL, so a link pasted into a page by hand is a second copy of the
example beside it, and the two drift the first time someone edits one. So the page does not hold
the link at all. It holds a directive naming an example file, and this script writes the code
block and the link from that one file, on every build:

    {{#studio studio/foe-positions.json}}

The path is relative to the page, like `{{#include}}`. One or more flags may follow the path:

    code      the default: the example's `logic` as a JSON block, then the link
    nocode    the link alone, when the prose around it already shows the expression
    embed     the Studio itself in the page, loaded when it scrolls into view (theme/tb-studio.js)

An example file is JSON:

    { "logic": <the expression>,
      "data":  <the document it runs against>,
      "about": "what the data is, in a few words -- it becomes the link's caption",
      "templating": true }

`templating` defaults to true, and an adapter needs it: it is the Studio mode in which a
multi-key object is an object literal, as the dialect's object rule says, and in which a `tb.*`
operator the Studio does not know is shown with its arguments evaluated instead of refused.

    python3 studio/studio.py link src/models/adapters/studio/foe-positions.json

prints the URL. The encoding is the Studio's own (ui/src/utils/url-share.ts in datalogic-rs):
`{l, d, t}` as MessagePack, raw DEFLATE, base64url without padding, in `?s=`.
"""

from __future__ import annotations

import base64
import json
import os
import re
import struct
import sys
import zlib
from html import escape

STUDIO = "https://goplasmatic.github.io/datalogic-rs/playground/"

# ---------------------------------------------------------------------------- the Studio's encoding


def _pack(v, out: bytearray) -> None:
    """MessagePack, for the values JSON has. The Studio decodes with @msgpack/msgpack, which reads
    any valid encoding; this writes the smallest one, as that library does."""
    if v is None:
        out.append(0xC0)
    elif v is True:
        out.append(0xC3)
    elif v is False:
        out.append(0xC2)
    elif isinstance(v, int):
        if 0 <= v < 0x80:
            out.append(v)
        elif -32 <= v < 0:
            out.append(v & 0xFF)
        elif 0 <= v < 1 << 8:
            out += b"\xcc" + struct.pack(">B", v)
        elif 0 <= v < 1 << 16:
            out += b"\xcd" + struct.pack(">H", v)
        elif 0 <= v < 1 << 32:
            out += b"\xce" + struct.pack(">I", v)
        elif v >= 0:
            out += b"\xcf" + struct.pack(">Q", v)
        elif v >= -(1 << 7):
            out += b"\xd0" + struct.pack(">b", v)
        elif v >= -(1 << 15):
            out += b"\xd1" + struct.pack(">h", v)
        elif v >= -(1 << 31):
            out += b"\xd2" + struct.pack(">i", v)
        else:
            out += b"\xd3" + struct.pack(">q", v)
    elif isinstance(v, float):
        out += b"\xcb" + struct.pack(">d", v)
    elif isinstance(v, str):
        b = v.encode("utf-8")
        n = len(b)
        if n < 32:
            out.append(0xA0 | n)
        elif n < 1 << 8:
            out += b"\xd9" + struct.pack(">B", n)
        elif n < 1 << 16:
            out += b"\xda" + struct.pack(">H", n)
        else:
            out += b"\xdb" + struct.pack(">I", n)
        out += b
    elif isinstance(v, list):
        n = len(v)
        if n < 16:
            out.append(0x90 | n)
        elif n < 1 << 16:
            out += b"\xdc" + struct.pack(">H", n)
        else:
            out += b"\xdd" + struct.pack(">I", n)
        for x in v:
            _pack(x, out)
    elif isinstance(v, dict):
        n = len(v)
        if n < 16:
            out.append(0x80 | n)
        elif n < 1 << 16:
            out += b"\xde" + struct.pack(">H", n)
        else:
            out += b"\xdf" + struct.pack(">I", n)
        for k, x in v.items():
            _pack(k, out)
            _pack(x, out)
    else:
        raise TypeError(f"no JSON value is a {type(v).__name__}")


def share_url(logic, data, templating: bool = True) -> str:
    state = {"l": logic, "d": data}
    if templating:
        state["t"] = True
    packed = bytearray()
    _pack(state, packed)
    deflate = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw DEFLATE, as fflate's deflateSync
    raw = deflate.compress(bytes(packed)) + deflate.flush()
    return STUDIO + "?s=" + base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------- the page's copy


def pretty(v, indent: int = 0, width: int = 88, lead: int | None = None) -> str:
    """JSONLogic the way the book writes it by hand: anything that fits stays on one line, and an
    operation that does not opens on its own line -- `{"tb.stack": [` -- with its arguments one
    level in and `]}` closing it. `json.dumps(indent=2)` gives every number of a coordinate pair a
    line and every operator two levels of indent, which makes an adapter four times as tall.

    `lead` is how much of the current line is already taken, by the key or operator in front."""
    lead = indent if lead is None else lead
    flat = json.dumps(v, separators=(", ", ": "), ensure_ascii=False)
    if lead + len(flat) <= width or not isinstance(v, (list, dict)) or not v:
        return flat
    if isinstance(v, dict) and len(v) == 1:
        # An operation, or a one-key literal: the key rides on the line its value opens.
        ((k, x),) = v.items()
        head = "{" + json.dumps(k, ensure_ascii=False) + ": "
        return head + pretty(x, indent, width, lead + len(head)) + "}"
    pad = " " * (indent + 2)
    if isinstance(v, list):
        inner = [pad + pretty(x, indent + 2, width) for x in v]
        return "[\n" + ",\n".join(inner) + "\n" + " " * indent + "]"
    inner = []
    for k, x in v.items():
        head = pad + json.dumps(k, ensure_ascii=False) + ": "
        inner.append(head + pretty(x, indent + 2, width, len(head)))
    return "{\n" + ",\n".join(inner) + "\n" + " " * indent + "}"


def load(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            ex = json.load(f)
    except (OSError, ValueError) as e:
        raise SystemExit(f"studio: {path}: {e}")
    for key in ("logic", "data"):
        if key not in ex:
            raise SystemExit(f"studio: {path} has no '{key}'")
    return ex


def expand(ex: dict, flags: set[str], book_path: str) -> str:
    url = share_url(ex["logic"], ex["data"], ex.get("templating", True))
    about = ex.get("about")
    caption = f" &mdash; against {escape(about)}" if about else ""
    parts = []
    if "nocode" not in flags:
        parts.append("```json\n" + pretty(ex["logic"]) + "\n```\n")
    if "embed" in flags:
        # tb-studio.js mounts the Studio here; without it, or before it scrolls into view, the
        # slot is empty and the link below is the whole feature.
        parts.append(
            f'<div class="tb-studio-embed" data-src="{escape(book_path)}" '
            f'data-url="{escape(url)}"></div>\n'
        )
    parts.append(
        f'<p class="tb-studio-link"><a href="{escape(url)}" target="_blank" rel="noopener">'
        f"Open in DataLogic Studio</a>{caption}</p>\n"
    )
    return "\n".join(parts)


DIRECTIVE = re.compile(r"\{\{#studio\s+(\S+?)((?:\s+[a-z]+)*)\s*\}\}")
FLAGS = {"code", "nocode", "embed"}


def preprocess(ctx: dict, book: dict) -> dict:
    src = os.path.join(ctx["root"], ctx["config"]["book"].get("src", "src"))

    def chapter(ch: dict) -> None:
        if ch.get("source_path"):
            here = os.path.dirname(ch["source_path"])

            def one(m: re.Match) -> str:
                rel = os.path.normpath(os.path.join(here, m.group(1)))
                flags = set(m.group(2).split())
                unknown = flags - FLAGS
                if unknown:
                    raise SystemExit(f"studio: {ch['source_path']}: unknown flag(s) {sorted(unknown)}")
                return expand(load(os.path.join(src, rel)), flags, rel.replace(os.sep, "/"))

            ch["content"] = DIRECTIVE.sub(one, ch["content"])
        for item in ch.get("sub_items", []):
            walk(item)

    def walk(item) -> None:
        if isinstance(item, dict) and "Chapter" in item:
            chapter(item["Chapter"])

    for item in book.get("items", []):
        walk(item)
    return book


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "supports":
        return 0  # the expansion is markdown and inline HTML; every renderer can take it
    if len(argv) > 2 and argv[1] == "link":
        ex = load(argv[2])
        print(share_url(ex["logic"], ex["data"], ex.get("templating", True)))
        return 0
    if len(argv) > 1:
        print(__doc__, file=sys.stderr)
        return 2
    ctx, book = json.load(sys.stdin)
    json.dump(preprocess(ctx, book), sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
