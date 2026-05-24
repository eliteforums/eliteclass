// ---------------------------------------------------------------------------
// EduOS — Email Service
//
// Handles professional email delivery for the platform.
// Uses Resend API via Fetch for lightweight, production-ready delivery.
// ---------------------------------------------------------------------------

import type { ApiResponse } from "@/types";

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const APP_URL = import.meta.env.VITE_APP_URL || "http://localhost:5173";
const APP_NAME = import.meta.env.VITE_APP_NAME || "EduOS";

interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a professional email via Resend.
 * Fallbacks to console.log in development if no API key is provided.
 */
async function sendEmail(payload: SendEmailPayload): Promise<ApiResponse<null>> {
  if (!RESEND_API_KEY) {
    if (import.meta.env.DEV) {
      console.log("----------------------------------------------------------");
      console.log(`[EMAIL MOCK] To: ${payload.to}`);
      console.log(`[EMAIL MOCK] Subject: ${payload.subject}`);
      console.log(`[EMAIL MOCK] Content: ${payload.html}`);
      console.log("----------------------------------------------------------");
      return { data: null, error: null, success: true };
    }
    return {
      data: null,
      error: "Email service not configured (RESEND_API_KEY missing).",
      success: false,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${APP_NAME} <onboarding@resend.dev>`, // Replace with your verified domain
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send email");
    }

    return { data: null, error: null, success: true };
  } catch (err) {
    console.error("[EmailService] Error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unexpected email delivery failure.",
      success: false,
    };
  }
}

/**
 * Send welcome email to a new parent with both their credentials AND the student's credentials.
 */
export async function sendParentWelcomeEmail(payload: {
  parentName: string;
  parentEmail: string;
  parentPassword?: string;
  studentName: string;
  studentEmail: string;
  studentPassword?: string;
}): Promise<ApiResponse<null>> {
  const subject = "Admission Successful — Student & Parent Portal Credentials";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
      <h2 style="color: #2563eb; margin-bottom: 20px;">Welcome to ${APP_NAME}!</h2>
      <p>Dear ${payload.parentName},</p>
      <p>Admission for <strong>${payload.studentName}</strong> has been successfully completed. Below are the login credentials for both the Parent and Student portals.</p>
      
      <!-- Parent Section -->
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <h3 style="margin-top: 0; font-size: 16px; color: #2563eb; text-transform: uppercase;">Parent Portal Credentials</h3>
        <p style="margin-bottom: 5px;"><strong>Email:</strong> ${payload.parentEmail}</p>
        ${payload.parentPassword ? `<p style="margin-top: 0;"><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 2px 4px; border-radius: 4px;">${payload.parentPassword}</code></p>` : `<p style="margin-top: 0; font-style: italic; font-size: 13px;">Linked to your existing parent account.</p>`}
        <div style="margin-top: 15px;">
          <a href="${APP_URL}/auth/login" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Login to Parent Portal</a>
        </div>
      </div>

      <!-- Student Section -->
      <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
        <h3 style="margin-top: 0; font-size: 16px; color: #0ea5e9; text-transform: uppercase;">Student Portal Credentials</h3>
        <p style="margin-bottom: 5px;"><strong>Email:</strong> ${payload.studentEmail}</p>
        <p style="margin-top: 0;"><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 2px 4px; border-radius: 4px;">${payload.studentPassword}</code></p>
        <div style="margin-top: 15px;">
          <a href="${APP_URL}/auth/login" style="color: #0ea5e9; font-weight: bold; text-decoration: underline;">Login to Student Portal</a>
        </div>
      </div>
      
      <p style="font-size: 14px; margin-top: 30px;"><strong>Important:</strong> Please change your passwords immediately after the first login for security reasons.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      
      <p style="font-size: 12px; color: #6b7280; text-align: center;">
        This is an automated message from ${APP_NAME}. Please do not reply to this email.
      </p>
    </div>
  `;

  return sendEmail({ to: payload.parentEmail, subject, html });
}
