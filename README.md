# WartungsDashboard

WartungsDashboard is a comprehensive maintenance monitoring and management dashboard. It tracks and manages the status of various systems, disk usage, last update dates, and notifies on thresholds for warnings or errors.

## Tech Stack

The project is built with a modern web stack:

- **Frontend**: React (with Vite), Zustand (for state management), React Router, and i18next (for internationalization).
- **Backend**: Node.js with Fastify (for REST API), and Prisma (as the ORM for database operations).
- **Database**: SQLite (configured via Prisma, stored in a local file).
- **Language**: TypeScript is used throughout both frontend and backend for type safety.

## Docker Setup

The project is designed to be run **exclusively via Docker**. It includes a `Dockerfile` and `docker-compose.yml` for easy deployment and management.

### Installation

1. **Clone the repository:**
   Ensure you have Docker and Docker Compose installed on your system.

2. **Run with Docker Compose:**
   Navigate to the project directory and start the application:
   ```bash
   docker-compose up -d --build
   ```
   This will automatically build the images, start the container, and apply any pending database migrations.

### Seeding the Database

Once the container is running, you need to populate the database with the initial admin user and default global thresholds.

Run the following command to execute the seed script inside the running container:

```bash
docker exec -it wartungsdashboard npm run db:seed
```

**Important Default Credentials:**
By default, the seed script creates an administrator account.
- **Username**: `admin`
- **Password**: `changeme123`

*(Note: Please log in and change the password immediately after your first login!)*

### Access the Application

By default, the application will be exposed on port `3067` (`http://localhost:3067`).

## Configuration

For production use, ensure you update the `SESSION_SECRET` in `docker-compose.yml` or your environment configuration to a long, secure random string. The SQLite database is stored locally in the mounted `db_data` volume inside the container at `/app/data/wartung.db`.