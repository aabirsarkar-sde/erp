"use client";
import { useActionState, useState } from "react";
import { submitFeedback } from "@/app/actions/public";

export function FeedbackForm({ token, done }: { token: string; done: boolean }) {
  const [state, action, pending] = useActionState(submitFeedback.bind(null, token), undefined);
  const [score, setScore] = useState(0);
  if (state?.ok || done) return <p className="text-center text-sm font-medium text-emerald-700">Thank you for your feedback! 🙏</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="score" value={score} />
      <div className="flex justify-center gap-2 text-4xl">
        {[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" onClick={() => setScore(i)} className={i <= score ? "text-amber-400" : "text-slate-200 hover:text-amber-200"} aria-label={`${i} stars`}>★</button>)}
      </div>
      <textarea name="comment" rows={3} className="input" placeholder="Anything we could do better? (optional)" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending || !score} className="btn-primary w-full">Send feedback</button>
    </form>
  );
}
