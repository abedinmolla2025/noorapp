import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // If it's a chunk load error, auto reload immediately
    const msg = error.message || "";
    if (
      msg.includes("Loading chunk") ||
      msg.includes("CSS_CHUNK_LOAD_FAILED") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    const msg = error.message || "";
    if (
      msg.includes("Loading chunk") ||
      msg.includes("CSS_CHUNK_LOAD_FAILED") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
      return;
    }
    
    // Log to Supabase (Best effort)
    try {
      const logError = async () => {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.from("app_logs" as any).insert({
          level: "error",
          message: error.message,
          metadata: {
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            userAgent: navigator.userAgent,
          }
        }).select();
      };
      logError();
    } catch (e) {
      // Ignore logging errors to prevent infinite loops
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[hsl(158,64%,12%)] text-white text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">দুঃখিত, একটি সমস্যা হয়েছে</h1>
          <p className="text-white/60 mb-8 max-w-md">
            অ্যাপটি লোড করতে গিয়ে একটি যান্ত্রিক ত্রুটি দেখা দিয়েছে। দয়া করে পেজটি রিফ্রেশ করুন অথবা হোম পেজে ফিরে যান।
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button 
              onClick={this.handleReload}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              রিফ্রেশ করুন
            </Button>
            <Button 
              onClick={this.handleGoHome}
              variant="outline"
              className="border-white/10 hover:bg-white/5 gap-2"
            >
              <Home className="w-4 h-4" />
              হোম পেজে যান
            </Button>
          </div>
          
          {process.env.NODE_ENV === "development" && (
            <div className="mt-12 p-4 bg-black/40 rounded-lg text-left overflow-auto max-w-2xl w-full">
              <p className="text-red-400 font-mono text-xs whitespace-pre-wrap">
                {this.state.error?.toString()}
              </p>
            </div>
          )}
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
