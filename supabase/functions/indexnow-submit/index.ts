import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireAdmin,
  httpErrorResponse,
  HttpError,
} from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // S-2 remediation candidate: admin-only. IndexNow submission is an
    // administrative SEO action; no shipped caller exists, so gating
    // breaks no authorized caller.
    await requireAdmin(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { path } = await req.json();

    if (!path) {
      return new Response(
        JSON.stringify({ success: false, error: "Path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get IndexNow config from app_settings
    const { data: config } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "indexnow")
      .maybeSingle();

    const indexNowConfig = config?.setting_value as { api_key?: string; host?: string } | null;

    if (!indexNowConfig?.api_key || !indexNowConfig?.host) {
      console.log("No IndexNow config found, skipping");
      return new Response(
        JSON.stringify({ success: false, skipped: true, message: "IndexNow not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullUrl = `https://${indexNowConfig.host}${path}`;
    console.log("Submitting to IndexNow:", fullUrl);

    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: indexNowConfig.host,
        key: indexNowConfig.api_key,
        keyLocation: `https://${indexNowConfig.host}/${indexNowConfig.api_key}.txt`,
        urlList: [fullUrl],
      }),
    });

    await response.text();
    console.log("IndexNow response status:", response.status);

    const success = response.status === 200 || response.status === 202;

    return new Response(
      JSON.stringify({ success, status: response.status, url: fullUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("IndexNow submission error:", err);
    if (err instanceof HttpError) return httpErrorResponse(err, corsHeaders);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
