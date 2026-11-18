import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Check, Loader2 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Pricing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '₹0',
      period: 'forever',
      features: [
        '10 text generations',
        '2 image generations',
        '5 voice queries',
        '3 photo searches',
        'Basic features'
      ]
    },
    {
      id: 'go',
      name: 'Go',
      price: '₹200',
      period: 'per month',
      popular: true,
      features: [
        '500 text generations',
        '50 image generations',
        '200 voice queries',
        '100 photo searches',
        '20 deep research queries',
        'Priority support'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '₹400',
      period: 'per month',
      features: [
        'Unlimited text generations',
        '200 image generations',
        'Unlimited voice queries',
        'Unlimited photo searches',
        'Unlimited deep research',
        'Priority support',
        'Advanced features'
      ]
    }
  ];

  const handleSelectPlan = async (planId) => {
    if (planId === 'free') {
      navigate('/login');
      return;
    }

    setLoading(planId);
    try {
      const response = await axios.post(
        `${API}/payments/create-checkout`,
        {
          plan_id: planId,
          origin_url: window.location.origin
        },
        {
          withCredentials: true
        }
      );

      window.location.href = response.data.checkout_url;
    } catch (error) {
      console.error('Checkout error:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen" data-testid="pricing-page">
      <Header />
      
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none font-medium mb-6" data-testid="pricing-title">
              Choose Your Plan
            </h1>
            <p className="text-base leading-relaxed text-slate-700 max-w-2xl mx-auto">
              Select the perfect plan for your AI needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`card relative ${plan.popular ? 'ring-2 ring-primary' : ''}`}
                data-testid={`pricing-plan-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
                    Popular
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-xl sm:text-2xl tracking-tight font-medium mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-slate-600">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check size={20} strokeWidth={1.5} className="text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loading === plan.id}
                  className={`w-full ${plan.popular ? 'btn-primary' : 'btn-secondary'} flex items-center justify-center gap-2`}
                  data-testid={`select-plan-${plan.id}`}
                >
                  {loading === plan.id ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    plan.id === 'free' ? 'Get Started' : 'Subscribe'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Pricing;
