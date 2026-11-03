import type { Metadata } from "next";
import "./globals.css";
import {QuestionIntentProvider} from "@/components/conversations/question-intent";

export const metadata: Metadata = {
  title: { default: "perplexity — Follow your curiosity", template: "%s · perplexity" },
  description: "A thoughtful place to ask questions, explore sources, and understand more.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><QuestionIntentProvider>{children}</QuestionIntentProvider></body></html>;
}
