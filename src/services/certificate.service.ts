// ---------------------------------------------------------------------------
// EliteClass — Certificate Service
//
// CRUD for certificate templates and issued certificates.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  ApiResponse,
  CertificateCustomData,
  CertificateTemplate,
  CreateCertificateTemplatePayload,
  IssuedCertificate,
  UpdateCertificateTemplatePayload,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Template CRUD ────────────────────────────────────────────────────────────

export async function createTemplate(
  payload: CreateCertificateTemplatePayload,
): Promise<ApiResponse<CertificateTemplate>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("certificate_templates")
    .insert(payload)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

export async function updateTemplate(
  templateId: string,
  payload: UpdateCertificateTemplatePayload,
): Promise<ApiResponse<CertificateTemplate>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("certificate_templates")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

export async function deleteTemplate(
  templateId: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("certificate_templates")
    .delete()
    .eq("id", templateId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

export async function getTemplatesByInstitute(
  instituteId: string,
): Promise<ApiResponse<CertificateTemplate[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("certificate_templates")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}

export async function getTemplateById(
  templateId: string,
): Promise<ApiResponse<CertificateTemplate>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("certificate_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── Issued Certificates ──────────────────────────────────────────────────────

export async function createIssuedCertificates(
  records: Array<{
    template_id: string;
    student_id: string;
    institute_id: string;
    issued_by: string;
    custom_data: CertificateCustomData;
  }>,
): Promise<ApiResponse<IssuedCertificate[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("issued_certificates")
    .insert(records)
    .select();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}

export async function getIssuedCertificatesByStudent(
  studentId: string,
  instituteId: string,
): Promise<ApiResponse<IssuedCertificate[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("issued_certificates")
    .select("*, template:certificate_templates(*)")
    .eq("student_id", studentId)
    .eq("institute_id", instituteId)
    .order("issued_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}
