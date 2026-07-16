# Production VPS deployment bundle

This bundle deploys the three wArchi services to the existing `warchi` k3d cluster on
`root@138.124.14.246`. It is intentionally specific to `warchi.ru`:

- `https://warchi.ru` — public `warchi-site`;
- `https://app.warchi.ru` — `warchi`, including the same-origin `/api/` and `/ws` proxy;
- `arepos-server` — cluster-internal only, with PostgreSQL, MinIO, and Cerbos in namespace `arch`.

The fixed default versions are arepos-server `0.5.2`, warchi `0.8.3`, and warchi-site
`0.2.1`. The scripts never deploy Papirus source; the warchi release consumes
`@ngroznykh/papirus@^0.6.5` from npm and receives an empty named `papirus` Docker build context
only to satisfy the release Dockerfile.

## Required state

On the operator workstation:

- `git`, `node`, `awk`, `ssh`, `ssh-keyscan`, `ssh-keygen`, `rsync`, and `dig`;
- sibling repositories `warchi`, `arepos-server`, and `warchi-site`;
- each repository clean, with `warchi` and `arepos-server` checked out on `master` and
  `warchi-site` checked out on `main`, at the exact matching annotated or lightweight tag
  (`v0.8.3`, `v0.5.2`, or `v0.2.1`); these release branches are pinned rather than inferred from
  local remote metadata;
- package, Gradle, and chart versions matching those tags;
- DNS configured so `warchi.ru A` is the single address `138.124.14.246`,
  `app.warchi.ru CNAME` is exactly `warchi.ru.` (the trailing dot is normalized), and the CNAME
  resolves to that single address. Neither name may resolve to an IPv6 (`AAAA`) address.

On the VPS:

- Ubuntu x86_64, Docker 29, k3d, kubectl, Helm, curl, jq, tar, dig, rsync,
  `sha256sum`, `shred`, and at least 10 GiB free disk;
- running k3d cluster `warchi`, namespace `arch`, Traefik, and cert-manager;
- healthy existing `arepos-server` and `warchi` releases and their existing PVCs;
- `/opt/warchi-deploy/secrets.env`, owned by `root:root` with mode `600`;

`secrets.env` must define these names (values are never tracked or printed):

```text
JWT_SECRET
ADMIN_SECRET
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
POSTGRES_PASSWORD
POSTGRES_SUPER_PASSWORD
```

The SSH ED25519 fingerprint is pinned to
`SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA`. `deploy.sh` builds a temporary
`known_hosts`, verifies that fingerprint, and then uses strict host-key checking. The destination
is hard-pinned to `root@138.124.14.246`; environment variables cannot override the host, user, or
fingerprint.

## Usage

Run local bundle tests first:

```bash
bash infra/vps/tests/verify-bundle.sh
```

Review the sanitized plan without SSH, rsync, build, backup, or deployment:

```bash
DRY_RUN=1 infra/vps/deploy.sh
```

Deploy the fixed versions:

```bash
infra/vps/deploy.sh
```

Version defaults can be overridden only for a prepared, tagged release whose source and chart
versions match:

```bash
AREPOS_VERSION=x.y.z WARCHI_VERSION=x.y.z SITE_VERSION=x.y.z infra/vps/deploy.sh
```

Do not pass secrets on the command line. The orchestrator syncs exactly the three sibling
repositories to `/opt/warchi-deploy/src/`, excluding Git metadata, `.env*`, dependency/build
outputs, coverage, and common secret/key file names.

## Deployment and cutover

The remote flow writes an explicit kubeconfig with `k3d kubeconfig write warchi`, refuses to
overwrite any of the three immutable image tags, builds the images, and imports them into k3d.
Normal builds first use unique temporary tags. Final immutable tags are assigned only after all
three builds succeed; failures before the first Helm mutation remove temporary/new final tags
from Docker and actual k3d server/agent nodes.
For recovery after an interrupted run, `REUSE_EXISTING_IMAGES=1 infra/vps/deploy.sh` skips both
build and import only after all three exact images are verified both in the root Docker daemon and
on every actual k3d server/agent node. The k3d load-balancer container is intentionally excluded.
Verification compares the Docker config digest with the config digest referenced by each
containerd manifest; tag presence alone is insufficient. It never overwrites a tag and it does
not skip the mandatory backup.
Database and MinIO values are generated from `secrets.env` in a mode-`600` temporary file and
securely removed by a trap. Static values contain no credentials. JWT and admin credentials are
read only through uppercase `valueFrom` keys. The deployment creates or safely applies
`arch/arepos-server-auth-secret` from a root-only temporary env file only when it is absent.
When present, both JWT/admin values are decoded and constant-string compared with `secrets.env`;
any mismatch aborts without overwriting the Secret or printing values.

Before creating that auth Secret, building, or running Helm, deployment compares the existing
PostgreSQL and MinIO Secret keys with `secrets.env` without printing values. Both existing PVCs
must already be `Bound` with an exact `20Gi` request and capacity and a valid StorageClass, so no
storage expansion is attempted during deployment.

