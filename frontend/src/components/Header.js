import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, LogOut, Settings, Menu } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Header({ user, onMenuClick }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, {
        withCredentials: true
      });
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="sticky top-0 z-50 header-blur" data-testid="app-header">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-2 hover:bg-secondary rounded-full transition-colors"
                data-testid="mobile-menu-button"
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
            )}
            <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2" data-testid="logo-link">
              <Sparkles size={24} strokeWidth={1.5} className="text-primary" />
              <span className="text-xl font-medium">Ankit GPT 2.0</span>
            </Link>
          </div>

          <nav className="flex items-center gap-6">
            {user ? (
              <>
                <Link
                  to="/settings"
                  className="p-2 hover:bg-secondary rounded-full transition-colors"
                  data-testid="settings-link"
                >
                  <Settings size={20} strokeWidth={1.5} />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-secondary rounded-full transition-colors"
                  data-testid="logout-button"
                >
                  <LogOut size={20} strokeWidth={1.5} />
                </button>
              </>
            ) : (
              <>
                <Link to="/pricing" className="text-sm font-medium hover:text-primary transition-colors" data-testid="pricing-link">
                  Pricing
                </Link>
                <Link
                  to="/login"
                  className="btn-primary"
                  data-testid="login-link"
                >
                  Sign In
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;