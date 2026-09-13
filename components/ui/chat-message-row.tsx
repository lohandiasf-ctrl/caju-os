import type { ReactNode } from "react";

export function ChatMessageRow({
  mine,
  grouped,
  animate,
  children,
}: {
  mine: boolean;
  grouped: boolean;
  animate: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`chat-message-row flex ${animate ? "chat-message-row--enter" : ""} ${grouped ? "mt-0.5" : "mt-3"} ${mine ? "justify-end" : "justify-start"}`}
    >
      {children}
    </div>
  );
}

export function ChatTypingIndicator({ name }: { name: string }) {
  return (
    <output className="chat-typing-row mt-3 flex items-end gap-2" aria-label={`${name} está digitando`}>
      <span className="chat-typing-bubble" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="text-xs text-muted-foreground">{name} está digitando</span>
    </output>
  );
}
