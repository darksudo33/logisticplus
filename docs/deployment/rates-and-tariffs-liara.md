# Rates and tariffs Liara configuration

Currency sync uses the server-only `BRSAPI_KEY` and calls:

`https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=<BRSAPI_KEY>&section=currency`

The BRSAPI Pro guide supports `section=gold`, `section=currency`, and `section=cryptocurrency`. Logistic Plus only needs currency rates for `/rates`, so the app intentionally requests `section=currency`.

Do not expose the key in frontend code or logs. If the key is missing, expired, or not allowed to access Pro SANA/NIMA data, the app still starts and the `/rates` page keeps showing manual or last saved rates.

Add the key in Liara as an environment variable for the `logisticplus` app:

```bash
liara env set BRSAPI_KEY=YOUR_KEY BRSAPI_SYNC_ENABLED=true BRSAPI_SYNC_INTERVAL_MINUTES=15 BRSAPI_AUTO_PUBLISH=true TARIFF_IMPORT_MAX_FILE_MB=25 --app logisticplus
```

For local development, put the same variables in your uncommitted `.env` file, or export them in your shell before starting the server:

```bash
BRSAPI_KEY=YOUR_KEY
BRSAPI_SYNC_ENABLED=true
BRSAPI_SYNC_INTERVAL_MINUTES=15
BRSAPI_AUTO_PUBLISH=true
```

If no BRSAPI key is available yet, deploy the code with `BRSAPI_SYNC_ENABLED=false` or leave `BRSAPI_KEY` blank. Admins will see a Persian warning on `/rates`; normal users will only see available rates and compact unavailable labels.
