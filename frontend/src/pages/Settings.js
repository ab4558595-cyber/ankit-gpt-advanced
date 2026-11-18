import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { User, CreditCard, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Settings({ user: initialUser }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(initialUser);
  const [usage, setUsage] = useState(null);
  const [limits, setLimits] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userResponse, usageResponse] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/usage/stats`, { withCredentials: true })
      ]);
      setUser(userResponse.data.user);
      setUsage(usageResponse.data.usage);
      setLimits(usageResponse.data.limits);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const formatLimit = (limit) => {
    return limit === -1 ? 'Unlimited' : limit;
  };

  const getUsagePercentage = (used, limit) => {
    if (limit === -1) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  return (
    <div className="min-h-screen" data-testid="settings-page">
      <Header user={user} />
      
      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight font-medium mb-8">
          Settings
        </h1>

        <div className="space-y-6">
          <div className="card" data-testid="profile-section">
            <div className="flex items-start gap-4 mb-6">
              <User size={24} strokeWidth={1.5} className="text-primary" />
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl tracking-tight font-medium mb-4">
                  Profile
                </h2>
                {user && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs tracking-[0.2em] uppercase font-bold text-slate-500 block mb-1">Name</label>
                      <p className="text-base">{user.name}</p>
                    </div>
                    <div>
                      <label className="text-xs tracking-[0.2em] uppercase font-bold text-slate-500 block mb-1">Email</label>
                      <p className="text-base">{user.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" data-testid="subscription-section">
            <div className="flex items-start gap-4 mb-6">
              <CreditCard size={24} strokeWidth={1.5} className="text-primary" />
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl tracking-tight font-medium mb-4">
                  Subscription
                </h2>
                {user && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs tracking-[0.2em] uppercase font-bold text-slate-500 block mb-1">Current Plan</label>
                      <p className="text-lg font-medium capitalize">{user.subscription_plan}</p>
                    </div>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="btn-primary"
                      data-testid="upgrade-plan-button"
                    >
                      {user.subscription_plan === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" data-testid="usage-section">
            <div className="flex items-start gap-4 mb-6">
              <TrendingUp size={24} strokeWidth={1.5} className="text-primary" />
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl tracking-tight font-medium mb-4">
                  Usage Statistics
                </h2>
                {usage && limits && (
                  <div className="space-y-6">
                    {[
                      { key: 'text_generations', label: 'Text Generations' },
                      { key: 'image_generations', label: 'Image Generations' },
                      { key: 'voice_queries', label: 'Voice Queries' },
                      { key: 'photo_searches', label: 'Photo Searches' },
                      { key: 'deep_research', label: 'Deep Research' }
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-sm text-slate-600">
                            {usage[key]} / {formatLimit(limits[key])}
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${getUsagePercentage(usage[key], limits[key])}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;