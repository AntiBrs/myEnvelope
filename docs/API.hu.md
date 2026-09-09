# REST API referencia

[English version](API.md) · [Vissza a README-hez](../README.hu.md)

Helyi alapcím: `http://localhost:5000`.

## Konvenciók

- A kérések és válaszok JSON-formátumúak, kivéve a fájlfeltöltést.
- A védett végpontokhoz `Authorization: Bearer <JWT>` fejléc szükséges.
- A backend a felhasználót az ellenőrzött JWT-ből azonosítja, nem a kliens által küldött `userId` alapján.
- A dátum formátuma `YYYY-MM-DD`, a predikció válaszában a hónap `YYYY-MM`.
- A pénzösszegek numerikusak; a jelenlegi felület RON pénznemet használ.
- Gyakori státuszok: `200` siker, `400` hibás kérés, `401` hibás/hiányzó token, `404` nincs erőforrás, `500` szerverhiba, `502/503` külső integráció nem elérhető.

## Hitelesítés

### `POST /user`

Regisztráció. A backend bcrypt segítségével hash-eli a jelszót.

```json
{
  "isAdult": true,
  "secureCode": "pelda-helyreallitasi-kod",
  "userName": "demo-user",
  "password": "eros-jelszo",
  "name": "Demo User",
  "telephoneNumber": "+00 000 000 000",
  "dateOfBirth": "2000-01-01"
}
```

Válasz:

```json
{
  "message": "User created",
  "userId": 1
}
```

### `POST /login`

```json
{
  "userName": "demo-user",
  "password": "eros-jelszo"
}
```

A válasz JWT-t ad. A további kérések fejléce:

```http
Authorization: Bearer <jwt-access-token>
```

## Tranzakciók

### `POST /expenses`

Kiadás mentése a JWT-vel azonosított felhasználóhoz:

```json
{
  "date": "2026-09-01",
  "amount": 75.5,
  "category": "Food",
  "subcategory": "Groceries"
}
```

### `POST /earnings`

Ugyanez a szerkezet bevételhez:

```json
{
  "date": "2026-09-01",
  "amount": 3500,
  "category": "Salary",
  "subcategory": "Regular"
}
```

### `GET /categories`

Visszaadja a frontend által használt kiadási és bevételi kategóriafát.

## Nyugtafeldolgozás

### `POST /invoices/analyze`

`multipart/form-data` kérés, az állománymező neve `invoice`.

```bash
curl -X POST http://localhost:5000/invoices/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "invoice=@sample-receipt.jpg"
```

A válasz dátumot, kereskedőt, összeget és kategóriajavaslatot tartalmaz. Ez még nem automatikus mentés: a felhasználó ellenőrizheti és módosíthatja.

### `POST /expenses/manual`

A jóváhagyott, nyugtából származó kiadás mentése.

## Összegzés és statisztika

### `GET /user/summary`

A főoldalhoz szükséges minimális profiladatokat, valamint a bevétel, kiadás és egyenleg értékét adja vissza. Jelszóhash, helyreállítási kód, telefonszám és születési dátum nem hagyja el a backend határát.

```json
{
  "user": {
    "userId": 1,
    "userName": "demo-user",
    "name": "Demo User"
  },
  "totalEarnings": 3500,
  "totalExpenses": 975.5,
  "balance": 2524.5
}
```

### `GET /user/statistics/:timeRange`

Az időtartomány szerinti összegeket, kategória- és alkategória-bontást adja vissza a grafikonokhoz. A frontend például a `this_month` értéket használja.

## Tervezés

### `POST /planning`

Havi terv felülírása/upsertje:

```json
{
  "year": 2026,
  "month": 9,
  "plan": {
    "expenses": {
      "Food": 900,
      "Transportation": 300
    },
    "earnings": {
      "Salary": 3500
    }
  }
}
```

### `GET /planning?year=2026&month=9`

Visszaadja a kiválasztott havi tervet és az adott év tervezett kiadásainak összegét.

### `GET /user/planning/compare?year=2026&month=9`

Kategóriánként adja vissza a tervezett, tényleges, fennmaradó és százalékos értéket.

## Predikció

### `GET /user/predictions`

Opcionális paraméterek:

- `startDate=YYYY-MM-DD`, alapértéke az aktuális hónap első napja;
- `months=1..24`, alapértéke 12.

A backend összesített és kategóriánkénti becslést készít kiadásokra és bevételekre. A havi adatmennyiség alapján átlagot, szezonális naiv módszert vagy SARIMA-modellt választ.

```json
{
  "startDate": "2026-09-01",
  "months": 12,
  "expensePredictions": [
    {
      "month": "2026-09",
      "predictedAmount": 920.25,
      "category": "total"
    }
  ],
  "earningPredictions": [],
  "expensePredictionsByCategory": {},
  "earningPredictionsByCategory": {}
}
```

Viselkedés:

- üres előzmény: üres predikció;
- 1–11 hónap: havi átlag;
- 12–23 hónap: szezonális naiv;
- legalább 24 hónap: SARIMA-kísérlet;
- SARIMA-hiba: szezonális naiv fallback;
- negatív becslés: nulla.

## Státi asszisztens

### `POST /chat`

```json
{
  "question": "Mennyit költöttem élelmiszerre ebben a hónapban?"
}
```

A Flask a kérdést és a JWT-ből származó felhasználóazonosítót küldi az n8n webhooknak. Konfiguráció nélkül `503`, elérhetetlen downstream szolgáltatásnál `502` választ ad.

A példa workflow az `n8n/workflow.example.json` fájlban található. A hitelesítő adatokat kizárólag az n8n-ben kell beállítani, külön read-only MySQL-fiókkal.

## Állapotellenőrzés

### `GET /health`

```json
{
  "status": "ok",
  "service": "myEnvelope API"
}
```

Szándékosan nem ad vissza adatbázis- vagy konfigurációs részleteket.
