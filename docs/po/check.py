#!/usr/bin/env python3
"""Hold every catalogue to the English it translates.

    python3 po/check.py po/messages.pot po/*.po      # build.sh runs this, from docs/

For each translated entry: what a translation may not change -- code spans, link targets, URLs,
inline HTML, placeholders, a trailing newline, paired `*` and `**` -- still matches the English;
and the language is named in theme/head.hbs (the picker and the forward) and has its words in
theme/tb-words.js. Those are errors. Coverage is printed and is information: translated, fuzzy
(kept by msgmerge, built as English), stale (English the book no longer has) and untranslated.
"""
import re
import sys
import unicodedata
from collections import Counter

CODE = re.compile(r"`[^`\n]+`")
LINK = re.compile(r"\]\(([^)\s]+)\)")
URL = re.compile(r"https?://[^\s)>\"']+")
TAG = re.compile(r"</?(?:kbd|br|sup|sub|code|em|strong|b|i|a|span|div|p|img|small)\b[^>]*>")
SLOT = re.compile(r"\{[A-Za-z_][\w.]*\}|\$[A-Z_][A-Z0-9_]*|<[a-z][a-z-]*>")


def unquote(lines):
    s = "".join(re.match(r'\s*"(.*)"\s*$', l).group(1) for l in lines)
    return s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s


def read(path):
    """The catalogue as (msgid, msgstr, fuzzy) triples, header included."""
    out = []
    for block in re.split(r"\n\n+", open(path, encoding="utf-8").read().strip("\n")):
        idl, strl, mode, fuzzy = [], [], None, False
        for line in block.split("\n"):
            if line.startswith("#,"):
                fuzzy = "fuzzy" in line
            elif line.startswith("msgid "):
                mode, idl = "id", [line[6:]]
            elif line.startswith("msgstr "):
                mode, strl = "str", [line[7:]]
            elif line.startswith('"') and mode:
                (idl if mode == "id" else strl).append(line)
        if idl:
            out.append((unquote(idl), unquote(strl), fuzzy))
    return out


def strip_code(s):
    return CODE.sub(" ", s)


def mask_code(s):
    """Code spans as CommonMark's emphasis sees them: the backticks stay (punctuation, which the
    flanking rules read), the words inside them become letters."""
    return CODE.sub(lambda m: "`" + "x" * (len(m.group()) - 2) + "`", s)


def _punct(c):
    return bool(c) and unicodedata.category(c)[0] in "PS"


def _space(c):
    return not c or c.isspace()


def emphasis_pairs(s):
    """How many `*`/`_` emphasis pairs CommonMark forms in `s`, by its flanking rules -- which a
    script without spaces trips: `**句。**下` has no closer, and `_词_` between CJK characters is
    intraword and no emphasis at all, where the English they translate renders both."""
    runs = []
    for m in re.finditer(r"\*+|_+", s):
        a, b, ch = m.start(), m.end(), m.group()[0]
        before, after = (s[a - 1] if a else ""), (s[b] if b < len(s) else "")
        left = not _space(after) and (not _punct(after) or _space(before) or _punct(before))
        right = not _space(before) and (not _punct(before) or _space(after) or _punct(after))
        if ch == "_":
            runs.append([ch, b - a, left and (not right or _punct(before)), right and (not left or _punct(after))])
        else:
            runs.append([ch, b - a, left, right])
    pairs, stack = 0, []
    for ch, n, opens, closes in runs:
        if closes:
            for j in range(len(stack) - 1, -1, -1):
                if stack[j][0] == ch:
                    use = min(stack[j][1], n)
                    stack[j][1] -= use
                    n -= use
                    pairs += 1
                    if stack[j][1] == 0:
                        del stack[j]
                    break
        if opens and n:
            stack.append([ch, n])
    return pairs


def problems(en, tr):
    out = []
    if Counter(CODE.findall(en)) != Counter(CODE.findall(tr)):
        out.append(f"code spans differ: {CODE.findall(en)} vs {CODE.findall(tr)}")
    if sorted(LINK.findall(en)) != sorted(LINK.findall(tr)):
        out.append(f"link targets differ: {LINK.findall(en)} vs {LINK.findall(tr)}")
    if sorted(URL.findall(strip_code(en))) != sorted(URL.findall(strip_code(tr))):
        out.append("URLs differ")
    # `<em>` is how a translation writes emphasis that `_` and `*` cannot carry (below), so it is
    # the one tag a translation may add.
    plain = re.sub(r"</?em>", "", strip_code(tr))
    if Counter(TAG.findall(strip_code(en))) != Counter(TAG.findall(plain)):
        out.append(f"inline HTML differs: {TAG.findall(strip_code(en))} vs {TAG.findall(plain)}")
    if set(SLOT.findall(strip_code(en))) != set(SLOT.findall(plain)):
        out.append(f"placeholders differ: {set(SLOT.findall(strip_code(en)))} vs {set(SLOT.findall(plain))}")
    if en.endswith("\n") != tr.endswith("\n"):
        out.append("trailing newline differs")
    # Emphasis, by CommonMark's flanking rules -- which a script without spaces trips: `**句。**下`
    # never closes (write `**句**。下`), and `_词_` or `*词*` between CJK characters is no emphasis
    # at all once mdbook-gettext has re-serialised it as `_词_`; a translation writes `<em>词</em>`.
    want = emphasis_pairs(mask_code(en))
    got = emphasis_pairs(mask_code(tr)) + min(tr.count("<em>"), tr.count("</em>"))
    if want != got:
        out.append(f"emphasis renders as {got} pair(s) where the English has {want}: write a bold as `**句**。下` (never `**句。**下`) and an italic as `<em>词</em>`")
    return out


def named(tag):
    """Where a language must be declared besides its catalogue."""
    missing = []
    head = open("theme/head.hbs", encoding="utf-8").read()
    if not re.search(r'languages:\s*\{[^}]*"' + re.escape(tag) + r'"\s*:', head):
        missing.append("theme/head.hbs (languages)")
    words = open("theme/tb-words.js", encoding="utf-8").read()
    if not re.search(r'"' + re.escape(tag) + r'":\s*\{', words):
        missing.append("theme/tb-words.js")
    return missing


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    pot = {msgid for msgid, _, _ in read(argv[1]) if msgid}
    bad = 0
    for path in argv[2:]:
        tag = path.rsplit("/", 1)[-1].removesuffix(".po")
        for place in named(tag):
            print(f"{path}: {tag} is not named in {place}")
            bad += 1
        translated = fuzzy = stale = untranslated = 0
        for msgid, msgstr, is_fuzzy in read(path):
            if not msgid:
                continue
            if msgid not in pot:
                stale += 1
                continue
            if not msgstr:
                untranslated += 1
                continue
            if is_fuzzy:
                fuzzy += 1
                continue
            translated += 1
            for p in problems(msgid, msgstr):
                print(f"{path}: {msgid[:60]!r}: {p}")
                bad += 1
        untranslated += len(pot) - translated - fuzzy - untranslated
        print(f"    {tag}: {translated} of {len(pot)} translated, {fuzzy} fuzzy, {untranslated} untranslated, {stale} stale")
    if bad:
        print(f"    {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
