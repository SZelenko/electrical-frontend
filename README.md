# Electrical Panel Builder Frontend

Frontend of the electrical panel builder. Runs in **MicroK8s** via Helm, like the backend: the Vite dev server
runs in the cluster and the code is mounted into the pod from the host (`hostPath`), so edits are live.

- App: <https://app.electrical.local>
- API it talks to: <https://api.electrical.local/api/v1> (`VITE_API_URL`)

## Image build and push

```shell
docker build -f kube/Dockerfile --target dev -t localhost:32000/electrical-app:latest .
docker push localhost:32000/electrical-app:latest
```

Build context is the `frontend/` root. Push to `localhost:32000` (it is in Docker's `insecure-registries`;
`127.0.0.1:32000` is rejected as HTTPS-only on this machine).

The `dev` target runs `npm run dev -- --host 0.0.0.0` on port 5173 as a non-root user with the host UID/GID
(`APP_UID`/`APP_GID`, default 1000). `node_modules` is installed into the hostPath mount with `npm` in the pod.

The `prod` target (`npm ci && npm run build`, static `dist/` served by unprivileged nginx on port 8080 with SPA
fallback) is not used locally. Pass the public API URL at build time:

```shell
docker build -f kube/Dockerfile --target prod --build-arg VITE_API_URL=https://api.electrical.local/api/v1 -t electrical-app:prod .
```

## Values

```shell
cp values.yaml.dist values.yaml
# adjust hostPath if the repo lives elsewhere
```

| Key              | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `serviceName`    | Deployment, Service and image name (`electrical-app`)            |
| `host`           | Ingress host (`app.electrical.local`)                            |
| `tlsSecretName`  | TLS Secret for the ingress; leave empty to serve plain HTTP      |
| `viteApiUrl`     | Passed to the container as `VITE_API_URL`                        |
| `hostPath`       | Codebase location mounted at `/var/www/app`                      |
| `sharedHostPath` | Repo `shared/` directory, mounted read-only at `/var/www/shared` |
| `playwright.*`   | E2E runner Deployment `electrical-e2e` (see "E2E tests")         |

`values.yaml` is git-ignored and not committed.

## Shared fixtures

The repo's `shared/` directory (e.g. `shared/fixtures/short-circuit-cases.json`) is mounted read-only in both the
`node` container and the `playwright` container at `/var/www/shared`. The code root is `/var/www/app`, so from the
project root the stable relative path is `../shared`, which is the same layout on the host (`frontend/../shared`).
Check it with:

```shell
kubectl exec deployment/electrical-app -c node -- ls /var/www/shared/fixtures
```

## E2E tests (Playwright)

Browsers do not run in the `node` container. Playwright runs in a separate Deployment `electrical-e2e`
(container `playwright`) from the official image `mcr.microsoft.com/playwright:v1.65.1-noble`, as uid 1000, with the
code mounted from the host. It sleeps and is driven with `kubectl exec`. Tests run against the in-cluster Vite dev
server `http://electrical-app:5173` (env `E2E_BASE_URL`). API calls are mocked with `page.route`.

The image tag must match the `@playwright/test` version in `package.json` (currently `1.65.1`). When you upgrade
Playwright, change both together and the `image` value in `values.yaml` and `values.yaml.dist`, then
`helm upgrade`.

```shell
helm upgrade electrical-app ./kube/chart -f values.yaml                # applies chart changes (electrical-e2e included)
kubectl exec deployment/electrical-app -c node -- npm install          # installs @playwright/test
kubectl exec deployment/electrical-e2e -c playwright -- npx playwright test            # all e2e tests
kubectl exec deployment/electrical-e2e -c playwright -- npx playwright test <path>     # one file
kubectl exec deployment/electrical-e2e -c playwright -- make e2e                       # same as the first command (Makefile target)
kubectl exec deployment/electrical-e2e -c playwright -- npx playwright --version       # check version
```

Test results and reports are written into the repo through the hostPath mount (`test-results/`,
`playwright-report/`).

Security trade-off (dev only): the `code` hostPath is mounted **read-write** in the `playwright` container, because
Playwright writes the git-ignored `test-results/` and `playwright-report/` directories into the repo. This means a
compromised test runner could modify the host checkout. Do not reuse this chart with a read-write code mount outside a
local MicroK8s cluster. The runner otherwise runs with `runAsNonRoot`, uid/gid 1000, `allowPrivilegeEscalation: false`,
`capabilities: drop: [ALL]`, `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`, resource
requests/limits from `playwright.resources` (values) and a 1Gi `/dev/shm` (`sizeLimit`) for Chromium.

To disable the runner, set `playwright.enabled: false` in `values.yaml`.

## Install and upgrade the chart

```shell
helm install electrical-app ./kube/chart -f values.yaml
helm upgrade electrical-app ./kube/chart -f values.yaml   # apply chart changes
helm uninstall electrical-app                              # remove
echo "127.0.0.1 app.electrical.local" | sudo tee -a /etc/hosts > /dev/null
```

Install the backend chart first (see `backend/README.md`), so that the TLS Secret exists.

## Local TLS

The ingress serves HTTPS with the same mkcert wildcard certificate as the backend (`*.electrical.local`), stored
as the TLS Secret `electrical-local-tls` in the `default` namespace. The Secret is created once per cluster
(see `backend/README.md`, section "Local TLS"); this chart only references it. The mkcert root CA is installed
once per machine (`mkcert -install`). Certificate files are never committed.

## Development (application)

Stack: Vue 3, TypeScript (strict), Vite, Pinia, Vue Router, Vitest, ESLint, Prettier. App: <https://app.electrical.local>.
Node and npm are not installed on the host; run everything in the pod. `node_modules` lives in the hostPath mount
(`frontend/node_modules`, git-ignored) and is created by `npm install` in the pod.

```shell
kubectl exec deployment/electrical-app -c node -- npm install
kubectl exec deployment/electrical-app -c node -- make check   # vue-tsc --build, eslint, prettier --check
kubectl exec deployment/electrical-app -c node -- make fix     # eslint --fix, prettier --write
kubectl exec deployment/electrical-app -c node -- make test    # vitest run --passWithNoTests
kubectl exec deployment/electrical-app -c node -- npm run build
```

Run a single test file: `kubectl exec deployment/electrical-app -c node -- npx vitest run <path>`.
Public configuration is read from `.env` (`VITE_API_URL`); the chart value `viteApiUrl` overrides it.

API types are generated from the in-cluster OpenAPI spec into `src/api/schema.d.ts` (re-run after backend contract changes;
pods cannot resolve `*.electrical.local`, so the backend service is used):

```shell
kubectl exec deployment/electrical-app -c node -- npm run api:types
# = openapi-typescript http://electrical-api/api/v1/docs.jsonopenapi -o src/api/schema.d.ts
```

`package.json` has an `overrides` entry because `openapi-typescript` declares a peer of TypeScript 5 while the project uses 6.
