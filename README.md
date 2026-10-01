# VetOS

Multi-tenant veterinary clinic platform. Requirements and architecture live in [docs/README.md](docs/README.md). Current status is in [docs/progress.md](docs/progress.md).

## Two frontends (read this)

| App | Command | Port | Purpose |
| --- | --- | --- | --- |
| **Vite UI (full prototype modules)** | `npm run dev` in the parent `VetSaaS` folder | 5173 | Rich UI; now gated by **real API login** (Vite proxies `/api` to the backend) |
| **Next.js app (admin shell)** | `cd apps/web && npm run dev` | 3000 | Minimal sign-in + clinic/user settings against the same API |

Do not expect the Next app to look like the Vite prototype—they are separate apps until merged.

## Local stack

```bash
docker compose up --build
```

The API listens on port 8080 and the web app on port 3000. With the `dev` profile, Compose loads `owner@clinic.test` / `change-me-now` for the local clinic only.

API tests:

```bash
cd apps/api
./mvnw test
```

Web tests:

```bash
cd apps/web
npm test
```
