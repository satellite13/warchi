# Production VPS deployment bundle

This bundle deploys the three wArchi services to the existing `warchi` k3d cluster on
`root@138.124.14.246`. It is intentionally specific to `warchi.ru`:

- `https://warchi.ru` — public `warchi-site`;
- `https://app.warchi.ru` — `warchi`, including the same-origin `/api/` and `/ws` proxy;
- `arepos-server` — cluster-internal only, with PostgreSQL, MinIO, and Cerbos in namespace `arch`.

The fixed default versions are arepos-server `0.5.2`, warchi `0.8.13`, and warchi-site
`0.2.1`. The scripts never deploy Papirus source; the warchi release consumes
`@ngroznykh/papirus@^0.6.5` from npm and receives an empty named `papirus` Docker build context
only to satisfy the release Dockerfile.

## Required state

On the operator workstation:

- `git`, `node`, `awk`, `ssh`, `ssh-keyscan`, `ssh-keygen`, `rsync`, and `dig`;
- sibling repositories `warchi`, `arepos-server`, and `warchi-site`;
- each repository clean, with `warchi` and `arepos-server` checked out on `master` and
  `warchi-site` checked out on `main`, at the exact matching annotated or lightweight tag
  (`v0.8.13`, `v0.5.2`, or `v0.2.1`); these release branches are pinned rather than inferred from
  local remote metadata;
- package, Gradle, and chart versions matching those tags;
- DNS configured so `warchi.ru A` is the single address `138.124.14.246`,
  `app.warchi.ru CNAME` is exactly `warchi.ru.` (the trailing dot is normalized), and the CNAME
  resolves to that single address. Neither name may resolve to an IPv6 (`AAAA`) address.

On the VPS:

- Ubuntu x86_64, Docker 29, k3d, kubectl, Helm, curl, jq, tar, GNU `timeout`, flock, dig, rsync,
  `sha256sum`, `shred`, and at least 10 GiB free disk;
- cluster nodes able to use the pinned `busybox:1.36` image (it is reused from the node cache when
  present and pulled when absent);
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
overwrite immutable image tags in normal mode, builds the images, and imports them into k3d.
Builds first use unique temporary tags. Final immutable tags are assigned only after every
required build succeeds; failures before the first Helm mutation remove only newly built
temporary/final tags from Docker and actual k3d server/agent nodes.
For recovery after an interrupted run, `REUSE_EXISTING_IMAGES=1 infra/vps/deploy.sh` makes a
decision per image. It may reuse a verified image and build an absent exact-tag release image in
the same run. An image that exists anywhere must exist in the root Docker daemon and on every
actual k3d server/agent node with the same config digest. Partial presence, local absence, or a
node digest mismatch aborts. Failure to list containers or inspect images on any workload node is
an unknown state and also aborts; it is never treated as absence. Completely absent images are
built to temporary tags, assigned final tags only after all missing builds succeed, and imported;
reused tags are never overwritten or cleaned up. If every image is reusable, build and import are
skipped. The k3d load-balancer container is intentionally excluded. Tag presence alone is
insufficient.

Recovery mode still requires clean repositories at exact release tags with matching versions,
the mandatory backup, and all normal preflight, storage, Secret, Helm, rollback, and verification
guards.
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

The VPS values retain the verified production sizing for the arepos-server container: requests
are `300m` CPU and `512Mi` memory, while limits are `1000m` CPU and `1Gi` memory. The local bundle
test renders the Deployment and checks these exact values as a preflight, preventing a chart
default with insufficient memory from reaching an atomic Helm upgrade.

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
backup is equally mandatory. Host-level nonblocking `flock` on
`/var/lock/warchi-backup.lock` serializes backup runs; a concurrent run exits before creating
artifacts or mutating Kubernetes resources.

For a consistent PostgreSQL/MinIO snapshot, backup records the application replica count, scales
only `arepos-server` to zero, and restores it with rollout waiting from an exit trap on both success
and failure. PostgreSQL and MinIO remain running. MinIO files are archived by a unique temporary
Pod using `busybox:1.36` pinned to multi-architecture digest
`sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662`; the Pod mounts
the existing `arepos-server-minio-data` PVC
read-only at `/data`, is pinned to the running MinIO Pod's node, waits until Ready, and has a
ten-minute active deadline. Labeled stale helpers are deleted asynchronously at the start of the
next backup. The exit trap also requests asynchronous helper deletion before immediately restoring
the original application replicas, so helper cleanup cannot hold the maintenance window open. The
backup does not require a shell or `tar` in the MinIO image. This creates a short maintenance
interruption for writes. The finished dump is copied to a unique temporary file in the running
PostgreSQL pod and validated there with file-based `pg_restore --list`; both the copy and validation
have GNU `timeout` bounds, and a bounded exit-trap command removes the remote file before helper
cleanup and application replica restoration. The MinIO archive is validated with local `tar -tzf`
before deployment continues.

A timestamped backup directory is a valid restore point only when it contains the root-only
`COMPLETE` marker. The directory starts with a root-only `.failed` marker; any backup, helper-Pod,
validation, cleanup, or replica-restore failure leaves `.failed` in place and never creates
`COMPLETE`. Failed directories may contain incomplete artifacts and must not be used for restore.

