# Copilot Instructions - G3 Webapp Backend 2025

## Project Overview
This is a Next.js 15 backend API for a manufacturing/production management system with employee authentication, rack/slot management, machine logs, and production reporting. The system uses **PostgreSQL** with **raw SQL queries** (no ORM) and JWT authentication.

## Architecture & Key Patterns

### Database Layer
- **Connection**: Uses `src/lib/db.js` with PostgreSQL connection pool (`pg` library)
- **No ORM**: All database interactions use raw SQL with parameterized queries (`$1`, `$2`, etc.)
- **Connection Details**: Hardcoded to `10.100.54.170:5432` database `g3db` (user: `nakamura`)
- **Schema**: See `SQL/create.sql` for complete table structure (employees, racks, machines, etc.)

### API Structure (Next.js App Router)
- **Location**: All APIs under `src/app/api/`
- **Patterns**: RESTful routes using Next.js 13+ file-based routing
- **Format**: Each route exports HTTP methods (`GET`, `POST`, `PUT`, `DELETE`)
- **Response**: Always use `NextResponse.json()` for consistent JSON responses

### Authentication & Security
- **JWT**: Uses `jsonwebtoken` library with 7-day expiration
- **Password**: Hybrid approach - bcrypt for new users, plaintext fallback for legacy
- **CORS**: Custom middleware restricts to private `10.x.x.x` networks only
- **Environment**: Requires `JWT_SECRET` environment variable

### API Route Examples
```javascript
// Standard route pattern
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const result = await db.query('SELECT * FROM table WHERE id = $1', [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### Error Handling Conventions
- **Database Errors**: Log to console, return generic 500 error
- **Validation Errors**: Return 400 with specific Japanese error messages
- **Auth Errors**: Return 401 with generic message (don't reveal user existence)
- **Constraint Violations**: Check `err.code === '23505'` for unique violations

### Development Workflow

#### Setup Commands (PowerShell)
```powershell
cd g3-webapp-back-2025
npm install
npm run dev    # Development server on localhost:3000
```

#### Database Setup
```powershell
# Schema creation
psql -h 10.100.54.170 -U nakamura -d g3db -f .\SQL\create.sql
# Test data
psql -h 10.100.54.170 -U nakamura -d g3db -f .\SQL\testdata.sql
```

## Key Files & Their Purpose

### Core Configuration
- `src/lib/db.js` - PostgreSQL connection singleton
- `src/middleware.js` - CORS handler for 10.x.x.x networks only
- `package.json` - Dependencies: bcrypt, jsonwebtoken, pg, Next.js 15

### API Endpoints
- `api/auth/` - Login/logout/register with JWT
- `api/employees/` - Employee CRUD with filtering
- `api/racks/` - Rack management with slots
- `api/machines/` - Machine logs and status
- `api/ingress/` - Inspection workflows

### Database Schema
- `SQL/create.sql` - Complete table definitions
- `SQL/testdata.sql` - Sample data for development

## Development Guidelines

### When Adding New APIs
1. Create route file in appropriate `src/app/api/` subdirectory
2. Use parameterized queries (`$1`, `$2`) to prevent SQL injection
3. Include proper error handling with Japanese messages
4. Follow existing response format patterns
5. Add console.error logging for debugging

### Database Queries
- Always use `db.query(sql, params)` pattern
- Use `RETURNING` clause for INSERT/UPDATE operations
- Include proper JOIN syntax for related data
- Handle PostgreSQL-specific error codes

### Authentication Flow
- Login returns `access_token` (JWT) and user object
- Include `Authorization: Bearer <token>` in protected endpoints
- Verify JWT and extract user info in protected routes
- Check `employee_is_active` flag for active users

### Common Pitfalls
- **Don't** use Prisma or other ORM patterns
- **Don't** hardcode database credentials in new files
- **Remember** Japanese error messages for user-facing errors
- **Check** CORS middleware applies only to `/api/*` routes
- **Use** `NextResponse.json()` not `Response.json()`

## Project-Specific Conventions
- Error messages in Japanese for user-facing responses
- Employee management uses `employee_user_id` for login, `employee_id` for relations
- Rack system uses row/column grid with slot identifiers
- Machine logs include timezone handling (`Asia/Tokyo`)
- All timestamps should consider JST timezone conversion