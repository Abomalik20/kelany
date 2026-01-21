import React, { useEffect, useState } from 'react';
import MainLayout from './pages/MainLayout';
import Login from './pages/Login';

function App() {
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
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="font-sans" dir="rtl">
      <MainLayout currentUser={user} onLogout={handleLogout} />
    </div>
  );
}

export default App;
