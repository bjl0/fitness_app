import { NavLink, Route, Routes, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth, useDraft } from './state.jsx';
import Library from './pages/Library.jsx';
import Builder from './pages/Builder.jsx';
import MyWorkouts from './pages/MyWorkouts.jsx';
import Feed from './pages/Feed.jsx';
import Favorites from './pages/Favorites.jsx';
import WorkoutDetail from './pages/WorkoutDetail.jsx';
import Auth from './pages/Auth.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  return user ? children : <Navigate to="/auth" state={{ from: loc.pathname }} replace />;
}

export default function App() {
  const { user, signOut } = useAuth();
  const { draft } = useDraft();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">Workout Builder</Link>
        <nav>
          <NavLink to="/" end>Exercises</NavLink>
          <NavLink to="/feed">Feed</NavLink>
          <NavLink to="/build">Builder{draft.lines.length > 0 && <span className="badge">{draft.lines.length}</span>}</NavLink>
          <NavLink to="/mine">My workouts</NavLink>
          <NavLink to="/favorites">Favorited</NavLink>
        </nav>
        <div className="who">
          {user ? (
            <>
              <span>{user.username}</span>
              <button className="link" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <Link to="/auth" className="btn small">Sign in</Link>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/workouts/:id" element={<WorkoutDetail />} />
          <Route path="/build" element={<Builder />} />
          <Route path="/build/:id" element={<RequireAuth><Builder /></RequireAuth>} />
          <Route path="/mine" element={<RequireAuth><MyWorkouts /></RequireAuth>} />
          <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<p className="empty">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
