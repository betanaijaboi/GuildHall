"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-20 text-center">
      <h1 className="h1">Something went wrong</h1>
      <p className="mt-2 text-fg-muted">{error.digest ? `Reference: ${error.digest}` : error.message}</p>
      <button onClick={reset} className="btn mt-4">Try again</button>
    </div>
  );
}
