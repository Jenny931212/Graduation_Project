# OCR / Translation Backend

This folder contains the OCR / Translation FastAPI backend for prescription image analysis.

## Setup

Install the Python dependencies first:

```bash
pip install -r requirements.txt
```

## Run

Start the FastAPI server from this folder:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Translations are cached in `translation_cache.sqlite3` by default. Set
`TRANSLATION_CACHE_PATH` to a persistent writable path in production so cached
translations survive deployments.

## Frontend Config

In the app's `app.json`, set `extra.prescriptionApiBaseUrl` to this computer's LAN IP address, for example:

```json
{
  "prescriptionApiBaseUrl": "http://your-lan-ip:8000"
}
```
