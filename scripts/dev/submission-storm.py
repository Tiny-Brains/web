#!/usr/bin/env python3
"""Tens of competitors submitting a micro-class model at once, end to end.

  scripts/dev/submission-storm.py                 # 30 competitors, then watch until the ladder settles
  scripts/dev/submission-storm.py --users 10      # fewer
  scripts/dev/submission-storm.py --no-wait       # submit and leave; --report says what happened since
  scripts/dev/submission-storm.py --report        # what the storm that is already running is doing
  scripts/dev/submission-storm.py --clean         # remove everything it made

WHY ONE SCRIPT AND NOT THREE. A submission crosses every repo the platform has: Soma records it and
mints the presigned PUTs, the competitor uploads, Soma's admit clock verifies and probes it, pair
gives it a trial, Kalam plays it on whatever replicas are up, count folds the result and promotes.
Each half has its own check -- `soma/scripts/smoke.sh`, each repo's `check-sql.sh`,
`scripts/check/configs.sh` -- and NONE of them can catch a contract that breaks BETWEEN two repos,
which is where this platform's failures live. Tens at once is what makes those seams show: one
submission at a time hides a claim race, a roster that has not caught up, and a rate limit.

WHAT IS REAL AND WHAT IS A FIXTURE. Everything from `POST /v1/submissions` onward is the real
thing, over HTTP, exactly as a browser does it: the cookie is a real HS256 JWT over a real
`sessions` row, the PUT is Soma's own presigned URL signed for the PUBLIC endpoint, and the two
files land in the one bucket every node reads by its INTERNAL one. Two rows are fixtures, both
because a synthetic competitor cannot have them:

  * the USER, because sign-in is GitHub's OAuth round trip and there is no scripting one;
  * the MODEL, only because it needs an owner, and the owner needs a session. The route itself
    is now a name and a season rule, with no outbound call at all.

Both are inserted in exactly the shape their route writes -- a competitor with a `github_id`, an
entry with a name unique under that owner -- so every rule downstream sees an ordinary competitor
and not a special case. NOTHING ELSE IS SEEDED. In particular no `model_versions` row: the version is what is
under test, and `soma bootstrap` writing one from its roster is the reason a seeded baseline
proves nothing about admission.

THE MODELS ARE DISTINCT BY DEFAULT, and that is a decision. Thirty byte-identical copies of
micro-bc would pass, but they would be one model on thirty ladders slots: every pairing a mirror
match, every result a draw, and `unique_weights` -- off in a season whose rules are `{}`, on in any
season that means it -- never asked. Each competitor therefore gets micro-bc with its twelve fp16
initializers jittered, which changes the bytes and the policy and NOT the weight class, the
parameter count, the operator set or the opset: the artifact is the same size to the byte, because
an fp16 raw_data block is fixed width. `--identical` turns that off, which is the right flag when
what you are testing is the duplicate refusal itself.

TWO THINGS THIS DELIBERATELY DOES NOT DO. It does not touch GitHub at all -- nothing on the
submission path does any more, so a run of this script is also the proof that the dependency is
gone rather than merely unused. And it does not read `docker logs` to decide anything: every verdict here is read from the database
or from the API, because a log line is not a contract.

IT LEAVES A MARK, because a ladder is a record. `--clean` removes the users, entries, versions,
their matches and every rating event those matches caused, then puts each baseline's rating back to
the last event that survived -- which is exact, because `rating_events` carries `mu_after`. What it
cannot undo is a season's history in anyone's memory of it; the only true reset is
`docker compose down -v` and a fresh bring-up.
"""

import argparse, base64, hashlib, hmac, json, os, re, shutil, subprocess, sys, time
import urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

WEB = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = WEB.parent / "ants-starter" / "models" / "micro-bc"

# ------------------------------------------------------------------ the stack it talks to

def load_env(path):
    """.env as a dict. Not `source`d: this reads it, it does not run it."""
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Stack:
    def __init__(self, args):
        env = load_env(WEB / ".env")
        get = lambda k, d: os.environ.get(k) or env.get(k) or d
        self.base = args.base.rstrip("/")
        self.secret = get("SOMA_SESSION_SECRET", "")
        self.db_container = get("DB_CONTAINER", "tinybrains-db-1")
        self.bucket = get("MODELS_BUCKET", "tinybrains-models")
        # The PUBLIC address, because that is the one Soma signs a PUT for and the one this script
        # -- which is a competitor, not a node -- can reach. A node uses MODELS_ENDPOINT, and the
        # two being one variable is the SSRF refusal that names neither.
        self.s3 = get("MODELS_PUBLIC_ENDPOINT", get("R2_PUBLIC_ENDPOINT", "http://127.0.0.1:9000"))
        self.s3_key = get("R2_ACCESS_KEY", "tinybrains")
        self.s3_secret = get("R2_SECRET_KEY", "tinybrains-dev-secret")
        self.s3_region = get("R2_REGION", "us-east-1")
        self.admin_key = get("ORION_ADMIN_KEY", "")
        self.db_user = self._docker_env("POSTGRES_USER")
        self.db_name = self._docker_env("POSTGRES_DB")

    def _docker_env(self, name):
        r = subprocess.run(["docker", "exec", self.db_container, "printenv", name],
                           capture_output=True, text=True)
        if r.returncode:
            die(f"{self.db_container} is not up -- `docker compose up -d` in {WEB}")
        return r.stdout.strip()

    def psql(self, sql, db=None, params=None):
        """Over stdin rather than `-c`, for the reason soma's bootstrap feeds psql a script: psql
        expands `:'name'` only in what it reads as input, so a `-c` statement naming a variable is
        a syntax error at the colon. It also keeps a megabyte of JSON out of the argument list."""
        cmd = ["docker", "exec", "-i", self.db_container, "psql", "-U", self.db_user,
               "-d", db or self.db_name, "-qtAX", "-v", "ON_ERROR_STOP=1"]
        for k, v in (params or {}).items():
            cmd += ["-v", f"{k}={v}"]
        r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
        if r.returncode:
            die("SQL failed:\n" + r.stderr.strip())
        return r.stdout.strip()

    def rows(self, sql, **params):
        """A query written to return one json_agg. Null (no rows) reads as an empty list."""
        return json.loads(self.psql(sql, params=params) or "null") or []


