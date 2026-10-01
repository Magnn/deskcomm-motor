"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkle, PaperPlaneTilt, UserCircle, Robot } from "@/lib/ui/icons";

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
}

interface WebchatPageProps {
  webchatId: string;
  brandColor?: string;
  title?: string;
  subtitle?: string;
  greetingMessage?: string;
}

export function WebchatView({
  webchatId,
  brandColor = "#0ea5e9",
  title = "Atendimento Deskcomm",
  subtitle = "Online agora",
  greetingMessage = "Olá! Como podemos te ajudar hoje?",
}: WebchatPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: greetingMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simula resposta automática do agente de IA após 1s
    setTimeout(() => {
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `Recebi sua mensagem: "${text}". Nosso assistente virtual está processando sua solicitação!`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background antialiased font-sans">
      {/* Header com cor da marca */}
      <header
        className="flex items-center justify-between px-4 py-3.5 text-white shadow-md select-none shrink-0"
        style={{ backgroundColor: brandColor }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold">
            <Sparkle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">{title}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
              <p className="text-[11px] text-white/90">{subtitle}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Lista de Mensagens */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-muted/20">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-xs"
                  style={{ backgroundColor: brandColor }}
                >
                  <Robot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                  isUser
                    ? "rounded-tr-xs text-white"
                    : "rounded-tl-xs bg-card border border-border text-foreground"
                }`}
                style={isUser ? { backgroundColor: brandColor } : {}}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <div
                  className={`mt-1 text-[10px] text-right ${
                    isUser ? "text-white/75" : "text-muted-foreground"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {isUser && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: brandColor }}
            >
              <Robot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-xs bg-card border border-border p-3 shadow-xs">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input de Mensagem */}
      <footer className="border-t border-border bg-card p-3 shrink-0">
        <div className="flex items-center gap-2">
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem... (Enter para enviar)"
            className="min-h-[40px] max-h-32 resize-none text-xs bg-muted/40 border-muted rounded-xl"
          />
          <Button
            size="icon"
            disabled={!input.trim() || isTyping}
            onClick={handleSend}
            className="h-10 w-10 shrink-0 text-white rounded-xl shadow-xs"
            style={{ backgroundColor: brandColor }}
          >
            <PaperPlaneTilt className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-1.5 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <span>Desenvolvido com</span>
          <span className="font-semibold text-foreground">Deskcomm</span>
        </div>
      </footer>
    </div>
  );
}
