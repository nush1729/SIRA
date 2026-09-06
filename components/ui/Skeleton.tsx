export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-zinc-100 ${className}`} />;
}
export function LoadingState({ label = "Loading your interview…" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="space-y-6 py-4"><span className="sr-only">{label}</span><Skeleton className="h-12 w-12" /><Skeleton className="h-8 w-4/5" /><div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div><Skeleton className="h-32 w-full" /><Skeleton className="h-12 w-full" /></div>;
}
