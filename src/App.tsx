import { useEffect, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { SeoHead } from "@/components/seo/SeoHead";
import Index from "./pages/Index";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { AdminProvider } from "./contexts/AdminContext";
import { GlobalConfigProvider, useGlobalConfig } from "./context/GlobalConfigContext";
import { usePushTokenRegistration } from "@/hooks/usePushTokenRegistration";
import { useWebPushRegistration } from "@/hooks/useWebPushRegistration";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useQuizReminder } from "@/hooks/useQuizReminder";
import { useMobileAdsInit } from "@/hooks/useMobileAds";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import PageSkeleton from "@/components/PageSkeleton";
import CookieConsentBanner from "./components/CookieConsentBanner";

// Lazy load non-critical routes
const NotFound = lazy(() => import("./pages/NotFound"));
const NamesPage = lazy(() => import("./pages/NamesPage"));
const BabyNameDetailPage = lazy(() => import("./pages/BabyNameDetailPage"));
const QiblaPage = lazy(() => import("./pages/QiblaPage"));
const TasbihPage = lazy(() => import("./pages/TasbihPage"));
const DuaPage = lazy(() => import("./pages/DuaPage"));
const DuaDetailPage = lazy(() => import("./pages/dua/DuaDetailPage"));
const DuaCategoryPage = lazy(() => import("./pages/dua/DuaCategoryPage"));
const QuranPage = lazy(() => import("./pages/QuranPage"));
const NamesOfAllahPage = lazy(() => import("./pages/NamesOfAllahPage"));
const AllahNameDetailPage = lazy(() => import("./pages/AllahNameDetailPage"));
const PrayerTimesPage = lazy(() => import("./pages/PrayerTimesPage"));
const BukhariLanguageSelectPage = lazy(() => import("./pages/bukhari/BukhariLanguageSelectPage"));
const BukhariLangPage = lazy(() => import("./pages/bukhari/BukhariLangPage"));
const HadithPage = lazy(() => import("./pages/HadithPage"));
const HadithBookPlaceholder = lazy(() => import("./pages/hadith/HadithBookPlaceholder"));
const HadithDetailPage = lazy(() => import("./pages/hadith/HadithDetailPage"));
const IslamicCalendarPage = lazy(() => import("./pages/IslamicCalendarPage"));
// Demo routes are gated behind VITE_ENABLE_DEMO_ROUTES (default off).
// The local preview build sets it to "true"; the production build leaves
// it unset, so the bundler drops these imports and no demo chunk ships.
// Vite replaces import.meta.env.* at build time, so the false branch is
// eliminated statically. NOTE: the demo files must still exist in the
// repo — the bundler resolves the imports before dropping the dead
// branch — they just never ship in the production output.
const DEMO_ROUTES_ENABLED =
  import.meta.env.VITE_ENABLE_DEMO_ROUTES === "true";
const DemoDisabled = () => null;
const DemoDailyContentPage = DEMO_ROUTES_ENABLED
  ? lazy(() => import("./pages/demo/DemoDailyContent"))
  : DemoDisabled;
const VisualEngineDemoPage = DEMO_ROUTES_ENABLED
  ? lazy(() => import("./pages/demo/VisualEngineDemo"))
  : DemoDisabled;
const EnginesDemoPage = DEMO_ROUTES_ENABLED
  ? lazy(() => import("./pages/demo/EnginesDemo"))
  : DemoDisabled;
