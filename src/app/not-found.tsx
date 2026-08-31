import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="not-found"><SearchX aria-hidden="true" /><h1>That portfolio record was not found</h1><p>It may have been removed or merged into another security.</p><Link className="primary-button" href="/">Return to overview</Link></main>;
}
