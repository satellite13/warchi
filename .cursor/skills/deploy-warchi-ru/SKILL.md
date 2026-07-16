---
name: deploy-warchi-ru
description: Выполняет безопасный production-деплой wArchi на закреплённый VPS. Используется только при явном запросе production-контура wArchi или warchi.ru, например «деплой на warchi.ru», «production deploy wArchi», «обновить prod wArchi» или «выложить wArchi».
---

# Deploy wArchi.ru

Используй skill только для явно названного production-контура wArchi. Фразы `production deploy`
или `обновить prod` без контекста wArchi не являются trigger.

Перед действиями прочитай [infra/vps/README.md](../../../infra/vps/README.md). Source of truth:
`infra/vps/deploy.sh` для исполнения и README для prerequisites, проверки и восстановления.

## Закреплённая архитектура и цель

- `https://warchi.ru` — публичный `warchi-site`.
- `https://app.warchi.ru` — приложение `warchi`; `/api` и `/ws` проксируют внутренний
  `arepos-server` с того же origin.
- `arepos-server` доступен только внутри кластера.
- Единственная production-цель: `root@138.124.14.246`, k3d-кластер `warchi`, namespace `arch`.
- Допустим только SSH fingerprint
  `SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA`.
- Никогда не используй OrbStack, Yandex Cloud/YC или другие kube-контексты для этого production.
- Papirus отдельно не разворачивается: он входит в release приложения как npm-зависимость.

## Workflow

Оркестратор валидирует clean repositories, exact release tags и согласованность версий. Не
дублируй и не угадывай версии из skill: используй defaults и разрешённые overrides самого
`infra/vps/deploy.sh`.

Сохраняй порядок фаз: release/tag validation → DNS и certificate prerequisites → bundle test и
dry-run → SSH preflight → backup → `arepos-server` → app → site → full scripted verify → manual
SSO/CSRF smoke.

Remote-фазы выполняет только `infra/vps/deploy.sh`. Не импровизируй ручные Helm/kubectl-команды,
не запускай части bundle и не обходи safety, exact-tag, DNS/CNAME, certificate, backup или
verification guards. Скрипт сам выполняет обязательный backup и guarded rollback.

## Безопасный запуск

```bash
bash infra/vps/tests/verify-bundle.sh
DRY_RUN=1 infra/vps/deploy.sh
infra/vps/deploy.sh
```

Реальный последний запуск требует явного запроса пользователя на production-деплой wArchi. Не
передавай секреты в аргументах, командах, логах или ответах. Не читай и не печатай `secrets.env`.
Не включай shell tracing. Ротация credentials отложена; не меняй credentials или Kubernetes
Secrets без отдельного явного одобрения.

`REUSE_EXISTING_IMAGES=1 infra/vps/deploy.sh` допустим только для emergency recovery по README и
только если оркестратор подтверждает digests. Режим не отменяет остальные guards.

## Условия завершения

Успех можно заявить только после успешных bundle test, dry-run, production script со всем scripted
verify и ручного SSO/CSRF smoke по README.

При ошибке остановись и не продолжай молча:

- если упал local preflight, сообщи локальную причину и не инициируй дополнительный SSH;
- remote backup, image/digest и Helm revision/status сообщай только для достигнутых этапов и только
  когда эти данные уже доступны;
- состояние guarded rollback сообщай только если cutover начался.

Rollback выполняй только по README. Никогда автоматически не восстанавливай PostgreSQL или MinIO.
