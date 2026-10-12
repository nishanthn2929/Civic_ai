import React, { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, CircleHelp, LoaderCircle, MapPinned, Mic, Send, ShieldCheck, X } from 'lucide-react';
import { chatService } from '../services/api';

const starterMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'I can help you file a civic report, understand photo location sources, or find the right BBMP workflow.'
  }
];

const quickActions = [
  { label: 'Report a pothole', prompt: 'How do I report a pothole?', tab: 'report' },
  { label: 'Use voice mode', prompt: 'How does Voice AI work?', tab: 'voice' },
  { label: 'Photo location', prompt: 'How is my photo location found?' },
  { label: 'Track a report', prompt: 'Where can I track my report?', tab: 'my_reports' }
];

export default function CivicAssistant({ setActiveTab, currentUser, activeTab }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(starterMessages);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef(null);

  useEffect(() => {
    if (open && messagesRef.current) {
      requestAnimationFrame(() => {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      });
    }
  }, [messages, open]);

  const submit = async (value = input) => {
    const text = value.trim();
    if (!text || isSending) return;
    setError('');
    setInput('');
    const nextMessages = [...messages, { id: `${Date.now()}-user`, role: 'user', text }];
    setMessages(nextMessages);
    setIsSending(true);
    try {
      const response = await chatService.send(nextMessages.map(({ role, text: content }) => ({ role, content })), { active_tab: activeTab });
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: 'assistant', text: response.message }]);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Real AI chat is unavailable. Check the backend AI configuration.');
    } finally {
      setIsSending(false);
    }
  };

  const navigate = (tab) => {
    if (tab === 'my_reports' && !currentUser) {
      submit('How do I track a report?');
      return;
    }
    setActiveTab(tab);
    setOpen(false);
  };

  return (
    <div className="civic-assistant" aria-live="polite">
      {open && (
        <section className="civic-assistant-panel" aria-label="CivicAI assistant">
          <header className="civic-assistant-header">
            <div className="civic-assistant-identity">
              <div className="civic-assistant-mark"><Bot className="h-4 w-4" /></div>
              <div><strong>CivicAI Concierge</strong><span><i /> Online guidance</span></div>
            </div>
            <button type="button" className="civic-icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X className="h-4 w-4" /></button>
          </header>
          <div ref={messagesRef} className="civic-assistant-messages">
            {messages.map((message) => (
              <div key={message.id} className={`civic-message ${message.role}`}>
                {message.role === 'assistant' && <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                <p>{message.text}</p>
              </div>
            ))}
            {isSending && <div className="civic-message assistant"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-emerald-300" /><p>Consulting CivicAI...</p></div>}
            {error && <div className="civic-assistant-error">{error}</div>}
          </div>
          <div className="civic-assistant-actions">
            {quickActions.map((action) => (
              <button key={action.label} type="button" onClick={() => action.tab ? navigate(action.tab) : submit(action.prompt)}>
                {action.tab === 'voice' ? <Mic className="h-3 w-3" /> : action.tab === 'report' ? <MapPinned className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {action.label}
              </button>
            ))}
          </div>
          <form className="civic-assistant-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about civic reporting..." aria-label="Ask CivicAI" />
            <button type="submit" aria-label="Send message"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}
      <button type="button" className={`civic-assistant-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Open CivicAI assistant">
        {open ? <ChevronDown className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        <span>{open ? 'Close' : 'Ask CivicAI'}</span>
      </button>
    </div>
  );
}
