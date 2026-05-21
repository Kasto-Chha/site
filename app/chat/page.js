import { Suspense } from "react";

import ChatClient from "./ChatClient";

function ChatFallback() {
  return <div className="chat-page" />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatClient />
    </Suspense>
  );
}
