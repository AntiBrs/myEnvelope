# Indítás Dockerrel

A teljes alapalkalmazás böngészőből használható. A Compose külön konténerben indítja a webfelületet (Nginx), a Flask API-t (Gunicorn), a MySQL-adatbázist és a Redist. A telefonos alkalmazás továbbra is Expo Go-val vagy natív buildként fut; a konténer nem helyettesít Android/iOS-emulátort.

## Első indítás

Szükséges: futó Docker Desktop Linux containers módban, Docker Compose v2 és Node.js 22. A repó gyökerében:

```powershell
node scripts/setup.mjs
docker compose --env-file .env.docker up --build -d --wait
```

Nyisd meg: **http://localhost:8080**. Hozz létre saját fiókot; nincs beépített adminfelhasználó vagy alapjelszó. Az első build letölti a szükséges csomagokat, ezért több percig tarthat.

A setup helyben generálja a JWT-titkot, az adatbázis-jelszavakat és az opcionális n8n titkait a figyelmen kívül hagyott `.env.docker` fájlba. Meglévő fájlt nem ír felül. A titkok nem kerülnek a böngészős buildbe vagy a Docker build kontextusába. Windows alatt a fájl a mappa hozzáférési jogosultságait örökli; csak a saját felhasználód és a rendszergazdák férjenek hozzá.

Ha a 8080-as port foglalt, módosítsd a `WEB_PORT` értékét a `.env.docker` fájlban. A webfelület alapértelmezés szerint csak a saját gépről érhető el; az adatbázisnak, a Redisnek és az API-nak nincs publikált portja.

## Használat és leállítás

```powershell
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=80 api
docker compose --env-file .env.docker down
```

A `down` megtartja az adatokat a névvel ellátott Docker-volume-okban. A `down -v` ezeket törölné: ne használd mentés nélkül. Újraindításkor ugyanazt a `.env.docker` fájlt használd. Az adatbázis-jelszó átírása önmagában nem módosítja egy már inicializált MySQL felhasználójának jelszavát.

Frissítés: `docker compose --env-file .env.docker up --build -d --wait`. Az inicializáló SQL csak üres MySQL-volume esetén fut. Meglévő adatbázis esetén előbb készíts mentést; a séma változásait külön migrációként kell alkalmazni. A most hozzáadott pozitívösszeg- és tervezési CHECK feltételek nem kerülnek automatikusan régi táblákra. Az API régi adatbázis mellett is ellenőrzi az új mentéseket.

## Webes előnézet és görgetés

A képernyők az ablak magasságához igazodnak; a hosszabb tartalom a képernyőn belül görgethető egérgörgővel, érintőpaddal vagy érintéssel. A navigációs fejléc helyben marad. A bejelentkezési és regisztrációs űrlap kisebb ablakban is végiggörgethető.

Ha frissítés után a régi felület marad látható:

```powershell
docker compose --env-file .env.docker up --build -d --wait web
```

Ezután töltsd újra a böngészőlapot vagy a beágyazott előnézetet. Az újratöltés új bejelentkezést igényel; az elmentett adatok megmaradnak. Nem szükséges az adatbázis-volume törlése.

Fejlesztői háttér és ismételhető ellenőrzés: [webes görgetés](WEB_SCROLL.md).

## Munkamenet és korlátok

- A token 30 perc után lejár. A kijelentkezés szerveroldalon is visszavonja.
- Böngészőben a token csak memóriában él, ezért az oldal újratöltése után újra be kell lépni. Mobilon SecureStore tárolja; a régi AsyncStorage-token törlődik.
- A regisztráció legfeljebb 5 kérés/óra/IP, a belépés 10/perc/IP és 20/15 perc/normalizált felhasználónév. A 429 válasz jelzi a várakozást.
- A nyugtaelemzés, az asszisztens és az előrejelzés felhasználónként 5 kérés/perc. A proxy mögötti IP-alapú korlát több, azonos hálózatban lévő embert is érinthet.
- A helyi HTTP-indítás nem internetes éles telepítés. Nyilvános használathoz HTTPS, megfelelő proxykonfiguráció, titokkezelés, mentések és felügyelet szükséges. Az API-t ne tedd közvetlenül elérhetővé, ha `TRUST_PROXY=true`.

## Opcionális asszisztens

```powershell
docker compose --env-file .env.docker --profile assistant up -d
```

1. Nyisd meg a http://localhost:5678 felületet, és állítsd be az n8n tulajdonosi fiókját.
2. Importáld az `n8n/workflow.example.json` fájlt, válassz saját webhookútvonalat.
3. Hozz létre **Header Auth** credentialt: a fejléc neve `X-MyEnvelope-Secret`, értéke a helyi `.env.docker` `N8N_WEBHOOK_SECRET` értéke. Rendeld a webhookhoz.
4. Állítsd be a saját Groq credentialt és az elérhető modellt, majd publikáld/aktiváld a workflow-t.
5. A `.env.docker` fájlban állítsd be: `N8N_WEBHOOK_URL=http://n8n:5678/webhook/SAJAT-UTVONAL`, majd indítsd újra az API-t a fenti `up -d` paranccsal.

Az új workflow nem kap MySQL-credentialt és nem kérdezhet le tetszőleges táblákat. Csak az API által, a bejelentkezett felhasználóhoz lekért aktuális havi összesítést és legfeljebb 50–50 legutóbbi bevételt/kiadást látja. Ezért nem válaszolhat megbízhatóan a teljes korábbi történetre vonatkozó minden kérdésre. A pénzügyi adatok a konfigurált n8n/Groq szolgáltatáshoz kerülnek. Az n8n végrehajtásadat-mentése alapból ki van kapcsolva. Felhős n8n esetén HTTPS URL-t használj.

## Opcionális Document AI

A Google-kulcsot a repón kívül tárold. A `.env.docker` fájlban add meg a `DOCUMENTAI_PROJECT_ID`, `DOCUMENTAI_PROCESSOR_ID` és `DOCUMENTAI_CREDENTIALS_FILE` értékeket. Utóbbi abszolút útvonal, például `C:/private/documentai.json`.

```powershell
docker compose --env-file .env.docker -f compose.yaml -f compose.documentai.yaml up --build -d
```

A kulcs csak olvasható fájlként kerül a konténerbe. A feldolgozó legfeljebb 8 MiB-os teljes feltöltési kérést, JPEG/PNG/PDF fájlt fogad; a MIME-típus és a fájl kezdőazonosítója egyezzen. A felismert mezők továbbra is ellenőrzendő javaslatok. Saját felhős credential nélkül az elemzés 503-as választ ad, a többi funkció működik.

## Ellenőrzés

```powershell
python scripts/smoke.py
```

Ez két szintetikus tesztfiókot és néhány teszttranzakciót hoz létre a futó, helyi stackben. Friss tesztkörnyezethez készült, ne futtasd valódi adatokkal használt telepítésen. Ellenőrzi a regisztrációt, a pénzadatok validációját, a felhasználók elkülönítését, a statisztikát, a tervezést, az előrejelzést és a token visszavonását. Az élő Google/Groq szolgáltatások ellenőrzéséhez saját credential szükséges.
