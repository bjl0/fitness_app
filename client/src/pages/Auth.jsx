import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state.jsx';

export default function Auth() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from || '/';
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = mode === 'login'
        ? await api('POST', '/auth/login', { login: form.login, password: form.password })
        : await api('POST', '/auth/register', { username: form.username, email: form.email, password: form.password });
      signIn(data);
      nav(from, { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form className="narrow auth" onSubmit={submit}>
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      {mode === 'login' ? (
        <input placeholder="Username or email" value={form.login} onChange={set('login')} autoComplete="username" required />
      ) : (
        <>
          <input placeholder="Username" value={form.username} onChange={set('username')} autoComplete="username" required />
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </>
      )}
      <input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={set('password')}
             autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Register'}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
