import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ArrowLeft, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BottomNavigation from "@/components/BottomNavigation";
import { useInAppNotifications } from "@/hooks/useInAppNotifications";

const READ_KEY = "noor_notifications_read";

function getReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function setReadSet(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids).slice(0, 500)));
  } catch {
    // ignore
  }
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const notificationsQuery = useInAppNotifications();

  const readSet = useMemo(() => getReadSet(), []);

  const items = notificationsQuery.data ?? [];

  const unreadCount = items.filter((n) => !readSet.has(n.id)).length;

  const markAllRead = () => {
    const next = new Set(readSet);
    items.forEach((n) => next.add(n.id));
    setReadSet(next);
    navigate(0);
  };

  return (
    <>
      <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold">Notifications</h1>
              <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <Check className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-5">
        {notificationsQuery.isLoading ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Admin announcements will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          items.map((n) => {
            const isRead = readSet.has(n.id);
            const time = n.scheduled_at ?? n.sent_at ?? n.created_at;

            return (
              <Card key={n.id} className={isRead ? "opacity-80" : "border-primary/40"}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate">{n.title}</span>
                    {!isRead ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        NEW
                      </span>
                    ) : null}
                  </CardTitle>
                  {time ? (
                    <p className="text-[11px] text-muted-foreground">{new Date(time).toLocaleString()}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{n.message}</p>
                  {!isRead ? (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const next = new Set(readSet);
                          next.add(n.id);
                          setReadSet(next);
                          navigate(0);
                        }}
                      >
                        Mark read
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      <BottomNavigation />
    </div>
    </>
  );
}