After the mandatory backup, the deployment shreds the obsolete
`/opt/warchi-deploy/values/arepos-server-vps.yaml` that previously held inline credentials. This
is cleanup, not rotation: credentials remain in root-only `secrets.env`, the Kubernetes Secret,
and generated mode-`600` temporary values. Synced tracked values are also set to mode `600` on
the VPS. Rsync uses `--delete --delete-excluded` inside source trees, removing stale excluded
`.env`, keys, credentials, and build output from Docker contexts. The canonical root-only
`/opt/warchi-deploy/secrets.env` is outside every synchronized source root and is untouched.

Every production run invokes `backup.sh` before any Helm upgrade; there is no skip-backup option.
The backup creates a root-only timestamp directory containing a PostgreSQL custom-format dump,
MinIO archive, and root-only Helm values/manifests. Empty database or MinIO artifacts fail the
deployment. `arepos-server` and `warchi` Helm status, values, and manifests are mandatory and
nonempty. `warchi-site` is optional only when no release exists; once present, its complete Helm
backup is equally mandatory.

For a consistent PostgreSQL/MinIO snapshot, backup records the application replica count, scales
only `arepos-server` to zero, and restores it with rollout waiting from an exit trap on both success
and failure. PostgreSQL and MinIO remain running. This creates a short maintenance interruption
for writes. The finished dump is validated with `pg_restore --list` inside the PostgreSQL pod and
the MinIO archive with `tar -tzf` before deployment continues.

Cutover order minimizes the root-site gap:

1. `arepos-server`: atomic Helm upgrade, rollout, API `0.5.2`, Liquibase migration `042`;
2. apply the namespaced Traefik `redirect-https` Middleware before any ingress upgrade;
3. create a temporary app prestage Ingress pointing `app.warchi.ru` at the existing `warchi`
   Service and pre-issue `warchi-app-ru-tls`; create a direct Certificate for
   `warchi-site-ru-tls`. The redirect is ingress-scoped, so cert-manager HTTP01 solver ingresses
   are not affected;
4. install/upgrade the `warchi-site` workload with ingress disabled and capture the current
   deployed `warchi` Helm revision;
5. atomically move `warchi` to `app.warchi.ru`, wait for its certificate and health, then remove
   the temporary prestage Ingress;
6. immediately atomically enable `warchi-site` on `warchi.ru`, wait for rollout, TLS, and health;
7. run full non-mutating production verification inside the rollback guard.

If any step fails after the host switch or during the full verification (including redirects,
same-origin proxies, `SELF-HOSTED`, images, versions, and WebSocket routing), the exit trap
automatically rolls the site back to its ingress-disabled prestage revision and rolls `warchi`
back to the captured revision, restoring the root host. The failed deployment still exits
non-zero; inspect Helm history and rerun with `REUSE_EXISTING_IMAGES=1` only after correcting the
cause.

All upgrades use `helm upgrade --install --wait --atomic`. Existing release names and PVC names
are preserved. Old images and timestamped backups are retained.

## Verification and manual smoke

`verify.sh` checks DNS, rollouts, exact images, certificates, API and app versions, health,
migration `042`, exact 301/308 HTTP-to-HTTPS redirects, the root `SELF-HOSTED` marker,
unauthenticated 401 responses from `/api/v1/auth/me` through both public origins, and a bounded
non-mutating WebSocket handshake whose public status and content type must match the direct
in-cluster backend rejection rather than return SPA 200/404 or HTML. All production `curl`
requests have bounded connect and total timeouts; a timeout inside guarded verification triggers
the normal automatic rollback. Verification also inspects the active `nginx -T` output in the
deployed warchi pod for the exact `/ws` backend proxy before performing the handshakes.

SSO and CSRF cannot be honestly verified by a non-mutating script. After deployment, manually:

1. sign in at `https://app.warchi.ru`;
2. visit `https://warchi.ru` and confirm the shared `.warchi.ru` session behavior;
3. perform one authorized admin mutation in the browser and confirm CSRF succeeds;
4. confirm registration and Swagger are unavailable publicly.

## Rollback

Inspect revisions before selecting a rollback target:

```bash
KUBECONFIG="$(k3d kubeconfig write warchi)"
helm history arepos-server -n arch
helm history warchi -n arch
helm history warchi-site -n arch
```

Rollback in reverse exposure order, using the reviewed revision number:

```bash
helm rollback warchi-site REVISION -n arch --wait
helm rollback warchi REVISION -n arch --wait
helm rollback arepos-server REVISION -n arch --wait
```

Then run `verify.sh` with the rollback versions supplied in the environment.

**Database warning:** a Helm rollback does not reverse Liquibase migrations or restore data.
Restore `postgresql.dump` and the matching MinIO archive only during a declared outage, only from
the same timestamped backup, and only after reviewing migration compatibility. A database restore
is destructive and must not be attempted as an automatic reaction to an application rollback.

## Deferred security work

Credential rotation was explicitly deferred for this cutover. Existing JWT, admin, PostgreSQL,
MinIO credentials, Secrets, and PVC-backed data are preserved. This is security debt: schedule a
separate coordinated rotation with session invalidation, Kubernetes Secret updates, database and
MinIO credential changes, backup validation, and rollback planning.
