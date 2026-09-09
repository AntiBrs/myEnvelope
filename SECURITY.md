# Security and privacy

## English

myEnvelope is an educational portfolio prototype. Do not use it for real financial data without a security review and deployment hardening.

### Public repository policy

The repository must never contain:

- `.env` files or database passwords;
- JWT secrets, Groq/API keys, webhook secrets, or access tokens;
- Google service-account JSON files;
- private network addresses tied to a contributor's environment;
- real receipts, personal financial exports, database dumps, or user records;
- signing keys, certificates, or mobile provisioning files.

Only `.env.example`, sanitized workflow exports, synthetic examples, and non-sensitive media belong in version control.

### Current protections

- bcrypt password hashing;
- JWT-protected personal-data routes;
- user identity derived from the verified token;
- parameterized SQL in application routes;
- minimal profile projection from `/user/summary`;
- no receipt/entity content in debug logs;
- server-only integration configuration;
- bounded forecast horizon;
- ignored credential, key, upload, database, cache, and build artifacts.
- monthly Dependabot checks and a CI gate for critical npm advisories.

### Required production work

- HTTPS everywhere and a production WSGI server;
- secure mobile token storage, short token lifetime, refresh rotation, logout revocation;
- strict request schemas, rate limiting, CSRF review, and account lockout;
- secret manager and credential rotation;
- MySQL TLS, least privilege, backups, migrations, encryption and audit trails;
- signed/authenticated n8n requests and a private network path;
- technically enforced read-only assistant access, table/column allowlists and row limits;
- prompt-injection testing and prevention of sensitive result exfiltration;
- Document AI retention/privacy review and regional processing;
- dependency scanning, SAST, monitoring, incident response and recovery procedures.

### Reporting

Please do not open a public issue containing a vulnerability, credential, receipt, or personal financial record. Use the repository owner's private GitHub contact/reporting channel instead.

---

## Magyar

A myEnvelope oktatási és portfóliócélú prototípus. Biztonsági felülvizsgálat és telepítési megerősítés nélkül ne használj benne valódi pénzügyi adatokat.

### Publikus repó szabályai

A repóba nem kerülhet:

- `.env` fájl vagy adatbázis-jelszó;
- JWT-titok, API-kulcs, webhooktitok vagy hozzáférési token;
- Google service account JSON;
- a fejlesztő privát hálózatához kötött cím;
- valódi nyugta, pénzügyi export, adatbázismentés vagy felhasználói rekord;
- aláírókulcs, tanúsítvány vagy mobil provisioning fájl.

Csak `.env.example`, megtisztított workflow, szintetikus példa és nem érzékeny média verziókövethető.

### Jelenlegi védelmek

- bcrypt jelszóhash;
- JWT-vel védett személyes végpontok;
- a felhasználóazonosító a hitelesített tokenből származik;
- paraméterezett SQL;
- minimális profilválasz a `/user/summary` végponton;
- a nyugtatartalom nem kerül debug naplóba;
- szerveroldali integrációs konfiguráció;
- korlátozott predikciós időhorizont;
- credential-, kulcs-, adatbázis-, feltöltés-, cache- és buildfájlok kizárása.
- havi Dependabot-ellenőrzés és CI-kapu a kritikus npm sérülékenységekre.

### Éles használat előtt szükséges

- HTTPS és production WSGI szerver;
- secure mobile storage, rövid tokenélet, refresh rotáció és visszavonás;
- szigorú kérésvalidáció, rate limit és account lockout;
- secret manager és kulcsrotáció;
- MySQL TLS, minimális jogosultság, backup, migráció, titkosítás és audit;
- aláírt n8n-kérések és privát hálózati kapcsolat;
- technikailag kikényszerített read-only MI-hozzáférés, allowlist és sorlimit;
- prompt injection és adatkiszivárgás elleni tesztelés;
- Document AI adatmegőrzési és régiós felülvizsgálat;
- függőségellenőrzés, SAST, monitoring és incidenskezelés.

### Hibabejelentés

Sérülékenységet, credentialt, nyugtát vagy pénzügyi adatot ne írj nyilvános issue-ba. Használd a repó tulajdonosának privát GitHub-kapcsolati vagy security reporting csatornáját.
