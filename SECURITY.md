# Security and privacy

## Implemented protections

- User identity comes from verified JWTs, never from request `userId`.
- Access tokens expire after 30 minutes. `POST /logout` revokes the current token in persistent Redis. Redis failure does not bypass revocation.
- Native tokens use Expo SecureStore. Browser tokens stay in memory; reload requires login. Legacy plaintext AsyncStorage tokens are deleted.
- New passwords require 12+ characters and at most 72 UTF-8 bytes (bcrypt's limit). Unknown users also undergo a bcrypt check. JWT placeholder/short secrets prevent startup.
- Shared Redis rate limits cover login, registration, general traffic and expensive forecast/receipt/chat operations. There is no in-memory fail-open fallback in deployment.
- Both expense entry paths use the same server validation: valid date, finite positive amount, at most two decimal places, supported category/subcategory. Planning validates every entry before writing.
- Database units of work always close resources and roll back failed writes. SQL remains parameterized; profile responses exclude password hashes, recovery codes, phone numbers and birth dates.
- Uploaded requests are bounded to 8 MiB; JPEG/PNG/PDF MIME types must match file signatures. This is format screening, not malware scanning. Document AI calls have a deadline and no automatic retries.
- The assistant has **no database tool**. Flask supplies current-month totals and at most 50 recent rows from each transaction table for the authenticated user. Webhook authentication, timeouts, bounded responses and redirect rejection protect the service boundary. Prompt injection can still affect generated answers, but cannot grant the model database access.
- API errors do not return internal exception details. Database/provider errors log exception types without raw personal field values. API responses use `Cache-Control: no-store`.
- Compose exposes only the web port on loopback. MySQL/Redis are private, the API uses a restricted database account, and the API/web runtime filesystems are read-only. API and web run without root privileges.
- The Docker build context is an allowlist of source files: secrets, repository history, uploads and local environments are excluded.

## Deployment boundaries

The default stack is **local HTTP**, not an Internet-ready hosted service. Use HTTPS, secret management, tested backups, monitoring and a properly configured reverse proxy for public deployment. Never expose the API directly with `TRUST_PROXY=true`; the supplied Nginx proxy overwrites forwarding headers. A different proxy chain needs a corresponding trusted-hop configuration.

Browser memory storage limits token persistence, but does not eliminate XSS risk. Refresh tokens/rotation, account-wide session management, MFA and a recovery flow are not implemented. The legacy secure code remains hashed but is not a substitute for those features.

Keep Redis persistent: losing the revocation store could make an otherwise unexpired revoked token valid again. Do not share the Redis service with untrusted applications. Rotate the JWT signing key if revocation data is lost in an incident.

Google Document AI and n8n/Groq are optional external data processors. Review access, retention, region and user consent before sending real financial data. Do not re-add model-controlled SQL. n8n execution-data saving is disabled in the example; administrators can change that, so review actual deployment settings.

## Dependency review — 2026-10-11

Compatible npm updates removed the critical `shell-quote` advisory and other available fixes. PostCSS is overridden to a patched compatible 8.5 release. The Expo 54-compatible worklets version is explicitly selected. Python runtime requirements passed `pip-audit` at the time of this change.

**The npm audit is not clean.** The Expo/React Native build dependency graph still reports high and moderate advisories, including:

- [braces recursion/denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): no published patched release at review time; used by build-time file matching.
- [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv): no published patched release at review time; used by Expo development/signing tooling.
- [image-size parser denial of service](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq): a patched 2.x release exists, but overriding the 1.x API broke the Expo 54 asset build in testing. Retained 1.x until a coordinated SDK/toolchain upgrade.
- Transitive `sprintf-js` and `uuid` advisories remain in the build tooling.

The deployed web image serves static assets and contains no Node runtime or npm tree. Receipt uploads go to Python/Document AI, not these Node parsers. This reduces runtime exposure; it does **not** mean the dependencies are fixed. Build only trusted source/assets, do not expose Metro/Expo development servers publicly, and review signing/OTA tooling before use. An SDK upgrade needs native compatibility tests, not `npm audit fix --force` (the audit suggested an incompatible Expo downgrade).

CI retains the existing critical npm gate and prints the full audit report; Python dependency auditing and a real Compose smoke test were added. Resolve remaining advisories before claiming a clean security audit. Dependency state changes over time; rerun audits regularly.

## Secret handling and reporting

Never commit environment files, service-account JSON, access tokens, real receipts, financial exports or database dumps. `.env.example` files are placeholders only. `scripts/setup.mjs` generates `.env.docker` locally without overwriting it; Windows permissions are inherited from the containing directory and must be restricted.

If a credential was ever committed or published, ignoring/removing it from the latest tree is insufficient: rotate it at its issuer. This change does not rewrite repository history or rotate external credentials.

Do not post credentials, personal records or exploit details in public issues. Use the owner's private GitHub security/contact channel.

## Magyar összefoglaló

A javítás egységes szerveroldali validációt, pontos decimális pénzkezelést, hibánál rollbacket és kapcsolatlezárást, rövid életű és visszavonható JWT-t, SecureStore/memóriabeli tokentárolást, megosztott rate limitet és korlátozott fájlfeltöltést vezet be. Az asszisztens nem kap adatbázis-eszközt, csak a bejelentkezett felhasználó korlátozott pénzügyi adatait. A webhook külön titokkal hitelesített.

A konténeres indítás helyi használatra készült. Nyilvános telepítéshez HTTPS, titokkezelés, mentések és felügyelet kell. A Redis-adatok elvesztése a még le nem járt tokenek visszavonását is elveszíti; ilyen incidensnél JWT-kulcsrotáció szükséges.

Az npm-vizsgálatban **maradtak magas és közepes besorolású upstream buildfüggőség-hibák**. Ezeket nem tüntettük el kivételekkel vagy nem kompatibilis csomagcserével. A kritikus shell-quote hiba és a kompatibilisen javítható függőségek frissültek; a fennmaradó tételeket a fenti hivatkozások és korlátok írják le. A webes futtatókonténerben nincs Node/Expo fejlesztőszerver. Ettől a buildkörnyezet továbbra is ellenőrzendő, és a projekt nem tekinthető teljesen auditáltnak.

A korábban kiszivárgott kulcsokat a szolgáltatónál kell visszavonni; ez a módosítás nem írja át a Git-előzményt és nem forgat külső credentialöket. Telepítés: [magyar konténeres útmutató](docs/CONTAINERS.hu.md).
