import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Camera, Image, Search, Sparkles, Loader2, StopCircle } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ChatInterface({ user, usage, currentConversation, onConversationCreated, onUsageUpdate }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState('chat');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (currentConversation) {
      loadConversationMessages(currentConversation.conversation_id);
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversationMessages = async (conversationId) => {
    try {
      const response = await axios.get(`${API}/conversations/${conversationId}`, {
        withCredentials: true
      });
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;

    const userMessage = inputText;
    setInputText('');
    setLoading(true);

    const tempUserMsg = {
      message_id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await axios.post(
        `${API}/chat/completions`,
        {
          conversation_id: currentConversation?.conversation_id,
          message: userMessage,
          mode: mode === 'deep_research' ? 'deep_research' : 'chat'
        },
        {
          withCredentials: true
        }
      );

      const assistantMsg = {
        message_id: response.data.message_id,
        role: 'assistant',
        content: response.data.response,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (!currentConversation) {
        onConversationCreated(response.data.conversation_id);
      }

      onUsageUpdate();
    } catch (error) {
      console.error('Chat error:', error);
      if (error.response?.status === 429) {
        alert('Usage limit exceeded. Please upgrade your plan.');
      }
      setMessages(prev => prev.filter(m => m.message_id !== tempUserMsg.message_id));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async (e) => {
    e.preventDefault();
    if (!imagePrompt.trim() || loading) return;

    const prompt = imagePrompt;
    setImagePrompt('');
    setLoading(true);

    const tempUserMsg = {
      message_id: 'temp-' + Date.now(),
      role: 'user',
      content: `Generate image: ${prompt}`,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await axios.post(
        `${API}/images/generate`,
        {
          prompt: prompt,
          conversation_id: currentConversation?.conversation_id
        },
        {
          withCredentials: true
        }
      );

      const assistantMsg = {
        message_id: 'img-' + Date.now(),
        role: 'assistant',
        content: '',
        images: [response.data.image_url],
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (!currentConversation && response.data.conversation_id) {
        onConversationCreated(response.data.conversation_id);
      }

      onUsageUpdate();
    } catch (error) {
      console.error('Image generation error:', error);
      if (error.response?.status === 429) {
        alert('Usage limit exceeded. Please upgrade your plan.');
      }
      setMessages(prev => prev.filter(m => m.message_id !== tempUserMsg.message_id));
    } finally {
      setLoading(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      alert('Could not access microphone');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscribeAudio = async (audioBlob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      const response = await axios.post(
        `${API}/voice/transcribe`,
        formData,
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setInputText(response.data.text);
      onUsageUpdate();
    } catch (error) {
      console.error('Transcription error:', error);
      if (error.response?.status === 429) {
        alert('Usage limit exceeded. Please upgrade your plan.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || loading) return;

    setLoading(true);

    const tempUserMsg = {
      message_id: 'temp-' + Date.now(),
      role: 'user',
      content: 'Analyzing photo...',
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('question', inputText || "What's in this image?");
      if (currentConversation) {
        formData.append('conversation_id', currentConversation.conversation_id);
      }

      const response = await axios.post(
        `${API}/chat/vision`,
        formData,
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const assistantMsg = {
        message_id: 'vision-' + Date.now(),
        role: 'assistant',
        content: response.data.response,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev.filter(m => m.message_id !== tempUserMsg.message_id), assistantMsg]);
      setInputText('');

      if (!currentConversation) {
        onConversationCreated(response.data.conversation_id);
      }

      onUsageUpdate();
    } catch (error) {
      console.error('Photo analysis error:', error);
      if (error.response?.status === 429) {
        alert('Usage limit exceeded. Please upgrade your plan.');
      }
      setMessages(prev => prev.filter(m => m.message_id !== tempUserMsg.message_id));
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    
    return (
      <div
        key={message.message_id}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 fade-in`}
        data-testid={`message-${message.role}`}
      >
        <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}>
          {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
          {message.images && message.images.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt="Generated"
                  className="rounded-lg max-w-full"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-background" data-testid="chat-interface">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode('chat')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              mode === 'chat' ? 'bg-primary text-white' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
            data-testid="mode-chat"
          >
            <Sparkles size={16} strokeWidth={1.5} className="inline mr-2" />
            Chat
          </button>
          <button
            onClick={() => setMode('image')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              mode === 'image' ? 'bg-primary text-white' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
            data-testid="mode-image"
          >
            <Image size={16} strokeWidth={1.5} className="inline mr-2" />
            Image Gen
          </button>
          <button
            onClick={() => setMode('photo')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              mode === 'photo' ? 'bg-primary text-white' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
            data-testid="mode-photo"
          >
            <Camera size={16} strokeWidth={1.5} className="inline mr-2" />
            Photo Search
          </button>
          <button
            onClick={() => setMode('deep_research')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              mode === 'deep_research' ? 'bg-primary text-white' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
            data-testid="mode-research"
          >
            <Search size={16} strokeWidth={1.5} className="inline mr-2" />
            Deep Research
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6" data-testid="messages-container">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <Sparkles size={48} strokeWidth={1.5} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Welcome to Ankit GPT 2.0</h2>
              <p className="text-slate-600">
                {mode === 'chat' && 'Start a conversation by typing a message'}
                {mode === 'image' && 'Describe an image you want to generate'}
                {mode === 'photo' && 'Upload a photo to analyze'}
                {mode === 'deep_research' && 'Ask a question for deep research'}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="max-w-4xl mx-auto">
          {mode === 'image' ? (
            <form onSubmit={handleGenerateImage} className="flex gap-2">
              <input
                type="text"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="flex-1 px-4 py-3 bg-muted rounded-full border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
                data-testid="image-prompt-input"
              />
              <button
                type="submit"
                disabled={loading || !imagePrompt.trim()}
                className="btn-primary flex items-center justify-center gap-2"
                data-testid="generate-image-button"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Image size={20} strokeWidth={1.5} />}
              </button>
            </form>
          ) : mode === 'photo' ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask a question about the photo (optional)..."
                className="flex-1 px-4 py-3 bg-muted rounded-full border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
                data-testid="photo-question-input"
              />
              <label className="btn-primary cursor-pointer flex items-center justify-center gap-2">
                <Camera size={20} strokeWidth={1.5} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={loading}
                  data-testid="photo-upload-input"
                />
              </label>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={mode === 'deep_research' ? 'Ask a research question...' : 'Type a message...'}
                className="flex-1 px-4 py-3 bg-muted rounded-full border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
                data-testid="chat-input"
              />
              <button
                type="button"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                className={`btn-secondary flex items-center justify-center gap-2 ${isRecording ? 'bg-destructive text-white' : ''}`}
                data-testid="voice-button"
              >
                {isRecording ? <StopCircle size={20} strokeWidth={1.5} /> : <Mic size={20} strokeWidth={1.5} />}
              </button>
              <button
                type="submit"
                disabled={loading || !inputText.trim()}
                className="btn-primary flex items-center justify-center gap-2"
                data-testid="send-message-button"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} strokeWidth={1.5} />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
