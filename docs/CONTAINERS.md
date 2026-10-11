# Container setup

[Magyar útmutató](CONTAINERS.hu.md)

Install Docker Desktop (Linux containers), Compose v2 and Node.js 22, then run from the repository root:

```sh
node scripts/setup.mjs
docker compose --env-file .env.docker up --build -d --wait
```

Open **http://localhost:8080** and register. No default account exists. The setup generates local secrets in ignored `.env.docker` without overwriting existing secrets. Keep that file private and retain it across restarts. On Windows, restrict its inherited permissions to your user and administrators.

The stack contains the exported Expo web app served by unprivileged Nginx, a non-root Gunicorn API, MySQL 8.4, and persistent Redis for rate limits and token revocation. Only the web port is published, on loopback. MySQL/Redis use an internal network. The application DB account has only SELECT/INSERT on users and transactions and SELECT/INSERT/UPDATE on planning. Docker build context uses a source allowlist and excludes credentials.

Native Android/iOS applications still run through Expo Go or native builds on devices, not inside this container. For native development, see [SETUP.md](SETUP.md). Production clients require HTTPS except on loopback. The local HTTP stack is not an Internet deployment: configure TLS, backups, secret management, monitoring and a correctly trusted reverse proxy before exposing it.

```sh
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=80 api
docker compose --env-file .env.docker down
```

`down` preserves named volumes. Do not use `down -v` without a backup. Change `WEB_PORT` if 8080 is busy. Update using `up --build -d --wait`. Changing `.env.docker` does not rotate credentials already stored in MySQL. Init SQL runs only against an empty database volume; existing installations require explicit migrations and backups. New CHECK constraints are not automatically added to existing tables, but API validation protects new writes on either schema.

Sessions last 30 minutes. Logout revokes the current token in Redis; keep Redis data durable. Browser tokens live only in memory, so reload requires login. Native tokens use SecureStore; old plaintext sessions are removed. Registration/login and expensive endpoints are rate limited; a 429 includes retry information.

## Web preview and scrolling

Screens are bounded to the viewport, with scrolling inside each screen and a stationary navigation header. The login and registration forms remain scrollable in short windows.

After updating, run `docker compose --env-file .env.docker up --build -d --wait web`, then reload the browser tab or embedded preview. Reloading requires signing in again, but saved data is retained. Do not delete database volumes to fix a stale preview. See [web scroll regression checks](WEB_SCROLL.md) for the cause and verification steps.

## Optional n8n/Groq

Run `docker compose --env-file .env.docker --profile assistant up -d`. Open http://localhost:5678, set up the owner account, and import `n8n/workflow.example.json`. Create Header Auth credentials with header `X-MyEnvelope-Secret`, matching `N8N_WEBHOOK_SECRET` in `.env.docker`, and attach them to the webhook. Configure Groq credentials/model, choose a webhook path, and activate the workflow. Set `N8N_WEBHOOK_URL=http://n8n:5678/webhook/YOUR-PATH` and run `up -d` again. Use HTTPS for external n8n servers.

No database credentials or SQL tools belong in this workflow. Flask sends only current-month totals and up to 50 recent records from each transaction table for the authenticated user. The assistant cannot answer arbitrary historical queries. Financial context leaves Flask for configured n8n/Groq services. Execution-data retention is disabled by default. The n8n UI's insecure-cookie setting is for localhost HTTP only; enable secure cookies with HTTPS in deployed environments.

## Optional Document AI

Keep the Google credential outside this repository. Add `DOCUMENTAI_PROJECT_ID`, `DOCUMENTAI_PROCESSOR_ID` and an absolute `DOCUMENTAI_CREDENTIALS_FILE` path to `.env.docker`, then:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.documentai.yaml up --build -d
```

The credential is mounted read-only, never baked into the image. JPEG, PNG and PDF signatures must match MIME types; total request size is capped at 8 MiB. Cloud calls time out after 30 seconds. Without credentials, receipt analysis returns 503; core budgeting remains available.

## Verification

`python scripts/smoke.py` tests a fresh running local stack using two synthetic accounts and transactions. It checks isolation, validation, statistics, planning, forecasting and logout. Do not run it on a real-data deployment. Unit/security tests run with `pip install -r backend/requirements-dev.txt` then `pytest`; they need no cloud credentials or live database. Cloud integration still requires separate testing with your own credentials.
