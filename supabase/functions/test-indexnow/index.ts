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
     // S-2 remediation candidate: admin-only. This is an admin
     // diagnostic tool; no shipped caller exists, so gating breaks no
     // authorized caller.
     await requireAdmin(req);
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseAnonKey);
 
     const { api_key, host } = await req.json();
 
     if (!api_key || !host) {
       return new Response(
         JSON.stringify({ success: false, error: "API key and host are required" }),
         {
           status: 400,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     console.log("Testing IndexNow API key for host:", host);
 
     // Test IndexNow API with a dummy URL
     const testUrl = `https://${host}/`;
     const indexNowUrl = "https://api.indexnow.org/indexnow";
 
     const response = await fetch(indexNowUrl, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         host: host,
         key: api_key,
         keyLocation: `https://${host}/${api_key}.txt`,
         urlList: [testUrl],
       }),
     });
 
     await response.text(); // Consume response
 
     console.log("IndexNow test response status:", response.status);
 
     // 200 or 202 means success
     const success = response.status === 200 || response.status === 202;
 
     return new Response(
       JSON.stringify({
         success,
         status: response.status,
         message: success
           ? "IndexNow API key is valid"
           : `Failed with status ${response.status}`,
       }),
       {
         headers: {
           ...corsHeaders,
           "Content-Type": "application/json",
         },
       }
     );
   } catch (err) {
     console.error("IndexNow test error:", err);
     if (err instanceof HttpError) return httpErrorResponse(err, corsHeaders);
     return new Response(
       JSON.stringify({
         success: false,
         error: err instanceof Error ? err.message : "Unknown error",
       }),
       {
         status: 500,
         headers: {
           ...corsHeaders,
           "Content-Type": "application/json",
         },
       }
     );
   }
 });