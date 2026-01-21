import React, { useEffect, useState, createContext } from 'react';
import MainLayout from './pages/MainLayout';
import Login from './pages/Login';

export const AuthContext = createContext(null);

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = window.localStorage.getItem('kelany_staff_user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (user) {
        window.localStorage.setItem('kelany_staff_user', JSON.stringify(user));
      } else {
        window.localStorage.removeItem('kelany_staff_user');
      }
    } catch (_) {}
  }, [user]);

  const handleLogin = (payload) => {
    setUser(payload);
    try { window.history.pushState({}, '', '/dashboard'); } catch (_) {}
  };

  const handleLogout = () => {
    setUser(null);
    try { window.history.pushState({}, '', '/'); } catch (_) {}
  };

  if (!user) {
    return (
      <AuthContext.Provider value={null}>
        <Login onLogin={handleLogin} />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={user}>
      <div className="font-sans" dir="rtl">
        <MainLayout currentUser={user} onLogout={handleLogout} />
      </div>
    </AuthContext.Provider>
  );
}
