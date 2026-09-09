# Setup guide

[Magyar változat](SETUP.hu.md) · [Back to README](../README.md)

## 1. Requirements

- Node.js 20.19.4+ or 22.13+ and npm
- Python 3.11 or newer
- MySQL 8 or newer
- Expo Go, Android Studio emulator, or iOS Simulator
- optional: Google Cloud project with a Document AI Invoice Parser
- optional: n8n and a Groq account for the assistant

## 2. Mobile configuration

```bash
git clone https://github.com/AntiBrs/myEnvelope.git
cd myEnvelope
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
```

Address selection:

- web or iOS Simulator: `localhost` is normally sufficient;
- Android emulator: use `http://10.0.2.2:5000` when required by the emulator network;
- physical device: use the development machine's LAN address and ensure both devices share a network.

`EXPO_PUBLIC_*` values are public client configuration. Never put API keys or passwords in them.

Start Expo:

```bash
npm start
```

## 3. MySQL

Create the schema:

```bash
mysql -u root -p < backend/schema.sql
```

Create an application user with only the permissions the Flask API needs. Keep the root account out of the application configuration.

```sql
CREATE USER 'myenvelope_app'@'localhost' IDENTIFIED BY 'replace-this-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON myenvelope.* TO 'myenvelope_app'@'localhost';
FLUSH PRIVILEGES;
```

## 4. Flask backend

Create an isolated environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies and configure the service:

```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Required values:

```dotenv
JWT_SECRET_KEY=<long-random-value>
DB_PASSWORD=<application-user-password>
```

Recommended secret generation:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run from the repository root so package imports resolve consistently:

```bash
python -m backend.app
```

Check the service:

```bash
curl http://localhost:5000/health
```

## 5. Google Document AI (optional)

1. Create or select a Google Cloud project.
2. Enable Document AI.
3. Create an Invoice Parser processor in the region you plan to use.
4. Create a least-privilege service account allowed to invoke that processor.
5. Download its JSON key outside the repository directory.
6. Configure `backend/.env`:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/outside/the/repository/service-account.json
DOCUMENTAI_PROJECT_ID=your-project-id
DOCUMENTAI_LOCATION=eu
DOCUMENTAI_PROCESSOR_ID=your-processor-id
```

The key file must never be committed. Prefer workload identity or a managed secret mechanism for deployed environments.

Without these values, receipt analysis returns a controlled server error; other features can still run.

## 6. n8n and Groq assistant (optional)

1. Import `n8n/workflow.example.json` into n8n.
2. Create a Groq credential inside n8n.
3. Create a dedicated read-only MySQL account.
4. Assign the credentials to the imported nodes.
5. Set a new webhook path inside n8n.
6. Configure only the resulting URL in `backend/.env`:

```dotenv
N8N_WEBHOOK_URL=http://localhost:5678/webhook/your-generated-path
```

Do not export credentials from n8n. Before production use, enforce table allowlisting, row limits, timeouts, and audit logging.

## 7. Tests

```bash
pytest
```

The current tests require no database or cloud credentials because they target pure forecast and parsing logic.

## 8. Common problems

### Phone cannot reach Flask

- verify that the phone and computer use the same network;
- set the computer's LAN address in the root `.env`;
- allow inbound TCP traffic to the development port in the local firewall;
- restart Expo after changing `.env`.

### `401 Unauthorized`

- log in again and confirm that AsyncStorage contains the new access token;
- verify that `JWT_SECRET_KEY` did not change while the client kept an older token;
- check that the header format is exactly `Bearer <token>`.

### Database connection failure

- confirm host, port, database name, user, and password;
- run `backend/schema.sql`;
- verify the application user's grants;
- avoid using different table-name casing on Windows and Linux.

### Receipt integration failure

- verify the processor region and endpoint;
- check service-account permissions;
- confirm that `GOOGLE_APPLICATION_CREDENTIALS` points to a readable file outside the repository;
- use a supported image/PDF MIME type.

### Assistant returns `503`

Set `N8N_WEBHOOK_URL`. A `502` means the configured workflow could not be reached or did not respond before the timeout.
