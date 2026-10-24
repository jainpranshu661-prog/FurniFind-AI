# FurniFind AI

FurniFind AI is a furniture discovery storefront built with React, TypeScript, and Vite, backed by a FastAPI API. It provides a catalog, natural-language product search, comparison, locally persisted favorites, and a Firebase-authenticated seller portal. Catalog prices are in Indian rupees (INR).

The application is for product discovery only. It does not implement a cart, checkout, payment processing, orders, inventory reservations, or delivery estimates.

## Architecture and behavior

- `src/` contains the Vite storefront, React Router pages, reusable components, customer preference storage, and frontend tests.
- `backend/app/` contains the FastAPI API, Pydantic schemas, search and ranking, and Firestore/PostgreSQL catalog adapters.
- Firestore is the preferred catalog when server credentials are configured. Otherwise the API uses PostgreSQL when configured, then the bundled read-only demonstration catalog.
- Public product endpoints return active products only. Seller endpoints require a verified Firebase ID token; seller ownership is taken from that token and checked for listing management. Firestore client rules deny direct client reads and writes.
- Search and filters use catalog data. Embeddings and OpenAI responses are optional; keyword/catalog-grounded behavior remains available without those services.
- Wishlist and comparison IDs persist in browser local storage on that browser. They are not synchronized between accounts or devices.
- The frontend API proxy forwards `/api` to `http://localhost:8000` in development.

## Requirements

- Node.js 20 or newer and npm.
- Python 3.11 or newer. The checked-in CI currently tests Python 3.11; local development can use Python 3.13.
- Docker Desktop is optional and only required for local PostgreSQL.

## Frontend configuration

The Vite app reads its configuration from the project-root `.env`. Start with the safe template:

```powershell
Copy-Item .env.example .env
```

Frontend variables:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Optional API origin for deployments. Leave blank during local development to use Vite's `/api` proxy. |
| `VITE_FIREBASE_API_KEY` | Firebase Web app configuration used by Firebase Authentication. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID used by the Web app. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Web app configuration value; product image upload is not implemented. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web app configuration value. |
| `VITE_FIREBASE_APP_ID` | Firebase Web app ID. |

Get these client configuration values from Firebase Console → Project settings → Your apps → Web app. Web configuration is public client configuration, **not** an Admin SDK credential. Do not put private keys, service-account JSON, or other secrets in any `VITE_*` variable. Restart Vite after changing `.env`.

## Backend configuration

The backend settings are defined in `backend/.env.example`. Copy the variables you need into the project-root `.env` (the standard commands below run from the project root, and Pydantic reads `.env` from the working directory). Alternatively, export environment variables in the process that starts FastAPI.

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase project used by Firebase Admin. |
| `FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS` | Set to `true` to use local ADC when no service-account path is supplied. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional absolute path to a service-account JSON file stored outside the repository. Prefer ADC locally and managed identity in production. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed to call FastAPI. Defaults to the two local Vite origins; set this to the deployed frontend origin(s) in production. |
| `DATABASE_URL` | Optional PostgreSQL URL. Leave blank to skip PostgreSQL. |
| `OPENAI_API_KEY` | Optional server-only key for OpenAI assistant/compare responses. Leave blank for catalog-grounded fallback. |
| `OPENAI_MODEL` | Optional OpenAI model name; defaults to `gpt-4o-mini`. |
| `ENABLE_EMBEDDINGS` | Set to `true` to enable optional Sentence Transformers ranking. Defaults to `false`. |

Without Firestore credentials, PostgreSQL configuration, or a configured production API, the backend can still serve the bundled demonstration catalog. Seller operations require Firestore and return an error if seller storage is unavailable. `/api/health` reports whether a backend store was initialized; it does not prove that a database read or write will succeed.

### Firebase and ADC setup

1. In Firebase Console, select your project, create/confirm the Firestore database, and enable Authentication → Sign-in method → **Email/Password**.
2. Add the deployed web origin to Firebase Authentication's authorized domains when applicable.
3. For local development, install/configure the Google Cloud CLI if needed and run `gcloud auth application-default login` in your terminal. Ensure the signed-in identity has the minimum Firestore access required for this development project.
4. Set `FIREBASE_PROJECT_ID` to the project ID and `FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS=true` in the root `.env`. Leave `GOOGLE_APPLICATION_CREDENTIALS` blank when using ADC.
5. Keep `firestore.rules` restrictive. Seller listing writes and reads go through FastAPI's Admin SDK; do not enable broad client read/write access.
6. Restart FastAPI and check `http://localhost:8000/api/health`. It should report `firestore: enabled`. Test seller create/list/edit/status/delete with a development account and listing, not production data.

If you use a service-account JSON file instead of ADC, store it outside the workspace, grant only the permissions needed for the selected development project, and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. Never commit, paste, or share it. Production should use the hosting provider's managed workload identity rather than a long-lived downloaded key.

## Run locally on Windows

Run commands from the project root.

### 1. Install and start the frontend

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL, usually `http://localhost:5173`.

### 2. Set up and start the backend

In a second PowerShell window:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r requirements.txt
backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
```

The API's OpenAPI documentation is at `http://localhost:8000/docs`. For a quick health check, open `http://localhost:8000/api/health`. Leave both development servers running while using the storefront.

### Optional local PostgreSQL

PostgreSQL is not needed for the bundled catalog or Firestore seller flow. To run the optional local PostgreSQL/pgvector service:

```powershell
docker compose up -d db
```

Set a unique local-development `POSTGRES_PASSWORD` and `DATABASE_URL` in the root `.env` before starting the container, then restart FastAPI. Compose requires `POSTGRES_PASSWORD` and fails if it is unset. Do not reuse the local password for a hosted database. The backend initializes its schema and seeds missing bundled catalog rows when configured.

