---
id: auth.register
status: implemented
depends_on: []
implements: ../../specs-business/auth/coach-relies-on-auth.business.md
governed_by: []
---

# auth.register


### Intent
Create a new user account. Users are created with `inactive` status and must be activated separately.

### Rules
1. Requires name, username, password
2. Email is optional
3. Username must be unique
4. User is created with status `inactive`

### Acceptance Criteria

#### Successful registration
- **Given** no user with username `newuser` exists
- **When** POST to `/api/auth/register` with `{"name": "New User", "username": "newuser", "password": "Pass123!"}`
- **Then** the response status is 201
- **And** a User record is created with status `inactive`
