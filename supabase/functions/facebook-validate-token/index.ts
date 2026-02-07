import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v19.0";

interface TokenValidationResponse {
  valid: boolean;
  user?: {
    id: string;
    name: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  permissions?: string[];
  expiresAt?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { accessToken } = await req.json();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ valid: false, error: "Access token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Validating Facebook token...");

    // 1. Validate token and get user info
    const meResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );
    
    if (!meResponse.ok) {
      const errorData = await meResponse.json();
      console.error("Facebook API error:", errorData);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: errorData.error?.message || "Invalid access token" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await meResponse.json();
    console.log("User data retrieved:", { id: userData.id, name: userData.name });

    // 2. Get token debug info (expiration, scopes)
    const debugResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );
    
    let permissions: string[] = [];
    let expiresAt: string | undefined;

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      const tokenData = debugData.data;
      
      if (tokenData) {
        permissions = tokenData.scopes || [];
        if (tokenData.expires_at) {
          expiresAt = new Date(tokenData.expires_at * 1000).toISOString();
        }
      }
      console.log("Token permissions:", permissions);
    }

    const response: TokenValidationResponse = {
      valid: true,
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        picture: userData.picture,
      },
      permissions,
      expiresAt,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error validating token:", error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
