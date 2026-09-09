"use client";

import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="not-found"><TriangleAlert aria-hidden="true" /><h1>Stance could not load this view</h1><p>Your data was not changed. Check that the local database is available, then try again.</p><button className="primary-button" onClick={reset} type="button">Try again</button></main>;
}