### Optional AI services

- **OpenAI:** set `OPENAI_API_KEY` in the root `.env`; the key is read only by FastAPI. With no key or a failed model request, assistant and compare responses use catalog-grounded fallback logic.
- **Embeddings:** install `requirements-semantic.txt`, set `ENABLE_EMBEDDINGS=true`, and restart FastAPI. The first model load may download `all-MiniLM-L6-v2`. If the optional dependency/model is unavailable, search falls back to keyword/catalog matching. Do not describe embeddings as active unless they are enabled and loaded.

## Seller listings

Open `/seller`, register or sign in with Firebase Email/Password, and create a listing. Seller accounts can list, edit, change status, and delete their own products. New listings are active by default. Only active listings appear in public catalog and detail endpoints; draft and archived listings remain visible to their owner.

FastAPI validates listing fields and verifies Firebase ID tokens, including revocation checks. The owner ID is always derived from the verified token. Public product response models do not expose the seller UID or listing status. Firestore rules remain deny-all for direct client access.

For safe manual testing, use a development seller account and a temporary listing, verify active/draft/archived visibility and ownership, then delete the test listing from the seller portal. Automated tests use an in-memory fake Firestore and do not connect to production Firestore.

## Tests and build

Frontend:

```powershell
npm.cmd test -- --run
npm.cmd run build
```

Backend tests should be run with Firestore credentials explicitly disabled so local `.env` or ADC configuration cannot cause tests to connect to a real project:

```powershell
$env:FIREBASE_USE_APPLICATION_DEFAULT_CREDENTIALS = "false"
$env:GOOGLE_APPLICATION_CREDENTIALS = ""
backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

The tests cover catalog filtering, sorting and pagination, empty/invalid inputs, active product visibility, seller authentication and ownership, validation, public-response privacy, search failure/empty states, wishlist persistence, and missing-image fallback. The GitHub Actions workflow runs frontend tests/build and backend tests without Firebase credentials.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Browser shows `502 Bad Gateway` for `/api/...` | Make sure FastAPI is running on port 8000. Check `http://localhost:8000/api/health`; Vite must also be running on port 5173. Restart FastAPI after changing backend code or `.env`. |
| Seller page reports Firebase setup or sign-in errors | Confirm the Web app values in root `.env`, Email/Password is enabled, the domain is authorized, and Vite was restarted after editing `.env`. |
| Seller operation returns `401` | Sign in again and confirm the browser sends the Firebase ID token. Do not share the token. |
| Seller operation returns `503` | Check `FIREBASE_PROJECT_ID`, ADC/service-account configuration, Firestore database availability, and backend startup logs. Do not make Firestore public to resolve this. |
| Search options are missing or catalog request fails | Check the backend health endpoint and retry the request. Search filters are supplied by `/api/catalog-facets`. |
| A product image says “Image unavailable” | The image URL may be inaccessible or blocked. Use a reachable HTTPS image URL; no image upload/storage service is currently implemented. |
| OpenAI/embedding output is unavailable | Those services are optional. Check server-side configuration and logs; catalog-based functionality should remain usable without them. |

## API overview

- `GET /api/health`
- `GET /api/categories`
- `GET /api/catalog-facets`
- `GET /api/products?q=compact%20desk&category=Office&sort=relevance&page=1&page_size=9`
- `GET /api/products/{id}`
- `GET /api/products/{id}/similar`
- `GET /api/recommendations`
- `POST /api/assistant`
- `POST /api/compare-summary`
- `POST /api/seller/products` (Firebase ID token required)
- `GET /api/seller/products` (Firebase ID token required)
- `PATCH /api/seller/products/{id}` (owner's Firebase ID token required)
- `DELETE /api/seller/products/{id}` (owner's Firebase ID token required)

Search results include explanations derived from catalog attributes. Semantic embeddings are optional and disabled by default. Product search uses API pagination with `page` and `page_size`.

## Deployment readiness and limitations

Recommended architecture:

1. Build the React/Vite frontend and host the static assets on a static hosting/CDN service.
2. Host FastAPI as a separate HTTPS service. Configure the production frontend API base URL or a same-origin `/api` reverse proxy. For cross-origin hosting, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of exact deployed frontend origins; do not use `*`.
3. Connect FastAPI to Firestore using the hosting provider's managed identity and least-privilege IAM. Keep Firebase Admin credentials, OpenAI keys, and database URLs on the server only.
4. Configure Firebase Authentication authorized domains, HTTPS, monitoring, backups/retention, and separate development and production Firebase projects before accepting seller listings.
5. Keep Firestore client rules restrictive. Public catalog traffic should go through the API, which filters inactive listings and omits seller-only fields.

No deployment, paid resource, cloud permission, or Firebase rule change is performed by this project setup. Production deployment has not been tested. Current limitations include in-memory Firestore filtering/pagination (use Firestore indexes and cursor pagination for larger catalogs), URL-only product images (no upload/storage flow), browser-local rather than account-synchronized favorites, optional external AI services, and no cart, checkout, payment, or order system. The bundled catalog is demonstration data, not proof of live inventory.

## Project layout

- `src/`: frontend pages, reusable components, API client, local storage, tests, and styles.
- `backend/app/`: FastAPI routes, schemas, Firebase initialization, catalog services, and search.
- `backend/tests/`: isolated API and search tests.
- `backend/.env.example`: backend-specific variable template.
- `.env.example`: combined local frontend/backend environment template.
- `.gitignore`: ignores environment files, virtual environments, build outputs, caches, generated TypeScript build artifacts, and common service-account files.
- `firestore.rules` and `firestore.indexes.json`: restrictive Firestore baseline.
- `docker-compose.yml`: optional local PostgreSQL/pgvector service.
