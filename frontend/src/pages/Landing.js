import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Sparkles, Image, Mic, Camera, Search, Zap } from 'lucide-react';

function Landing() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Sparkles size={32} strokeWidth={1.5} />,
      title: "AI Chat",
      description: "Get answers to any question with GPT-5.2 powered conversations"
    },
    {
      icon: <Image size={32} strokeWidth={1.5} />,
      title: "Image Generation",
      description: "Create stunning images from text descriptions instantly"
    },
    {
      icon: <Mic size={32} strokeWidth={1.5} />,
      title: "Voice Search",
      description: "Ask questions naturally using your voice"
    },
    {
      icon: <Camera size={32} strokeWidth={1.5} />,
      title: "Photo Search",
      description: "Upload images and get detailed AI-powered analysis"
    },
    {
      icon: <Search size={32} strokeWidth={1.5} />,
      title: "Deep Research",
      description: "Comprehensive research with detailed analysis"
    },
    {
      icon: <Zap size={32} strokeWidth={1.5} />,
      title: "Memory",
      description: "Context-aware conversations that remember your history"
    }
  ];

  return (
    <div className="min-h-screen" data-testid="landing-page">
      <Header />
      
      <section className="relative overflow-hidden py-20 lg:py-32" data-testid="hero-section">
        <div className="absolute inset-0 opacity-30">
          <img 
            src="https://images.unsplash.com/photo-1760888102496-8ed280c9fc62?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwYWJzdHJhY3QlMjBzaGFwZXMlMjB3YXJtfGVufDB8fHx8MTc3NDg4NTI4OXww&ixlib=rb-4.1.0&q=85"
            alt="Background"
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none font-medium mb-6" data-testid="hero-title">
            Your Advanced AI Assistant
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-slate-700 max-w-2xl mx-auto mb-10">
            Ankit GPT 2.0 combines the power of advanced AI with voice, vision, and deep research capabilities. Experience the future of AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/login')}
              className="btn-primary text-lg"
              data-testid="get-started-btn"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate('/pricing')}
              className="btn-secondary text-lg"
              data-testid="view-pricing-btn"
            >
              View Pricing
            </button>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-32" data-testid="features-section">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight font-medium mb-4">
              Powerful Features
            </h2>
            <p className="text-base leading-relaxed text-slate-700 max-w-2xl mx-auto">
              Everything you need in one advanced AI platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card" data-testid={`feature-card-${index}`}>
                <div className="text-primary mb-4">{feature.icon}</div>
                <h3 className="text-xl sm:text-2xl tracking-tight font-medium mb-2">
                  {feature.title}
                </h3>
                <p className="text-base leading-relaxed text-slate-700">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-32 bg-gradient-to-b from-transparent to-secondary/30" data-testid="cta-section">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight font-medium mb-6">
            Ready to experience the future?
          </h2>
          <p className="text-base leading-relaxed text-slate-700 mb-10">
            Join thousands of users already using Ankit GPT 2.0
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary text-lg"
            data-testid="cta-button"
          >
            Start Free Trial
          </button>
        </div>
      </section>

      <footer className="py-12 border-t border-border" data-testid="footer">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 text-center">
          <p className="text-sm text-slate-600">
            © 2026 Ankit GPT 2.0. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;