import React from 'react';
import { MessageSquare, Plus, Trash2, X } from 'lucide-react';

function Sidebar({ conversations, currentConversation, onSelectConversation, onNewConversation, onDeleteConversation, isOpen, onClose }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const handleDelete = (e, conversationId) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) {
      onDeleteConversation(conversationId);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
          data-testid="sidebar-overlay"
        />
      )}
      
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-50
          w-72 bg-white border-r border-border
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        data-testid="conversations-sidebar"
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">Conversations</h2>
              <button
                onClick={onClose}
                className="lg:hidden p-1 hover:bg-secondary rounded"
                data-testid="close-sidebar-button"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <button
              onClick={() => {
                onNewConversation();
                onClose();
              }}
              className="btn-primary w-full flex items-center justify-center gap-2"
              data-testid="new-conversation-button"
            >
              <Plus size={16} strokeWidth={1.5} />
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.conversation_id}
                    onClick={() => onSelectConversation(conv)}
                    className={`
                      group flex items-start gap-3 p-3 rounded-lg cursor-pointer
                      transition-colors
                      ${currentConversation?.conversation_id === conv.conversation_id
                        ? 'bg-primary/10'
                        : 'hover:bg-secondary'
                      }
                    `}
                    data-testid={`conversation-item-${conv.conversation_id}`}
                  >
                    <MessageSquare size={16} strokeWidth={1.5} className="flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(conv.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, conv.conversation_id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-opacity"
                      data-testid={`delete-conversation-${conv.conversation_id}`}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;