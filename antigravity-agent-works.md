# Antigravity Agent Work Log: VetOS Debugging

## Summary of Issue
The user was unable to run the VetOS application locally using `docker compose up --build`. The Next.js frontend (`web`) was throwing an `ECONNREFUSED` error, and the user reported a completely blank white screen when navigating to `localhost:3000`.

## Steps Taken & Fixes Applied

### 1. Fixed Docker Internal Networking
- **Problem:** The Next.js web application was configured to proxy API requests to `http://localhost:8080`. Inside Docker Compose, `localhost` refers to the `web` container itself, not the `api` container, leading to a connection refused error.
- **Action Taken:** Modified `docker-compose.yml`. Changed the environment variable for the `web` service from `NEXT_PUBLIC_API_URL` to `API_ORIGIN` and updated its value to `http://api:8080`.

### 2. Fixed Hibernate Schema Validation Crash (Attempt 1)
- **Problem:** The `api` container was silently crashing and failing to boot. Checking the Docker logs revealed a Hibernate schema validation mismatch: PostgreSQL had a `char(3)` column for `currency_code`, but Hibernate expected `varchar(3)` because the Java entity field was a `String`.
- **Action Taken:** Modified `ClinicEntity.java` to explicitly define the column as `char(3)` using `columnDefinition = "char(3)"`.

### 3. Diagnosed Docker/Windows Networking Hang
- **Problem:** When rebuilding the `api` container, the Maven dependency download froze indefinitely at `asm-9.9.1.pom`. 
- **Action Taken:** Diagnosed this as a known Docker Desktop on Windows bug where the network adapter fails to resolve IPv6/DNS during heavy downloads. Recommended restarting the Docker engine. To prevent it from happening again, I modified the `apps/api/Dockerfile` to include `-Djava.net.preferIPv4Stack=true` in the Maven command to force IPv4 routing.

### 4. Fixed Next.js Build-Time Environment Variable
- **Problem:** The frontend `ECONNREFUSED` error persisted even after fixing `docker-compose.yml`.
- **Action Taken:** Diagnosed that Next.js proxy rewrites in `next.config.ts` are evaluated at *build time*, not runtime. Since we didn't pass `API_ORIGIN` to the `web` Dockerfile during the build step, it fell back to `localhost`. Modified `apps/web/Dockerfile` to include `ARG API_ORIGIN` and `ENV API_ORIGIN=$API_ORIGIN` before running `npm run build`.

### 5. Configured and Pushed to GitHub
- **Problem:** The user requested to push the code to a new GitHub repository, but git was not initialized and no user config was set.
- **Action Taken:** Initialized git, added the files, configured the user email (`bodduprithvee@gmail.com`) and name (`Prithvee905`), committed the code, and pushed it to `https://github.com/Prithvee905/VetOS-petwellclinic.git`.

### 6. Fixed Hibernate Schema Validation Crash (Attempt 2)
- **Problem:** Hibernate 6's strict type checking still rejected the `columnDefinition` fix from step 2, throwing an error because it still fundamentally saw the Java field as a `String` mapping to a `CHAR` database column.
- **Action Taken:** Modified `ClinicEntity.java` to use the modern Hibernate 6 annotation: `@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)`. This properly instructs Hibernate to expect and handle a `CHAR` database type for the String variable.

### 7. Fixed Missing Bouncy Castle Dependency for Argon2 Password Encoder
- **Problem:** The API container crashed on startup with `java.lang.NoClassDefFoundError: org/bouncycastle/crypto/params/Argon2Parameters$Builder`. Spring Security's `Argon2PasswordEncoder` requires Bouncy Castle provider to execute password hashing, which was missing from the dependencies.
- **Action Taken:** Added `org.bouncycastle:bcprov-jdk18on:1.80` to `apps/api/pom.xml`.

### 8. Resolved Docker WSL2 Network Download Freeze
- **Problem:** Docker's internal NAT in WSL2 repeatedly froze during heavy dependency downloads (stuck at `asm-9.9.1.pom`).
- **Action Taken:** Built the artifact directly on the Windows host using `./mvnw.cmd package "-Dmaven.test.skip=true"` using native network throughput (~2.5 MB/s). Updated `apps/api/Dockerfile` to directly package the prebuilt JAR into the lightweight JRE runtime, and updated `.dockerignore` so Docker picks up the build artifact.

### 9. All Services Verified Running & Healthy
- `vetos-postgres-1`: PostgreSQL 17 UP and healthy on port 5432
- `vetos-redis-1`: Redis 7 UP on port 6379
- `vetos-api-1`: Spring Boot 4.1.1 API UP on port 8080 (`/actuator/health` UP, dev owner seeded)
- `vetos-web-1`: Next.js 16 Web UP on port 3000

## Educational Explanations Provided
- Explained what Docker does (creates isolated containers for DB, Cache, API, and Web and links them via a virtual network).
- Explained why a Python virtual environment is not needed (the stack is Java/Node.js).
- Explained why there is no "Sign Up" page (B2B multi-tenant security relies on an admin-invite workflow).
- Explained why Swagger UI is missing (the AI opted for a static `openapi.yaml` file instead of runtime Springdoc generation).