def die(msg, code=1):
    print(f"\n{msg}", file=sys.stderr)
    sys.exit(code)


# ------------------------------------------------------------------ HTTP, as a competitor does it

def call(method, url, cookie=None, body=None, raw=None, timeout=30, bearer=None):
    req = urllib.request.Request(url, method=method,
                                 data=(json.dumps(body).encode() if body is not None else raw))
    if cookie:
        req.add_header("Cookie", f"soma_session={cookie}")
    if bearer:
        req.add_header("Authorization", f"Bearer {bearer}")
    if body is not None:
        req.add_header("content-type", "application/json")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), (time.time() - t0) * 1000
    except urllib.error.HTTPError as e:
        return e.code, e.read(), (time.time() - t0) * 1000
    except Exception as e:                       # a connection refused is a status too, for a report
        return 0, str(e).encode(), (time.time() - t0) * 1000


def jwt(secret, user_id, handle, sid, ttl):
    """The cookie Soma's `session_auth` verifies: HS256, issuer `soma`, `sub`/`sid` as the session
    guard's JOIN reads them. Minted here for the same reason soma/scripts/smoke.sh mints one --
    there is no way to sign in with GitHub from a script."""
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    now = int(time.time())
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64(json.dumps({"sub": user_id, "handle": handle, "sid": sid, "iss": "soma",
                        "iat": now, "exp": now + ttl}, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{b64(sig)}"


# ------------------------------------------------------------------ 1. preflight

def preflight(st, args):
    print("==> preflight")
    if not st.secret:
        die("no SOMA_SESSION_SECRET in web/.env -- run scripts/setup/init.sh")
    if not re.match(r"^https?://(localhost|127\.0\.0\.1)(:|/|$)", st.base) and not args.force:
        die(f"{st.base} is not a loopback address. This writes synthetic competitors into whatever\n"
            f"database it is pointed at; pass --force only if you meant to.")

    code, body, _ = call("GET", f"{st.base}/v1/status")
    if code != 200:
        die(f"GET {st.base}/v1/status answered {code} -- is the stack up?")
    print(f"    api        {st.base} 200")

    season = st.rows("""SELECT json_agg(json_build_object('name', s.name, 'closes', s.submissions_close_at,
                               'open', s.submissions_open_at <= now() AND now() < s.submissions_close_at,
                               'classes', s.weight_classes, 'rules', s.rules))
                          FROM seasons s JOIN games g ON g.id = s.game_id
                         WHERE g.slug = 'ants' AND s.closed_at IS NULL""")
    if not season:
        die("no live season for `ants` -- create one on the admin page")
    s = season[0]
    if not s["open"]:
        die(f"{s['name']} is not taking submissions (window {s['open']}..{s['closes']})")
    classes = [c["class"] for c in s["classes"]]
    if "micro" not in classes:
        die(f"{s['name']} does not offer the micro class ({', '.join(classes)}) -- "
            f"every model here measures into it, so every one would be refused CLASS_NOT_OFFERED")
    print(f"    season     {s['name']} open until {s['closes'][:10]}, classes {', '.join(classes)}")

    uw = (s["rules"] or {}).get("unique_weights") or {}
    if uw.get("enabled") and args.identical:
        die("--identical against a season with unique_weights enabled refuses every submission but "
            "the first. That is a valid thing to test, but say so with --force.")

    engine = st.psql("SELECT coalesce(active_engine_digest, '') FROM games WHERE slug = 'ants'")
    if not engine:
        die("games.active_engine_digest is null -- a match is claimed by digest, so nothing would "
            "ever be played. Run `docker compose run --rm soma-bootstrap`, which declares the engine "
            "the Soma image was built with")
    replicas = kalam_replicas()
    if not replicas:
        die("no runner is up -- submissions would be admitted and never played. Start one from "
            "kalam's docker-compose.yml")
    print(f"    engine     {engine[:23]}... on {len(replicas)} replica(s): "
          f"{', '.join(n for n, _ in replicas)}")

    opponents = st.rows("""SELECT json_agg(json_build_object('handle', u.handle, 'class', v.weight_class))
                             FROM model_versions v JOIN models e ON e.id = v.model_id
                             JOIN users u ON u.id = e.owner_id
                            WHERE v.status = 'active' AND u.role = 'baseline'""")
    if not opponents:
        die("no active baseline -- a candidate's trial has no opponent and every version would "
            "wait for ever. Upload some on the season's admin page (../ants-starter/models "
            "has three) and switch them on")
    print(f"    opponents  {len(opponents)} baselines active "
          f"({', '.join(o['handle'].split('.', 1)[1] for o in opponents)})")
    return s, engine, replicas


def kalam_replicas():
    """Every runner container that is up on this machine, with its admin port. Discovered rather than
    configured: kalam's compose file names its service `runner`, and older stacks named replicas
    `kalam-N`. A runner's admin plane is behind ITS OWN key, so the per-node roster check below
    answers 401 there and is skipped, which it tolerates."""
    names = set()
    for pattern in ("name=runner", "name=kalam"):
        r = subprocess.run(["docker", "ps", "--filter", pattern, "--format", "{{.Names}}"],
                           capture_output=True, text=True)
        names.update(n for n in r.stdout.split() if n)
    out = []
    for name in sorted(names):
        p = subprocess.run(["docker", "port", name, "8080"], capture_output=True, text=True)
        out.append((name, p.stdout.strip().splitlines()[0] if p.stdout.strip() else None))
    return out


# ------------------------------------------------------------------ 2. the competitors

def mint(st, args):
    """The two fixture rows, in the shape their routes write them. Idempotent: a second run reuses
    the same competitors and submits their next release, which is what a competitor does."""
    want = [{"handle": f"{args.prefix}.{i:02d}",
             "github_id": args.github_base + i,
             "name": f"{args.prefix}-brain-{i:02d}"} for i in range(1, args.users + 1)]

    st.psql("""
BEGIN;
CREATE TEMP TABLE want ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset((:'rows')::jsonb) AS r(handle text, github_id bigint, name text);

-- NOTHING THAT IS NOT ALREADY THIS PREFIX'S IS TOUCHED. `ON CONFLICT (github_id) DO UPDATE SET
-- handle` was here, and it is how a second prefix quietly RENAMED the first one's competitors:
-- two prefixes drawing from one `--github-base` range collide on the unique github_id, and the
-- upsert relabels the row rather than refusing. The ids are derived from the prefix below so they
-- cannot collide by accident, and this refuses rather than steals if they ever do.
DO $$
DECLARE stolen text;
BEGIN
    SELECT string_agg(format('%s holds github_id %s', u.handle, u.github_id), ', ')
      INTO stolen
      FROM users u JOIN want w ON w.github_id = u.github_id
     WHERE u.handle <> w.handle;
    IF stolen IS NOT NULL THEN
        RAISE EXCEPTION 'these github_ids belong to somebody else: %. Pick another --github-base.', stolen;
    END IF;
END $$;

-- A competitor, not a baseline: `role` decides what the leaderboard and every season rule treat
-- this as, and a synthetic one that was special would test a path nobody walks.
INSERT INTO users (github_id, handle, role)
SELECT github_id, handle, 'competitor' FROM want
ON CONFLICT (github_id) DO NOTHING;

-- An entry is a name, unique under its owner. There is nothing else to write: the repository,
-- the GitHub account id and the login all left with the ownership check.
INSERT INTO models (owner_id, game_id, name)
SELECT u.id, g.id, w.name
  FROM want w JOIN users u ON u.github_id = w.github_id CROSS JOIN games g
 WHERE g.slug = 'ants'
ON CONFLICT DO NOTHING;

INSERT INTO sessions (sid, user_id, expires_at, user_agent)
SELECT gen_random_uuid(), u.id, now() + make_interval(secs => (:ttl)::int), 'submission-storm'
  FROM want w JOIN users u ON u.github_id = w.github_id;
COMMIT;
""", params={"rows": json.dumps(want), "ttl": args.timeout + 7200})

    roster = st.rows(f"""
SELECT json_agg(x ORDER BY x->>'handle') FROM (
  SELECT json_build_object(
      'handle', u.handle, 'user_id', u.id, 'model_id', e.id,
      'sid', (SELECT s.sid FROM live_sessions s WHERE s.user_id = u.id
               AND s.user_agent = 'submission-storm' ORDER BY s.issued_at DESC LIMIT 1),
      'next_version', (SELECT coalesce(max(v.version), 0) + 1 FROM model_versions v WHERE v.model_id = e.id),
      'in_flight', EXISTS (SELECT 1 FROM model_versions v WHERE v.model_id = e.id
                            AND v.status IN ('testing', 'verified'))) AS x
    FROM users u JOIN models e ON e.owner_id = u.id
   WHERE u.handle LIKE '{args.prefix}.%' AND e.name LIKE '{args.prefix}-brain-%') t""")
    if len(roster) != args.users:
        die(f"minted {len(roster)} competitors, wanted {args.users} -- an earlier run with a "
            f"different --users left rows behind. `--clean` first, or keep the same number.")
    for r in roster:
        r["cookie"] = jwt(st.secret, r["user_id"], r["handle"], r["sid"], args.timeout + 7200)

    stuck = [r["handle"] for r in roster if r["in_flight"]]
    print(f"==> {len(roster)} competitors  ({roster[0]['handle']} .. {roster[-1]['handle']})")
    if stuck:
        print(f"    {len(stuck)} still hold a version in flight from an earlier run; Soma refuses a")
        print(f"    second (model_versions_one_in_flight_uniq), so those will answer 409: "
              f"{', '.join(stuck[:6])}{' ...' if len(stuck) > 6 else ''}")
    return roster


# ------------------------------------------------------------------ 3. the artifacts

def build(st, args, roster, workdir):
    src = Path(args.source)
    onnx_bytes = (src / "model.onnx").read_bytes()
    manifest = (src / "manifest.json").read_bytes()
    print(f"==> {len(roster)} models from {src}")

    jitter = None
    if not args.identical:
        try:
            import numpy as np, onnx                       # noqa: F401  (probed, then used below)
            jitter = make_jitter(onnx_bytes)
        except ImportError:
            print("    onnx/numpy not importable, so every competitor uploads the SAME bytes.")
            print("    That is a weaker test -- see the header -- but a valid one while the")
            print("    season's unique_weights rule is off.  pip install onnx numpy")

    digests = set()
    for i, r in enumerate(roster, 1):
        d = workdir / r["handle"]
        d.mkdir(parents=True, exist_ok=True)
        # Seeded on the competitor AND the version number, so re-running reproduces a
        # competitor's v1 exactly while their v2 is a different model -- which is what a second
        # round has to be if it is to test supersession rather than re-upload the same weights.
        blob = jitter(f"v{r['next_version']}:{r['handle']}") if jitter else onnx_bytes
        (d / "model.onnx").write_bytes(blob)
        (d / "manifest.json").write_bytes(manifest)
        r["dir"], r["onnx"], r["manifest"] = d, blob, manifest
        r["weights_hash"] = "sha256:" + hashlib.sha256(blob).hexdigest()
        r["manifest_hash"] = "sha256:" + hashlib.sha256(manifest).hexdigest()
        digests.add(r["weights_hash"])

    kind = "identical" if not jitter else "jittered"
    print(f"    {kind}   {len(onnx_bytes):,} bytes each, {len(digests)} distinct digest(s), "
          f"manifest {len(manifest):,} bytes")
    if shutil.which("tinybrains"):
        first = roster[0]
        print("    checking the first one the way a competitor would (`tinybrains check`)")
        # The binary has no built-in registry since it left this repository, so name ours: the
        # cartridge checkout the stack builds from. An explicit TINYBRAINS_REGISTRY still wins.
        env = {"TINYBRAINS_REGISTRY": str(WEB / "scripts" / "dev" / "registry.toml"), **os.environ}
        r = subprocess.run(["tinybrains", "check", str(first["dir"] / "model.onnx"),
                            str(first["dir"] / "manifest.json")],
                           capture_output=True, text=True, env=env)
        for line in (r.stdout or r.stderr).strip().splitlines()[-6:]:
            print("      " + line)
        if r.returncode and not args.keep_going:
            die("`tinybrains check` refused the generated model -- admission would too")
    return roster


def make_jitter(onnx_bytes):
    """micro-bc with its fp16 initializers nudged. Returns a function of a key -- the competitor
    and their version number -- so each model is its own draw from a generator seeded by that key,
    which makes a run reproducible and a failure worth re-running.

    THE BYTES STAY THE SAME LENGTH. An fp16 `raw_data` block is fixed width, so `size_metric_bytes`
    -- and therefore the weight class -- is identical to micro-bc's, and so are the parameter count,
    the operator set and the opset. The only things that move are the digest and the policy, which
    is exactly the difference between thirty competitors and one competitor thirty times."""
    import numpy as np, onnx
    from onnx import numpy_helper

    def jitter(key):
        model = onnx.load_from_string(onnx_bytes)
        rng = np.random.default_rng(int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big"))
        for init in model.graph.initializer:
            a = numpy_helper.to_array(init)
            if a.dtype == np.float16 and a.size > 1:
                scale = float(np.abs(a.astype(np.float32)).mean()) or 1.0
                b = (a.astype(np.float32) + rng.normal(0, 0.02 * scale, a.shape)).astype(np.float16)
                init.CopyFrom(numpy_helper.from_array(b, init.name))
        return model.SerializeToString()
    return jitter


# ------------------------------------------------------------------ 4. the storm

def submit(st, args, roster):
    """POST /v1/submissions and the two PUTs, concurrently. This is the whole of what a competitor
    does, and every byte of it is real.

    The concurrency is capped for a reason that is itself under test: Soma's `session_rate` is
    20/s with a burst of 40 keyed on the CALLER'S ADDRESS, applied before auth -- and thirty
    competitors behind one loopback address are one address. Above the burst the right answer is
    429, so a storm that trips it is testing the limiter rather than the ladder."""
    print(f"==> submitting ({args.concurrency} at a time)")
    def one(r):
        code, body, ms = call("POST", f"{st.base}/v1/submissions", cookie=r["cookie"], body={
            "game": "ants", "model": r["model_id"],
            "weights_hash": r["weights_hash"], "manifest_hash": r["manifest_hash"]})
        r["submit_code"], r["submit_ms"] = code, ms
        try:
            answer = json.loads(body)
        except ValueError:
            answer = {"error": body[:200].decode("utf-8", "replace")}
        r["version_id"] = answer.get("version_id")
        r["error"] = answer.get("error")
        if code != 201:
            return r
        up = answer.get("upload") or {}
        # THE UPLOAD IS THE SUBMISSION. Nothing fetches a release, so a version
        # whose bytes never arrive is admitted against an empty key and rejected ARTIFACT_MISSING.
        for field, blob, label in (("model_onnx", r["onnx"], "weights"),
                                   ("manifest_json", r["manifest"], "manifest")):
            if args.skip_upload == label:
                r[f"put_{label}"] = "skipped"
                continue
            payload = r["onnx"][:-1] if args.corrupt == label and label == "weights" else blob
            pc, pb, pms = call("PUT", up[field], raw=payload, timeout=120)
            r[f"put_{label}"] = pc
            r[f"put_{label}_ms"] = pms
            if pc != 200:
                r["error"] = f"PUT {label} {pc}: {pb[:120].decode('utf-8','replace')}"
        return r

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        done = list(pool.map(one, roster))
    ok = [r for r in done if r["submit_code"] == 201]
    up_ok = sum(1 for r in done for k in ("put_weights", "put_manifest") if r.get(k) == 200)
    print(f"    {len(ok)}/{len(done)} accepted, {up_ok}/{2 * len(ok)} uploads stored, "
          f"{time.time() - t0:.1f}s wall")
    for r in done:
        if r["submit_code"] != 201 or r.get("error"):
            print(f"    {r['handle']}  {r['submit_code']}  {r.get('error')}")
    if not ok:
        die("nothing was accepted -- there is nothing to watch")
    return done


# ------------------------------------------------------------------ 5. the watch

SNAPSHOT = """
SELECT json_build_object(
  'versions', (SELECT json_agg(json_build_object(
        'handle', u.handle, 'id', v.id, 'status', v.status, 'class', v.weight_class,
        'reason', v.reject_reason, 'attempts', v.admit_attempts,
        'claimed', v.admit_started_at IS NOT NULL, 'created_at', v.created_at,
        'infer_us', v.infer_us, 'size', v.size_bytes) ORDER BY u.handle)
      FROM model_versions v JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
     WHERE u.handle LIKE %(like)s AND v.created_at >= %(since)s),
  'matches', (SELECT json_agg(json_build_object(
        'status', m.status, 'trial', m.trial_version_id IS NOT NULL, 'reason', m.reason,
        'fault', m.fault_reason, 'turns', m.turns, 'played_ms', m.played_ms,
        'age_s', round(extract(epoch FROM now() - m.created_at))))
      FROM matches m
     WHERE m.created_at >= %(since)s
       AND EXISTS (SELECT 1 FROM match_seats s JOIN model_versions v ON v.id = s.version_id
                     JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
                    WHERE s.match_id = m.id AND u.handle LIKE %(like)s)),
  'ratings', (SELECT json_agg(json_build_object('handle', u.handle, 'ladder', rt.ladder,
        'mu', round(rt.mu::numeric, 2), 'sigma', round(rt.sigma::numeric, 2), 'n', rt.matches_played))
      FROM ratings rt JOIN model_versions v ON v.id = rt.version_id
      JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
     WHERE u.handle LIKE %(like)s AND v.created_at >= %(since)s)) AS snap
"""


def snapshot(st, args):
    like = f"'{args.prefix}.%'"
    since = f"'{args.since}'::timestamptz"
    sql = SNAPSHOT.replace("%(like)s", like).replace("%(since)s", since)
    return json.loads(st.psql(sql) or "{}")


def tally(snap):
    v = snap.get("versions") or []
    m = snap.get("matches") or []
    by = lambda rows, key: {k: sum(1 for r in rows if r[key] == k) for k in sorted({r[key] for r in rows})}
    return {
        "versions": by(v, "status"),
        "matches": by(m, "status"),
        "trials": sum(1 for r in m if r["trial"]),
        "rated": sum(1 for r in m if r["status"] == "rated"),
        "failed": sum(1 for r in m if r["status"] == "failed"),
        "n": len(v),
    }


def watch(st, args, roster):
    """Poll the database, not the API: this is the operator's view, and it is the one that can see
    a version that is stuck rather than merely slow. The API cross-check comes after, once there is
    something to agree about."""
    print(f"==> watching (every {args.poll}s, up to {args.timeout // 60}m)")
    expect = sum(1 for r in roster if r["submit_code"] == 201)
    t0, seen, last = time.time(), {}, None
    while True:
        snap = snapshot(st, args)
        t = tally(snap)
        for v in snap.get("versions") or []:
            seen.setdefault((v["handle"], v["status"]), time.time() - t0)
        line = "  ".join(f"{k} {n}" for k, n in t["versions"].items()) or "nothing yet"
        queue = (t["matches"].get("pending", 0) + t["matches"].get("claimed", 0)
                 + t["matches"].get("running", 0))
        row = (f"    t+{int(time.time() - t0) // 60:02d}:{int(time.time() - t0) % 60:02d}  "
               f"{line:<52} queue {queue:<4} rated {t['rated']:<4} failed {t['failed']}")
        if row[12:] != (last or ""):
            print(row)
            last = row[12:]
        settled = t["versions"].get("active", 0) + t["versions"].get("rejected", 0)
        # Done when every submission has a verdict AND every promoted one has been rated at least
        # once, which is the first moment the ladder has actually USED it.
        if settled >= expect and t["rated"] >= t["versions"].get("active", 0) > 0:
            print(f"    settled after {int(time.time() - t0)}s")
            return snap, seen, True
        if time.time() - t0 > args.timeout:
            print(f"    gave up after {args.timeout}s")
            return snap, seen, False
        time.sleep(args.poll)


# ------------------------------------------------------------------ 6. what it proves

def checks(st, args, roster, snap, seen, settled, replicas):
    print("==> checks")
    results = []
    def check(ok, name, detail=""):
        results.append((bool(ok), name, detail))
        print(f"    {'ok  ' if ok else 'FAIL'}  {name:<52} {detail}")

    accepted = [r for r in roster if r["submit_code"] == 201]
    check(len(accepted) == len(roster), "every submission answered 201",
          f"{len(accepted)}/{len(roster)}")
    uploads = [r for r in accepted if r.get("put_weights") == 200 and r.get("put_manifest") == 200]
    check(len(uploads) == len(accepted) or args.skip_upload or args.corrupt,
          "every upload was stored", f"{len(uploads)}/{len(accepted)}")

    versions = snap.get("versions") or []
    check(len(versions) >= len(accepted), "every accepted submission has a row to show for it",
          f"{len(versions)}/{len(accepted)}")
    by_status = {}
    for v in versions:
        by_status.setdefault(v["status"], []).append(v)
    stuck = by_status.get("testing", []) + by_status.get("verified", [])
    check(not stuck, "every submission reached a verdict",
          f"{len(stuck)} still in flight" if stuck else f"{len(versions)} decided")
    if stuck:
        for v in stuck[:5]:
            print(f"            {v['handle']} {v['status']} attempt {v['attempts']}"
                  f"{' (claim held)' if v['claimed'] else ''}")

    active = by_status.get("active", [])
    rejected = by_status.get("rejected", [])
    check(active, "at least one version was promoted", f"{len(active)} active, {len(rejected)} rejected")
    if rejected:
        words = {}
        for v in rejected:
            words.setdefault(v["reason"] or "(no reason)", []).append(v["handle"])
        for word, who in sorted(words.items()):
            print(f"            {word:<24} {len(who)}  {', '.join(who[:4])}")
        check(all(v["reason"] for v in rejected), "every rejection names a reason a competitor can act on")

    # Every promoted version is on TWO ladders -- its class and open -- with an origin event, which
    # is what a fold reads. A version rated on one is a version the leaderboard shows in half the
    # places it belongs.
    if active:
        ladders = {}
        for r in snap.get("ratings") or []:
            ladders.setdefault(r["handle"], set()).add(r["ladder"])
        full = [h for h, ls in ladders.items() if {"micro", "open"} <= ls]
        check(len(full) >= len(active), "every promoted version is rated on its class and on open",
              f"{len(full)}/{len(active)}")

    matches = snap.get("matches") or []
    rated = [m for m in matches if m["status"] == "rated"]
    failed = [m for m in matches if m["status"] == "failed"]
    check(rated, "the storm's versions actually played", f"{len(rated)} rated, {len(failed)} failed")
    if failed:
        faults = {}
        for m in failed:
            faults.setdefault(m["fault"] or m["reason"] or "(none)", 0)
            faults[m["fault"] or m["reason"] or "(none)"] += 1
        for word, n in sorted(faults.items(), key=lambda kv: -kv[1]):
            print(f"            {word:<24} {n}")
        # MODEL_UNAVAILABLE IS NOT A FAILURE BY ITSELF, and a ratio is the wrong test. Thirty
        # promotions at once is thirty registrations on every replica, and `tb-roster` runs every
        # 15 s: a trial claimed before its replica has caught up is REFUSED, which is the contract
        # working -- "a replica that has not caught up releases the row rather than playing a seat
        # blind". What the platform actually promises is that the lag costs a re-pair and never a
        # version, so that is what is asserted: the lag must be TRANSIENT, and no candidate may be
        # lost to it. A standing lag -- refusals still arriving once the burst is over -- is the
        # real failure, and so is a version that burned `repair_cap` trials and was rejected
        # UNPLAYABLE for a reason that was never its own.
        unavailable = [m for m in failed if m["fault"] == "MODEL_UNAVAILABLE"]
        unplayable = [v for v in rejected if v["reason"] == "UNPLAYABLE"]
        check(not unplayable, "no version was lost to a roster that had not caught up",
              f"{len(unavailable)} refused, {len(unplayable)} rejected UNPLAYABLE")
        # ONE REFUSED MATCH PER PROMOTION IS THE BUDGET, and the reasoning is what makes it a test
        # rather than a tolerance. A promotion is the first moment a replica has any reason to hold
        # this model, so its first match can be claimed before `tb-roster` has registered it -- once
        # per promotion, per burst. More than that means refusals are not tracking promotions, which
        # is a roster that is falling behind rather than one that is merely 15 s late.
        #
        # NOT "none in the last 90 seconds", which is what this said first and could never pass: the
        # watch settles the instant the last version promotes, so the newest promotion's own lag is
        # always inside the window. A check that the run's own ending guarantees will fail is a
        # check that measures the clock.
        # ONCE PER PROMOTION PER REPLICA, not once per promotion. Each replica has its own roster
        # clock and its own model set -- the reason no clock calls a replica -- so a newly
        # promoted version is refused independently by each one until its own clock
        # catches up. The bound was written when the dev stack ran a single replica and fails on any
        # fleet, which is exactly when it would matter: a check that cannot pass with two replicas
        # is a check that gets ignored the first time someone runs two.
        check(len(unavailable) <= len(active) * max(1, len(replicas)),
              "refusals tracked promotions rather than piling up",
              f"{len(unavailable)} refused against {len(active)} promotions "
              f"on {max(1, len(replicas))} replica(s)")

    # THE REPLICAS' OWN VIEW. A version is playable only where its node registered it: no clock ever
    # calls a replica, so this is the one thing the platform database cannot answer.
    if st.admin_key:
        for name, port in replicas:
            if not port:
                continue
            # A node's admin plane is behind `admin_auth`; a runner's key is its own, so this is usually 401.
            code, body, _ = call("GET", f"http://{port}/api/v1/admin/models?limit=500",
                                 bearer=st.admin_key)
            held = -1
            if code == 200:
                try:
                    doc = json.loads(body)
                    items = doc.get("data", doc)
                    items = items.get("models", items) if isinstance(items, dict) else items
                    ids = {str(m.get("model_id") or m.get("id")) for m in items
                           if m.get("status") in (None, "active")}
                    held = sum(1 for v in active if f"tb.v{v['id']}" in ids)
                except (ValueError, AttributeError, TypeError):
                    held = -1
            check(held >= len(active) or held == -1,
                  f"{name} registered the promoted versions",
                  f"{held}/{len(active)}" if held >= 0 else f"admin API answered {code}")

    # THE API AND THE DATABASE MUST AGREE. A competitor never sees a row; they see this.
    disagree = []
    for r in accepted[:args.users]:
        code, body, _ = call("GET", f"{st.base}/v1/models?game=ants", cookie=r["cookie"])
        if code != 200:
            disagree.append(f"{r['handle']} GET /v1/models {code}")
            continue
        mine = [v for e in json.loads(body) for v in e["versions"] if v["version_id"] == r["version_id"]]
        row = next((v for v in versions if v["id"] == r["version_id"]), None)
        if not mine:
            disagree.append(f"{r['handle']} sees no version {r['next_version']}")
        elif row and mine[0]["status"] != row["status"]:
            disagree.append(f"{r['handle']} API says {mine[0]['status']}, row says {row['status']}")
    check(not disagree, "every competitor's own page agrees with the row",
          f"{len(accepted) - len(disagree)}/{len(accepted)}" if not disagree else disagree[0])

    board = st.rows(f"""SELECT json_agg(t) FROM (
        SELECT u.handle, rt.ladder::text AS ladder, round(rt.mu::numeric, 2) AS mu,
               round(rt.sigma::numeric, 2) AS sigma, rt.matches_played AS matches
          FROM ratings rt JOIN model_versions v ON v.id = rt.version_id
          JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
         WHERE v.status = 'active' AND rt.ladder = 'micro'
         ORDER BY rt.mu - 3 * rt.sigma DESC LIMIT 12) t""")
    if board:
        print("\n==> the micro ladder")
        print(f"    {'handle':<18} {'mu':>7} {'sigma':>7} {'played':>7}")
        for b in board:
            print(f"    {b['handle']:<18} {b['mu']:>7} {b['sigma']:>7} {b['matches']:>7}")

    if seen:
        verdicts = [t for (h, s), t in seen.items() if s in ("verified", "active", "rejected")]
        if verdicts:
            v = sorted(verdicts)
            print(f"\n    time to a verdict: first {v[0]:.0f}s, median {v[len(v) // 2]:.0f}s, "
                  f"last {v[-1]:.0f}s")

    failed_n = sum(1 for ok, _, _ in results if not ok)
    print(f"\n==> {len(results) - failed_n} passed, {failed_n} failed"
          f"{'' if settled else '  (the watch timed out; counts are a snapshot, not a verdict)'}")
    return failed_n == 0 and settled


# ------------------------------------------------------------------ report / clean

def report(st, args):
    snap = snapshot(st, args)
    t = tally(snap)
    if not t["n"]:
        print(f"no `{args.prefix}.` competitor has submitted since {args.since}")
        return
    print(f"==> {t['n']} versions since {args.since}")
    for k, n in t["versions"].items():
        print(f"    {k:<12} {n}")
    for v in snap["versions"]:
        if v["status"] == "rejected":
            print(f"      {v['handle']:<14} {v['reason']}")
    print(f"==> matches")
    for k, n in t["matches"].items():
        print(f"    {k:<12} {n}")
    print(f"    trials       {t['trials']}")


def clean(st, args):
    """Everything the storm made, and the rating history its matches caused.

    The order is the foreign keys': rating_events name a match, match_seats name a version, and
    neither cascades. What makes this honest rather than a truncation is the last statement --
    every baseline the storm played is put back to the mu/sigma of the newest rating event that
    SURVIVED the delete, which is exact, because that is what `mu_after` records."""
    n = st.psql(f"SELECT count(*) FROM users WHERE handle LIKE '{args.prefix}.%'")
    if n == "0":
        print(f"nothing to clean: no user matches `{args.prefix}.%`")
        return
    keys = st.rows(f"""SELECT json_agg(v.artifact_key) FROM model_versions v
                         JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
                        WHERE u.handle LIKE '{args.prefix}.%'""")
    print(f"==> removing {n} competitors, their versions, matches and rating events")
    st.psql(f"""
BEGIN;
CREATE TEMP TABLE doomed ON COMMIT DROP AS
SELECT v.id FROM model_versions v JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
 WHERE u.handle LIKE '{args.prefix}.%';

CREATE TEMP TABLE doomed_matches ON COMMIT DROP AS
SELECT DISTINCT m.id FROM matches m
 WHERE m.trial_version_id IN (SELECT id FROM doomed)
    OR EXISTS (SELECT 1 FROM match_seats s WHERE s.match_id = m.id AND s.version_id IN (SELECT id FROM doomed));

DELETE FROM rating_events WHERE match_id IN (SELECT id FROM doomed_matches);
DELETE FROM matches WHERE id IN (SELECT id FROM doomed_matches);          -- seats cascade
DELETE FROM model_versions WHERE id IN (SELECT id FROM doomed);           -- ratings + events cascade
DELETE FROM models WHERE owner_id IN (SELECT id FROM users WHERE handle LIKE '{args.prefix}.%');
DELETE FROM users WHERE handle LIKE '{args.prefix}.%';                    -- sessions cascade

-- Put every surviving version back to its last surviving event. A rating is current state and
-- nothing recomputes it, so without this the baselines keep whatever the storm did to them.
UPDATE ratings r
   SET mu = e.mu_after, sigma = e.sigma_after
  FROM (SELECT DISTINCT ON (version_id, ladder) version_id, ladder, mu_after, sigma_after
          FROM rating_events ORDER BY version_id, ladder, seq DESC) e
 WHERE r.version_id = e.version_id AND r.ladder = e.ladder
   AND (r.mu, r.sigma) IS DISTINCT FROM (e.mu_after, e.sigma_after);

UPDATE clocks SET epoch = epoch + 1, updated_at = now() WHERE key = 'roster';
COMMIT;
""")
    gone = 0
    for key in keys:
        for k in (key, key.replace("model.onnx", "manifest.json")):
            r = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
                                "--aws-sigv4", f"aws:amz:{st.s3_region}:s3",
                                "--user", f"{st.s3_key}:{st.s3_secret}", "-X", "DELETE",
                                f"{st.s3}/{st.bucket}/{k}"], capture_output=True, text=True)
            gone += r.stdout.strip() in ("204", "200")
    print(f"    {gone} objects removed from {st.bucket}, roster epoch bumped")
    print("    the baselines' ratings are back at their last surviving event")


# ------------------------------------------------------------------ main

def main():
    p = argparse.ArgumentParser(description="Tens of competitors submitting a micro-class model at once.")
    p.add_argument("--users", type=int, default=30, help="how many competitors (default 30)")
    p.add_argument("--base", default="http://localhost:5173",
                   help="where /v1 answers: the web proxy by default, :8080 for Orion directly")
    p.add_argument("--source", default=str(DEFAULT_SOURCE), help="the model to clone (default ants-starter/models/micro-bc)")
    p.add_argument("--prefix", default="storm", help="handle/name prefix these competitors live under")
    p.add_argument("--github-base", type=int, default=0,
                   help="first synthetic github_id (default: derived from --prefix, so two "
                        "prefixes cannot collide on the unique column)")
    p.add_argument("--identical", action="store_true", help="upload the same bytes for everyone")
    p.add_argument("--concurrency", type=int, default=8, help="submissions in flight (default 8)")
    p.add_argument("--poll", type=int, default=10, help="seconds between snapshots")
    p.add_argument("--timeout", type=int, default=1800, help="seconds to watch before giving up")
    p.add_argument("--work", default="", help="where the generated models are written")
    p.add_argument("--since", default="", help="report/clean window start (default: this run)")
    p.add_argument("--no-wait", action="store_true", help="submit and exit")
    p.add_argument("--report", action="store_true", help="print the current state and exit")
    p.add_argument("--clean", action="store_true", help="remove everything the storm made")
    p.add_argument("--force", action="store_true", help="allow a non-loopback --base")
    p.add_argument("--keep-going", action="store_true", help="do not stop on a failed local check")
    p.add_argument("--corrupt", choices=["weights"], help="upload bytes that do not match the declared hash")
    p.add_argument("--skip-upload", choices=["weights", "manifest"], help="declare a file and never upload it")
    args = p.parse_args()

    # DERIVED FROM THE PREFIX. github_id is UNIQUE, so two prefixes sharing a range fight over the
    # same rows; a prefix-derived base puts each storm in its own block of a billion-wide space.
    args.github_base = args.github_base or (
        900_000_000 + int.from_bytes(hashlib.sha256(args.prefix.encode()).digest()[:4], "big") % 90_000 * 1000)

    st = Stack(args)
    if args.report or args.clean:
        args.since = args.since or "1970-01-01"
        return report(st, args) if args.report else clean(st, args)

    # THE DATABASE'S CLOCK, not this machine's. Every row this filters on is a timestamptz written
    # by Postgres, and a local wall-clock string is read back in the session's zone -- so on a
    # machine east of UTC the window starts in the future and the watch reports an empty ladder
    # while the ladder fills up behind it.
    args.since = st.psql("SELECT (now() - interval '5 seconds')::text")
    season, engine, replicas = preflight(st, args)
    roster = mint(st, args)
    workdir = Path(args.work) if args.work else Path(os.environ.get("TMPDIR", "/tmp")) / "tb-storm"
    build(st, args, roster, workdir)
    roster = submit(st, args, roster)
    if args.no_wait:
        print(f"\n    `--report --since '{args.since}'` says what became of them")
        return
    snap, seen, settled = watch(st, args, roster)
    ok = checks(st, args, roster, snap, seen, settled, replicas)
    print(f"    `--clean` removes the {args.users} competitors and everything they caused")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
