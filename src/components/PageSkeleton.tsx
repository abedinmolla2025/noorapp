import React from "react";

type SkeletonVariant = "home" | "list" | "reader" | "story" | "tool" | "admin";

interface PageSkeletonProps {
  pathname?: string;
}

const Block = ({ className = "" }: { className?: string }) => (
  <div aria-hidden="true" className={`noor-skeleton-shimmer rounded-2xl ${className}`} />
);

const HeaderSkeleton = ({ admin = false }: { admin?: boolean }) => (
  <div className="flex items-center justify-between gap-4 px-1 py-2">
    <div className="flex items-center gap-3 min-w-0">
      <Block className="h-11 w-11 shrink-0 rounded-2xl" />
      <div className="space-y-2 min-w-0">
        <Block className={`h-4 ${admin ? "w-28" : "w-32"}`} />
        <Block className="h-3 w-20 rounded-full" />
      </div>
    </div>
    <Block className="h-10 w-10 shrink-0 rounded-full" />
  </div>
);

const BottomNavSkeleton = () => (
  <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl border-t border-border/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
    <div className="grid grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <Block className="h-7 w-7 rounded-xl" />
          <Block className="h-2.5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

const CategoryRow = () => (
  <div className="flex gap-2 overflow-hidden pb-1">
    {Array.from({ length: 4 }).map((_, index) => (
      <Block key={index} className={`h-9 shrink-0 rounded-full ${index === 0 ? "w-24" : "w-20"}`} />
    ))}
  </div>
);

const CardList = ({ count = 4, tall = false }: { count?: number; tall?: boolean }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="rounded-3xl border border-border/50 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Block className="h-12 w-12 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Block className="h-4 w-3/4" />
            <Block className="h-3 w-1/2 rounded-full" />
            {tall && <Block className="h-14 w-full rounded-xl" />}
          </div>
        </div>
      </div>
    ))}
  </div>
);

const HomeSkeleton = () => (
  <>
    <HeaderSkeleton />
    <div className="mt-5 space-y-4">
      <Block className="h-44 w-full rounded-[2rem]" />
      <div className="grid grid-cols-2 gap-3">
        <Block className="h-24 w-full rounded-3xl" />
        <Block className="h-24 w-full rounded-3xl" />
      </div>
      <Block className="h-28 w-full rounded-3xl" />
      <CardList count={2} />
    </div>
  </>
);

const ListSkeleton = () => (
  <>
    <HeaderSkeleton />
    <div className="mt-5 space-y-4">
      <Block className="h-12 w-full rounded-2xl" />
      <CategoryRow />
      <CardList count={4} tall />
    </div>
  </>
);

const ReaderSkeleton = () => (
  <>
    <HeaderSkeleton />
    <div className="mt-5 space-y-4">
      <Block className="h-24 w-full rounded-3xl" />
      <Block className="h-10 w-2/3 rounded-xl" />
      <div className="rounded-[2rem] border border-border/50 bg-card p-5 shadow-sm">
        <Block className="mx-auto h-20 w-4/5 rounded-2xl" />
        <div className="mt-6 space-y-3">
          <Block className="h-4 w-full rounded-full" />
          <Block className="h-4 w-11/12 rounded-full" />
          <Block className="h-4 w-4/5 rounded-full" />
          <Block className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  </>
);

const StorySkeleton = () => (
  <>
    <HeaderSkeleton />
    <div className="mt-5 space-y-4">
      <Block className="h-52 w-full rounded-[2rem]" />
      <Block className="h-7 w-3/4 rounded-xl" />
      <Block className="h-4 w-1/2 rounded-full" />
      <CardList count={3} tall />
    </div>
  </>
);

const ToolSkeleton = () => (
  <>
    <HeaderSkeleton />
    <div className="mt-5 space-y-4">
      <Block className="h-36 w-full rounded-[2rem]" />
      <div className="grid grid-cols-2 gap-3">
        <Block className="h-28 rounded-3xl" />
        <Block className="h-28 rounded-3xl" />
      </div>
      <CardList count={3} />
    </div>
  </>
);

const AdminSkeleton = () => (
  <>
    <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-4">
      <div className="space-y-2">
        <Block className="h-3 w-20 rounded-full" />
        <Block className="h-7 w-40 rounded-xl" />
      </div>
      <Block className="h-11 w-11 rounded-2xl" />
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <Block className="h-32 rounded-3xl" />
      <Block className="h-32 rounded-3xl" />
      <Block className="h-32 rounded-3xl" />
      <Block className="h-32 rounded-3xl" />
    </div>
    <div className="mt-5 space-y-3">
      <Block className="h-6 w-44 rounded-xl" />
      <CardList count={4} tall />
    </div>
  </>
);

function getVariant(pathname: string): SkeletonVariant {
  const path = pathname.toLowerCase();
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/quran") || path.startsWith("/hadith") || path.startsWith("/bukhari")) return "reader";
  if (path.startsWith("/dua") || path.startsWith("/names") || path.startsWith("/baby-names")) return "list";
  if (path.startsWith("/stories") || path.startsWith("/story")) return "story";
  if (["/qibla", "/tasbih", "/settings", "/calendar", "/prayer-times", "/prayer-guide"].some((prefix) => path.startsWith(prefix))) return "tool";
  return "home";
}

export default function PageSkeleton({ pathname = "/" }: PageSkeletonProps) {
  const variant = getVariant(pathname);
  return (
    <div className="min-h-screen bg-background px-4 pb-28 pt-5 text-foreground" role="status" aria-live="polite" aria-label="Loading page">
      <div className="mx-auto w-full max-w-2xl">
        {variant === "admin" && <AdminSkeleton />}
        {variant === "home" && <HomeSkeleton />}
        {variant === "list" && <ListSkeleton />}
        {variant === "reader" && <ReaderSkeleton />}
        {variant === "story" && <StorySkeleton />}
        {variant === "tool" && <ToolSkeleton />}
      </div>
      {variant !== "admin" && <BottomNavSkeleton />}
    </div>
  );
}
