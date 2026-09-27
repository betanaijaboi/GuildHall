"use client";

import { SendHorizontal } from "lucide-react";
import { useRef } from "react";

/** Message box: Enter sends, Shift+Enter adds a newline. Clears after sending. */
export function ChatComposer({
  action,
  channelId,
  threadRootId,
  placeholder,
}: {
  action: (form: FormData) => Promise<void>;
  channelId: string;
  threadRootId?: string;
  placeholder: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (form) => {
        await action(form);
        formRef.current?.reset();
      }}
      className="flex items-end gap-2"
    >
      <input type="hidden" name="channelId" value={channelId} />
      {threadRootId && <input type="hidden" name="threadRootId" value={threadRootId} />}
      <textarea
        name="body"
        required
        rows={1}
        maxLength={4000}
        placeholder={placeholder}
        className="input min-h-11 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <button className="btn h-11 w-11 shrink-0 p-0" aria-label="Send"><SendHorizontal size={18} /></button>
    </form>
  );
}
