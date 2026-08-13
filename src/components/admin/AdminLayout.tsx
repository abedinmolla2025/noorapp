import React from 'react';
import { AdminSidebar } from './AdminSidebar';
import { ProtectedRoute } from './ProtectedRoute';
import ErrorBoundary from '../ErrorBoundary';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AdminBottomNavigation } from './AdminBottomNavigation';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const pageTitleFromPath = (pathname: string) => {
  if (pathname.startsWith('/admin/users')) return 'Users';
  if (pathname.startsWith('/admin/content')) return 'Content';
  if (pathname.startsWith('/admin/splash-screens')) return 'Splash Screens';
  if (pathname.startsWith('/admin/notifications')) return 'Notifications';
  if (pathname.startsWith('/admin/analytics') || pathname.startsWith('/admin/reports')) return 'Reports';
  if (pathname.startsWith('/admin/layout')) return 'Layout';
  if (pathname.startsWith('/admin/seo')) return 'SEO';
  if (pathname.startsWith('/admin/ads')) return 'Ads';
  if (pathname.startsWith('/admin/finance') || pathname.startsWith('/admin/monetization')) return 'Finance';
  if (pathname.startsWith('/admin/audit')) return 'Audit';
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  if (pathname.startsWith('/admin/security')) return 'Security';
  return 'Dashboard';
};

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation();
  const pageTitle = pageTitleFromPath(location.pathname);

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <ProtectedRoute>
      <div className="admin-compact flex min-h-screen w-full bg-background">
        <a
          href="#admin-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AdminSidebar />
        </div>

        <main className="min-w-0 flex-1 overflow-auto">
          {/* Mobile top app bar */}
          <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                NOOR Admin
              </p>
              <h1 className="truncate text-sm font-semibold leading-tight">{pageTitle}</h1>
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Open admin menu"
                  className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-r border-border p-0">
                <AdminSidebar showQuickShortcuts onNavigate={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>

          {/* Content padding includes mobile bottom-tab safe area */}
          <div
            id="admin-content"
            className="container mx-auto px-3 py-4 pb-24 sm:px-4 sm:py-6 md:pb-6 lg:px-6"
          >
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>

          <AdminBottomNavigation />
        </main>
      </div>
    </ProtectedRoute>
  );
};

