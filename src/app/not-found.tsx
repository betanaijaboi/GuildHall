import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="h1">Not found</h1>
      <p className="mt-2 text-fg-muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="mt-4 inline-block link">Back home</Link>
    </div>
  );
}
