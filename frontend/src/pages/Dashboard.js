import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ChatInterface from '../components/ChatInterface';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard({ user: initialUser }) {
  const location = useLocation();
  const [user, setUser] = useState(initialUser);
  const [usage, setUsage] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    loadUserData();
    loadConversations();
    
    // Check for payment success
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    if (sessionId && !checkingPayment) {
      checkPaymentStatus(sessionId);
    }
  }, [location.search]);

  const loadUserData = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        withCredentials: true
      });
      setUser(response.data.user);
      setUsage(response.data.usage);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const response = await axios.get(`${API}/conversations`, {
        withCredentials: true
      });
      setConversations(response.data.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const checkPaymentStatus = async (sessionId) => {
    setCheckingPayment(true);
    let attempts = 0;
    const maxAttempts = 5;

    const poll = async () => {
      try {
        const response = await axios.get(`${API}/payments/status/${sessionId}`, {
          withCredentials: true
        });

        if (response.data.payment_status === 'paid') {
          await loadUserData();
          window.history.replaceState({}, '', '/dashboard');
          return;
        } else if (response.data.status === 'expired') {
          window.history.replaceState({}, '', '/dashboard');
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          window.history.replaceState({}, '', '/dashboard');
        }
      } catch (error) {
        console.error('Payment status error:', error);
        window.history.replaceState({}, '', '/dashboard');
      }
    };

    poll();
  };

  const handleNewConversation = async () => {
    setCurrentConversation(null);
  };

  const handleSelectConversation = (conversation) => {
    setCurrentConversation(conversation);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await axios.delete(`${API}/conversations/${conversationId}`, {
        withCredentials: true
      });
      setConversations(conversations.filter(c => c.conversation_id !== conversationId));
      if (currentConversation?.conversation_id === conversationId) {
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const handleConversationCreated = (conversationId) => {
    loadConversations();
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="dashboard-page">
      <Header user={user} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        
        <ChatInterface
          user={user}
          usage={usage}
          currentConversation={currentConversation}
          onConversationCreated={handleConversationCreated}
          onUsageUpdate={loadUserData}
        />
      </div>
    </div>
  );
}

export default Dashboard;