Cutover order minimizes the root-site gap:

1. `arepos-server`: atomic Helm upgrade, rollout, API `0.5.2`, Liquibase migration `042`;
2. apply the namespaced Traefik `redirect-https` Middleware before any ingress upgrade;
3. apply one explicit cert-manager Certificate for each production TLS secret
   (`warchi-app-ru-tls` and `warchi-site-ru-tls`) and wait for both to become Ready;
4. create a temporary app prestage Ingress pointing `app.warchi.ru` at the existing `warchi`
   Service and referencing the already-issued `warchi-app-ru-tls` secret. The redirect is
   ingress-scoped, so cert-manager HTTP01 solver ingresses are not affected;
5. install/upgrade the `warchi-site` workload with ingress disabled and capture the current
   deployed `warchi` Helm revision;
6. atomically move `warchi` to `app.warchi.ru`, wait for its certificate and health, then remove
   the temporary prestage Ingress;
7. immediately atomically enable `warchi-site` on `warchi.ru`, wait for rollout, TLS, and health;
8. run full non-mutating production verification inside the rollback guard.

Certificate ownership is explicit and independent of Ingress lifecycle. The temporary and final
production Ingresses contain TLS secret references but no cert-manager shim issuer annotations,
so cert-manager does not synthesize additional ingress-owned Certificates. Cleanup deletes only
the temporary `warchi-app-tls-prestage` Ingress; both explicit Certificates and their TLS secrets
remain available for final verification and later deployments.

Deployments also adopt migration state left by the former ingress-shim flow. For each app and site
Certificate, deployment checks whether the resource already exists, clears any
`metadata.ownerReferences`, applies the explicit manifest, and fails closed unless the resulting
Certificate has no owners. This adoption is idempotent and never deletes or recreates the TLS
Secret. After adoption, cert-manager continues normal issuance and renewal from the explicit
Certificate resource; Ingress replacement or prestage cleanup cannot garbage-collect it.

Public health checks allow a bounded ingress convergence window after each host switch. They make
18 attempts, five seconds apart; every attempt uses a three-second connect timeout and a ten-second
total timeout. The resulting retry deadline is at most 265 seconds per endpoint. Only transport
status `000` and convergence statuses `404`, `408`, `425`, `429`, `500`, `502`, `503`, and `504`
are retried; 2xx succeeds, while all other 3xx/4xx/5xx statuses fail immediately. Certificate
validation remains enabled, and progress contains only status and attempt numbers, never response
bodies or URLs.

An integrated deployment has at most two endpoint readiness windows total: one for the app and one
for the site, for a combined maximum of 530 seconds. The app check runs while the prestage Ingress
and its already-ready explicit certificate still exist; the prestage Ingress is removed only after
public app health converges, without deleting the Certificate. `remote-deploy.sh` then invokes full
verification with readiness explicitly confirmed, so those waits are not repeated. Standalone
`verify.sh` defaults to both readiness waits. In either mode, exact versions, redirects, proxies,
health, and all other strict assertions still run once and fail without retrying mismatches.

If any step fails after the host switch or during the full verification (including redirects,
same-origin proxies, SPA root structure, images, versions, and WebSocket routing), the exit trap
automatically rolls the site back to its ingress-disabled prestage revision and rolls `warchi`
back to the captured revision, restoring the root host. The failed deployment still exits
non-zero; inspect Helm history and rerun with `REUSE_EXISTING_IMAGES=1` only after correcting the
cause.

All upgrades use `helm upgrade --install --wait --atomic`. Existing release names and PVC names
are preserved. Old images and timestamped backups are retained.

## Verification and manual smoke

`verify.sh` checks DNS, rollouts, exact images, certificates, API and app versions, health,
migration `042`, exact 301/308 HTTP-to-HTTPS redirects, and that the root response is HTML with
the stable `<div id="app">` SPA mount. It does not inspect lazy-loaded JavaScript chunks.
It also checks unauthenticated 401 responses from `/api/v1/auth/me` through both public origins,
the active `nginx -T` output for the exact `/ws` backend proxy and WebSocket upgrade directives,
and a bounded non-mutating public WebSocket probe with Upgrade headers. The probe accepts any HTTP
status because unauthenticated handshake behavior depends on the framework and WebSocket client;
it only rejects an SPA HTML fallback. All production `curl` requests have bounded connect and
total timeouts; a timeout inside guarded verification triggers the normal automatic rollback.

SSO and CSRF cannot be honestly verified by a non-mutating script. After deployment, manually:

1. sign in at `https://app.warchi.ru`;
2. visit `https://warchi.ru` and confirm the shared `.warchi.ru` session behavior;
3. perform one authorized admin mutation in the browser and confirm CSRF succeeds;
4. confirm the `SELF-HOSTED` visibility in the browser after the SPA loads;
5. open an authenticated STOMP/WebSocket connection and confirm model live sync;
6. confirm registration and Swagger are unavailable publicly.

An authenticated STOMP/WebSocket smoke test needs a browser or WebSocket-capable client. `wget`
is not a valid imitation of that handshake and is deliberately not used by `verify.sh`.

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
