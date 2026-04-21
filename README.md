# WartungsDashboard

WartungsDashboard is a comprehensive maintenance monitoring and management dashboard. It tracks and manages the status of various systems, disk usage, last update dates, and notifies on thresholds for warnings or errors.

## Tech Stack

- **Frontend**: React (with Vite), Zustand (state management), React Router, i18next (internationalization)
- **Backend**: Node.js with Fastify (REST API), Prisma (ORM)
- **Database**: SQLite (stored in a Docker-managed named volume)
- **Language**: TypeScript throughout

## Docker Setup

The project is designed to be run **exclusively via Docker**. It includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

### 1 – Configure the environment

Copy the provided template and edit the values:

```bash
cp .env.example .env
```

Open `.env` and **at a minimum** change `SESSION_SECRET` to a long random string:

```bash
# Generate a suitable secret (Linux/macOS/WSL):
openssl rand -hex 32
```

> **Never commit `.env` to version control** – it is already listed in `.gitignore`.

### 2 – Build and start

```bash
docker-compose up -d --build
```

This builds the image, starts the container, and automatically applies any pending database migrations via `prisma db push`.

### 3 – Seed the database

Run this **once** after the first start to create the initial admin user and default thresholds:

```bash
docker exec -it wartungsdashboard npm run db:seed
```

**Default credentials:**

| Field    | Value         |
|----------|---------------|
| Username | `admin`       |
| Password | `changeme123` |

> ⚠️ Log in and change the password immediately after first use.

You can override the defaults before seeding by adding `ADMIN_USER` and `ADMIN_PASS` to your `.env` file.

### 4 – Access the application

The application is exposed on port `3067` by default:  
**[http://localhost:3067](http://localhost:3067)**

To use a different port, change the `PORT` variable in `.env` **and** update the port mapping in `docker-compose.yml` accordingly.

---

## Environment Variables Reference

All variables are defined in `.env` (based on `.env.example`):

| Variable        | Required | Default                      | Description                              |
|-----------------|----------|------------------------------|------------------------------------------|
| `DATABASE_URL`  | ✅        | `file:/app/data/wartung.db`   | SQLite path inside the container         |
| `SESSION_SECRET`| ✅        | *(must be changed)*          | Secret used to sign session cookies      |
| `NODE_ENV`      |          | `production`                  | Node environment                         |
| `PORT`          |          | `3067`                        | Port the server listens on               |
| `ADMIN_USER`    |          | `admin`                       | Admin username created by `db:seed`      |
| `ADMIN_PASS`    |          | `changeme123`                 | Admin password created by `db:seed`      |

---

## Updating

```bash
docker-compose down
docker-compose up -d --build
```

The database volume (`db_data`) is preserved between updates.