# Telepítési útmutató

[English version](SETUP.md) · [Vissza a README-hez](../README.hu.md)

## 1. Előfeltételek

- Node.js 20.19.4+ vagy 22.13+ és npm
- Python 3.11+
- MySQL 8+
- Expo Go, Android-emulátor vagy iOS Simulator
- opcionálisan Google Cloud Document AI Invoice Parser
- opcionálisan n8n és Groq-fiók

## 2. Mobilkliens

```bash
git clone https://github.com/AntiBrs/myEnvelope.git
cd myEnvelope
npm install
cp .env.example .env
```

Állítsd be az API címét:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
```

Címválasztás:

- web vagy iOS Simulator: általában `localhost`;
- Android-emulátor: szükség esetén `http://10.0.2.2:5000`;
- fizikai telefon: a fejlesztői számítógép helyi hálózati címe, közös hálózaton.

Az `EXPO_PUBLIC_*` értékek beépülnek a kliensbe, ezért nem lehetnek titkok.

Indítás:

```bash
npm start
```

## 3. MySQL

Séma létrehozása:

```bash
mysql -u root -p < backend/schema.sql
```

Hozz létre külön alkalmazásfelhasználót minimális jogosultsággal:

```sql
CREATE USER 'myenvelope_app'@'localhost' IDENTIFIED BY 'csereld-le-ezt-a-jelszot';
GRANT SELECT, INSERT, UPDATE, DELETE ON myenvelope.* TO 'myenvelope_app'@'localhost';
FLUSH PRIVILEGES;
```

A Flask ne a MySQL root fiókot használja.

## 4. Flask backend

```bash
python -m venv .venv
source .venv/bin/activate
```

Windows PowerShellben:

```powershell
.venv\Scripts\Activate.ps1
```

```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Kötelező értékek:

```dotenv
JWT_SECRET_KEY=<hosszu-veletlen-ertek>
DB_PASSWORD=<alkalmazasfelhasznalo-jelszava>
```

Biztonságos JWT-titok generálása:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

A repó gyökeréből indítsd:

```bash
python -m backend.app
```

Ellenőrzés:

```bash
curl http://localhost:5000/health
```

## 5. Google Document AI – opcionális

1. Hozz létre vagy válassz Google Cloud projektet.
2. Engedélyezd a Document AI szolgáltatást.
3. Hozz létre Invoice Parser processzort a megfelelő régióban.
4. Készíts minimális jogosultságú service accountot.
5. A JSON-kulcsot a repón kívül tárold.
6. Állítsd be a `backend/.env` fájlt:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/abszolut/utvonal/a/repon-kivul/service-account.json
DOCUMENTAI_PROJECT_ID=projekt-azonosito
DOCUMENTAI_LOCATION=eu
DOCUMENTAI_PROCESSOR_ID=processor-azonosito
```

A kulcsfájlt soha ne commitold. Telepített környezetben inkább workload identity vagy kezelt secret store ajánlott.

## 6. n8n és Groq – opcionális

1. Importáld az `n8n/workflow.example.json` fájlt.
2. Az n8n-ben hozz létre Groq credentialt.
3. Hozz létre külön read-only MySQL-fiókot.
4. Rendeld hozzá a credentialöket a node-okhoz.
5. Generálj új webhook útvonalat.
6. A backendben csak az URL-t állítsd be:

```dotenv
N8N_WEBHOOK_URL=http://localhost:5678/webhook/sajat-webhook-utvonal
```

Az n8n credential store tartalmát ne exportáld. Éles használat előtt kell táblaengedélyezőlista, sorlimit, timeout és auditnapló.

## 7. Tesztek

```bash
pytest
```

A jelenlegi egységtesztek nem igényelnek adatbázist vagy felhős credentialt, mert tiszta predikciós és feldolgozófüggvényeket ellenőriznek.

## 8. Gyakori problémák

### A telefon nem éri el a Flask szervert

- legyenek azonos hálózaton;
- a gyökér `.env` fájlban a számítógép LAN-címét használd;
- engedélyezd a fejlesztői portot a tűzfalon;
- `.env` módosítása után indítsd újra az Expót.

### `401 Unauthorized`

- jelentkezz be újra;
- ellenőrizd, hogy a backend JWT-titka nem változott meg egy régi token mellett;
- a fejléc formátuma `Bearer <token>` legyen.

### Adatbázis-kapcsolati hiba

- ellenőrizd a hostot, portot, adatbázisnevet, felhasználót és jelszót;
- futtasd a `backend/schema.sql` fájlt;
- ellenőrizd a jogosultságokat és a táblanév kis/nagybetűzését Linuxon.

### Nyugtafeldolgozási hiba

- ellenőrizd a processzor régióját;
- ellenőrizd a service account jogosultságát;
- a `GOOGLE_APPLICATION_CREDENTIALS` létező, repón kívüli fájlra mutasson;
- használj támogatott kép- vagy PDF-formátumot.

### Az asszisztens `503` választ ad

Állítsd be az `N8N_WEBHOOK_URL` értékét. A `502` azt jelenti, hogy a konfigurált workflow nem volt elérhető vagy timeout történt.