const ReviewDecisionPacketPage = DEMO_ROUTES_ENABLED
  ? lazy(() => import("./pages/demo/ReviewDecisionPacket"))
  : DemoDisabled;
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const BackendStatusPage = lazy(() => import("./pages/BackendStatusPage"));
const QuizPage = lazy(() => import("./pages/QuizPage"));
const QuizDetailPage = lazy(() => import("./pages/QuizDetailPage"));
const PrayerGuidePage = lazy(() => import("./pages/PrayerGuidePage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const IslamicAppPage = lazy(() => import("./pages/IslamicAppPage"));
const SitemapPage = lazy(() => import("./pages/SitemapPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const StoriesPage = lazy(() => import("./pages/StoriesPage"));
const StoryDetailPage = lazy(() => import("./pages/StoryDetailPage"));
const StoryCategoryPage = lazy(() => import("./pages/StoryCategoryPage"));
const DataSourcesPage = lazy(() => import("./pages/DataSourcesPage"));

// Admin Routes
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminContentWorkflowPage = lazy(() => import("./pages/admin/AdminContentWorkflow"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAudit"));
const AdminMonetization = lazy(() => import("./pages/admin/AdminMonetization"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminNotificationsHistory = lazy(() => import("./pages/admin/AdminNotificationsHistory"));
const AdminNotificationsDiagnostics = lazy(() => import("./pages/admin/AdminNotificationsDiagnostics"));
const AdminOccasions = lazy(() => import("./pages/admin/AdminOccasions"));
const AdminMedia = lazy(() => import("./pages/admin/AdminMedia"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminAds = lazy(() => import("./pages/admin/AdminAds"));
const AdminLayoutControl = lazy(() => import("./pages/admin/AdminLayoutControl"));
const AdminSeoPage = lazy(() => import("./pages/admin/AdminSeo"));
const AdminPageBuilder = lazy(() => import("./pages/admin/AdminPageBuilder"));
const AdminQuiz = lazy(() => import("./pages/admin/AdminQuiz"));
const AdminSplashScreens = lazy(() => import("./pages/admin/AdminSplashScreens"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminFinance = lazy(() => import("./pages/admin/AdminFinance"));
const AdminSchedulers = lazy(() => import("./pages/admin/AdminSchedulers"));
const AdminDailyContent = lazy(() => import("./pages/admin/AdminDailyContent"));

const queryClient = new QueryClient();

const LoadingFallback = ({ pathname }: { pathname: string }) => <PageSkeleton pathname={pathname} />;

const AppRoutes = () => {
  usePageTracking();
  const location = useLocation();
  return (
    <>
      <SeoHead />
      <AnnouncementTicker />
      <Suspense fallback={<LoadingFallback pathname={location.pathname} />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/baby-names" element={<NamesPage />} />
          <Route path="/baby-names/:slug" element={<BabyNameDetailPage />} />
          <Route path="/names" element={<Navigate to="/baby-names" replace />} />
          <Route path="/qibla" element={<QiblaPage />} />
          <Route path="/tasbih" element={<TasbihPage />} />
          <Route path="/dua" element={<DuaPage />} />
          <Route path="/dua/category/:slug" element={<DuaCategoryPage />} />
          <Route path="/dua/:slug" element={<DuaDetailPage />} />
          <Route path="/quran" element={<QuranPage />} />
          <Route path="/quran/:surahId" element={<QuranPage />} />
          <Route path="/quran/:surahId/:ayahId" element={<QuranPage />} />
          <Route path="/99-names" element={<NamesOfAllahPage />} />
          <Route path="/99-names/:slug" element={<AllahNameDetailPage />} />
          <Route path="/prayer-times" element={<PrayerTimesPage />} />

          {/* Hadith routes */}
          <Route path="/hadith" element={<HadithPage />} />
          <Route path="/hadith/sahih-bukhari" element={<BukhariLanguageSelectPage />} />
          <Route path="/hadith/sahih-bukhari/:lang" element={<BukhariLangPage />} />
          <Route path="/hadith/sahih-bukhari/:lang/:chapterSlug" element={<BukhariLangPage />} />
          <Route path="/hadith/sahih-bukhari/:lang/:chapterId/:hadithNumber" element={<BukhariLangPage />} />
          <Route path="/hadith/h/:slug" element={<HadithDetailPage />} />
          <Route path="/hadith/:bookId" element={<HadithBookPlaceholder />} />

          <Route path="/calendar" element={<IslamicCalendarPage />} />
          {/* Local demo preview only — gated behind VITE_ENABLE_DEMO_ROUTES
              (default off). Never linked from the app; never in the
              production bundle unless the flag is set at build time. */}
          {DEMO_ROUTES_ENABLED && (
            <>
              <Route path="/demo/daily-content" element={<DemoDailyContentPage />} />
              <Route path="/demo/daily-content/visuals" element={<VisualEngineDemoPage />} />
              <Route path="/demo/daily-content/engines" element={<EnginesDemoPage />} />
              <Route path="/demo/daily-content/review" element={<ReviewDecisionPacketPage />} />
            </>
          )}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/quiz/:id" element={<QuizDetailPage />} />
          <Route path="/prayer-guide" element={<PrayerGuidePage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/islamic-app" element={<IslamicAppPage />} />
          <Route path="/sitemap" element={<SitemapPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/sources" element={<DataSourcesPage />} />

          {/* Islamic Stories */}
          <Route path="/stories" element={<StoriesPage />} />
          <Route path="/stories/category/:category" element={<StoryCategoryPage />} />
          <Route path="/stories/:slug" element={<StoryDetailPage />} />
          <Route path="/stories/:slug/trailer" element={<StoryDetailPage />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
          <Route path="/admin/dashboard" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
          <Route path="/admin/users" element={<AdminLayout><AdminUsers /></AdminLayout>} />
          <Route path="/admin/messages" element={<AdminLayout><AdminMessages /></AdminLayout>} />
          <Route path="/admin/occasions" element={<AdminLayout><AdminOccasions /></AdminLayout>} />
          <Route path="/admin/content" element={<AdminLayout><AdminContent /></AdminLayout>} />
          <Route path="/admin/content/:id/workflow" element={<AdminLayout><AdminContentWorkflowPage /></AdminLayout>} />
          <Route path="/admin/quiz" element={<AdminLayout><AdminQuiz /></AdminLayout>} />
          <Route path="/admin/ads" element={<AdminLayout><AdminAds /></AdminLayout>} />
          <Route path="/admin/reports" element={<AdminLayout><AdminReports /></AdminLayout>} />
          <Route path="/admin/finance" element={<AdminLayout><AdminFinance /></AdminLayout>} />
          <Route path="/admin/monetization" element={<AdminLayout><AdminMonetization /></AdminLayout>} />
          <Route path="/admin/notifications" element={<AdminLayout><AdminNotifications /></AdminLayout>} />
          <Route path="/admin/notifications/history" element={<AdminLayout><AdminNotificationsHistory /></AdminLayout>} />
          <Route path="/admin/notifications/diagnostics" element={<AdminLayout><AdminNotificationsDiagnostics /></AdminLayout>} />
          <Route path="/admin/media" element={<AdminLayout><AdminMedia /></AdminLayout>} />
          <Route path="/admin/analytics" element={<AdminLayout><AdminAnalytics /></AdminLayout>} />
          <Route path="/admin/layout" element={<AdminLayout><AdminLayoutControl /></AdminLayout>} />
          <Route path="/admin/page-builder" element={<AdminLayout><AdminPageBuilder /></AdminLayout>} />
          <Route path="/admin/seo" element={<AdminLayout><AdminSeoPage /></AdminLayout>} />
          <Route path="/admin/settings" element={<AdminLayout><AdminSettings /></AdminLayout>} />
          <Route path="/admin/splash-screens" element={<AdminLayout><AdminSplashScreens /></AdminLayout>} />
          <Route path="/admin/security" element={<AdminLayout><AdminSecurity /></AdminLayout>} />
          <Route path="/admin/security/backend-status" element={<AdminLayout><BackendStatusPage /></AdminLayout>} />
          <Route path="/admin/scheduler" element={<AdminLayout><AdminSchedulers /></AdminLayout>} />
          <Route path="/admin/daily-content" element={<AdminLayout><AdminDailyContent /></AdminLayout>} />
          <Route path="/admin/audit" element={<AdminLayout><AdminAuditPage /></AdminLayout>} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

const AdSenseLoader = () => {
  const { system } = useGlobalConfig();
  useEffect(() => {
    const pubId = system.adsensePublisherId;
    if (!pubId || !system.showAds) return;
    import("@/lib/adsense").then(({ loadAdSense }) => loadAdSense(pubId));
  }, [system.adsensePublisherId, system.showAds]);
  return null;
};

const AppInner = () => {
  usePushTokenRegistration();
  useWebPushRegistration();
  useQuizReminder();
  useMobileAdsInit();

  return (
    <>
      <AdSenseLoader />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
        <CookieConsentBanner />
      </BrowserRouter>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminProvider>
          <GlobalConfigProvider>
            <AppSettingsProvider>
              <AppInner />
            </AppSettingsProvider>
          </GlobalConfigProvider>
        </AdminProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
