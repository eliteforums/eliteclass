import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParentCredentialEmailRequest {
  parent_name: string;
  parent_email: string;
  parent_temporary_password: string;
  student_name: string;
  institute_name: string;
  portal_url: string;
}

function validatePayload(payload: ParentCredentialEmailRequest): string | null {
  if (!payload.parent_name?.trim()) return "parent_name is required.";
  if (!payload.parent_email?.trim()) return "parent_email is required.";
  if (!payload.parent_temporary_password?.trim()) return "parent_temporary_password is required.";
  if (!payload.student_name?.trim()) return "student_name is required.";
  if (!payload.institute_name?.trim()) return "institute_name is required.";
  if (!payload.portal_url?.trim()) return "portal_url is required.";
  return null;
}

function renderParentCredentialEmail(payload: ParentCredentialEmailRequest) {
  const firstName = payload.parent_name.trim().split(/\s+/)[0] ?? "Parent";

  return {
    subject: "Parent Portal Login Credentials",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 620px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">Welcome to ${payload.institute_name}</h2>
        <p style="margin-top: 0;">Hello ${firstName},</p>
        <p>Your parent portal account has been created successfully for <strong>${payload.student_name}</strong>.</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Login URL:</strong> <a href="${payload.portal_url}">${payload.portal_url}</a></p>
          <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${payload.parent_email}</p>
          <p style="margin: 0;"><strong>Temporary Password:</strong> ${payload.parent_temporary_password}</p>
        </div>

        <p><strong>Important Security Instructions</strong></p>
        <ul>
          <li>Sign in immediately and change your password.</li>
          <li>Do not share your credentials with others.</li>
          <li>If you did not expect this email, contact your institute admin.</li>
        </ul>

        <p>In the portal you can access attendance, fee records, homework, progress reports, teacher remarks, and child analytics.</p>
        <p style="margin-top: 18px;">Regards,<br/>${payload.institute_name}</p>
      </div>
    `,
    text: [
      `Welcome to ${payload.institute_name}`,
      `Hello ${firstName},`,
      ``,
      `Your parent portal account has been created for ${payload.student_name}.`,
      ``,
      `Login URL: ${payload.portal_url}`,
      `Email: ${payload.parent_email}`,
      `Temporary Password: ${payload.parent_temporary_password}`,
      ``,
      `Security: Please sign in and change your password on first login.`,
    ].join("\n"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    // Resend trial accounts ONLY allow sending from onboarding@resend.dev
    // and ONLY to the email address associated with the Resend account.
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ success: false, error: "Supabase environment variables are missing." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resendApiKey) {
      return new Response(JSON.stringify({ success: false, error: "RESEND_API_KEY is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ParentCredentialEmailRequest;
    const validationError = validatePayload(body);
    if (validationError) {
      return new Response(JSON.stringify({ success: false, error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized caller." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: callerError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || !callerProfile) {
      return new Response(JSON.stringify({ success: false, error: "Caller profile lookup failed." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (callerProfile.role !== "admin" && callerProfile.role !== "super_admin") {
      return new Response(JSON.stringify({ success: false, error: "Only admins can send parent credentials." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const template = renderParentCredentialEmail(body);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [body.parent_email],
        subject: template.subject,
        html: template.html,
        text: template.text,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      return new Response(JSON.stringify({ success: false, error: `Resend error: ${resendError}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected edge function error.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
