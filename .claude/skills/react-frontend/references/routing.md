# Routing & Authentication

## Route Setup

```typescript
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

<BrowserRouter>
  <Routes>
    {/* Public routes */}
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/register/:userId" element={<RegisterPage />} />

    {/* Protected routes */}
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:id" element={<MessagesPage />} />

        {/* Role-restricted routes */}
        <Route element={<RoleRoute allowedRoles={["coach"]} />}>
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
        </Route>
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
</BrowserRouter>
```

## Route Guards

```typescript
function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/auth" />;
}

function RoleRoute({ allowedRoles }: { allowedRoles: string[] }) {
  const { user } = useAuth();
  if (!user || !allowedRoles.some((r) => user.roles.includes(r))) {
    return <Navigate to="/" />;
  }
  return <Outlet />;
}
```

## Auth Context

```typescript
type AuthContextType = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
};
```

- Token stored in `localStorage`
- Added to requests via Axios interceptor (`Authorization: Bearer ${token}`)
- On page load, call `/api/me` to restore user from token
- 401 responses trigger redirect to `/auth`

## Navigation

Use React Router hooks:

```typescript
const navigate = useNavigate();
const { id } = useParams<{ id: string }>();
const [searchParams] = useSearchParams();
```

Use `<Link>` for declarative navigation, `navigate()` for programmatic.
