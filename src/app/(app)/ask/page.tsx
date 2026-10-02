import { Suspense } from "react";
import { requireUser } from "@/lib/core/auth";
import { aiEnabled } from "@/lib/ai/client";
import { AskChat } from "@/components/workspace/ask-chat";
import { Empty } from "@/components/ui/ui";

export const metadata = { title: "Ask AI" };

export default async function AskPage() {
  const me = await requireUser();
  if (!aiEnabled()) return <div className="mx-auto max-w-xl pt-10"><Empty title="AI isn't set up yet" hint="Add a free Gemini API key as AI_API_KEY in .env (see README), then restart." /></div>;
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense><AskChat name={me.name} crm={me.crmAccess !== "none"} hd={me.hdAccess !== "none"} /></Suspense>
    </div>
  );
}
