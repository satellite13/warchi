# CI/CD Pipeline

## Triggers

Пайплайн запускается вручную (manual) с параметрами:

| Параметр | Значение по умолчанию | Описание |
|----------|-----------------------|----------|
| `BRANCH_NAME` | `develop` | Ветка для сборки (для deploy из ветки) |
| `TAG_NAME` | ``(пусто)`` | Git-тег для prod-релиза (например `0.0.22`) |
| `ENV` | `dev` | Окружение для deploy из `develop` (`dev` или `stage`) |

Правило приоритета: **если заполнен `TAG_NAME` → prod-релиз, иначе → ветка**.

## Сценарии

### 1. TAG release (prod)

🔹 `TAG_NAME` заполнен (например `0.0.22`)

```
Git ref:        refs/tags/0.0.22
Image:          warchi--frontend:0.0.22  (+ :latest)
Image tag TTL:  365 дней
Cluster:        os1c-polaris-prod-01
Namespace:      warchi-prod
Vault path:     prod
Ingress:        warchi.lmru.tech
```

Docker image-push ✅ Deploy ✅

---

### 2. `master` → preprod

🔹 `BRANCH_NAME = master`

```
Git ref:        master
Image:          warchi--frontend:<uuid>
Image tag TTL:  180 дней
Cluster:        os1c-polaris-stage-01
Namespace:      warchi-preprod
Vault path:     preprod
Ingress:        warchi-preprod-os1c-polaris-stage-01.apps.lmru.tech
```

Docker image-push ✅ Deploy ✅

---

### 3. `develop` → dev/stage

🔹 `BRANCH_NAME = develop`, `ENV` = `dev` или `stage`

| Параметр | dev | stage |
|----------|-----|-------|
| Image | `warchi--frontend-develop:<uuid>` | `warchi--frontend-develop:<uuid>` |
| Image tag TTL | 7 дней | 7 дней |
| Cluster | os1c-polaris-stage-01 | os1c-polaris-stage-01 |
| Namespace | warchi-dev | warchi-stage |
| Vault path | test | test |
| Ingress | `warchi-dev-os1c-polaris-stage-01.apps.lmru.tech` | `warchi-stage-os1c-polaris-stage-01.apps.lmru.tech` |

Docker image-push ✅ Deploy ✅

---

### 4. Произвольная ветка (без deploy)

🔹 `BRANCH_NAME` — любая ветка ≠ `master`, ≠ `develop`

```
Git ref:        <ветка>
Image tag TTL:  не применяется
```

Docker image-push ❌ Deploy ❌ — только CI-проверки (lint, typecheck, test, sonar).

---

## Общая схема маршрутизации

```
TAG_NAME filled ──────→  warchi.lmru.tech                   (prod)

BRANCH_NAME = master ──→  warchi-preprod-<cluster>.apps…    (preprod)

BRANCH_NAME=develop ──→  warchi-{dev,stage}-<cluster>.apps… (dev/stage)
                ENV ↗     ↖

BRANCH_NAME=other ──────→   CI only, без deploy
```

## Stages пайплайна

| # | Stage | Блокирующий | Notes |
|---|-------|-------------|-------|
| 1 | Checkout | да | checkout + определение env-переменных |
| 2 | Preparation | да | `npm ci` |
| 3 | Lint | нет | `npm run lint` + prettier check |
| 4 | Type-check | нет | `vue-tsc --noEmit` |
| 5 | Unit-test | нет | Vitest |
| 6 | Build | да | `npm run build` |
| 7 | E2E-test | нет | TODO (отключено, `when: false`) |
| 8 | SonarQube | да | sonar-scanner + quality gate |
| 9 | Scan | нет | TODO (заглушка) |
| 10 | Docker | да | build + push в registry |
| 11 | Deploy | да | helm upgrade via `img-k8s-deployer` |

## Helm deployment

Deploy выполняется из `img-k8s-deployer` контейнера:
1. `get-kubeconfig-basic` — pull kubeconfig
2. `envsubst` values-файла → `values-expanded.yaml` (подставляются `INRESS_HOST`, `DEPLOYMENT_ENV` и др.)
3. `helm3 upgrade --install` с `values-expanded.yaml` + `--set` image repo/tag/namespace

Values-файлы по окружению:

| Окружение | File |
|-----------|------|
| prod | `charts/warchi/values-prod.yaml` |
| preprod | `charts/warchi/values-preprod.yaml` |
| dev | `charts/warchi/values-dev.yaml` |
| stage | `charts/warchi/values-stage.yaml` |
