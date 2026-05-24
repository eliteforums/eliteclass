// ---------------------------------------------------------------------------
// EduOS — LinkParentModal
//
// Modal dialog for linking an existing parent account to a student.
//
// Flow:
//  1. Admin types the parent's email and clicks "Find Parent"
//  2. If found:      parent card is shown → admin selects relation type → Link
//  3. If not found:  "not found" message with guidance is shown
//  4. Success state: confirmation banner, then auto-close
//
// The parent must already have an account in EduOS (registered as a parent)
// before they can be linked — this modal does NOT create parent accounts.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Search, Link2, UserCheck, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

import type { Parent, RelationType } from "@/types";
import { searchParentsByEmail, linkParentToStudent, checkParentStudentLink } from "@/services";
import { linkParentSchema } from "@/modules/parents/validations";

// ── Props ─────────────────────────────────────────────────────────────────────

interface LinkParentModalProps {
  /** The student to link the parent to. */
  studentId: string;
  /** Shown in the modal header and confirmation message. */
  studentName: string;
  /**
   * Institute ID used to scope the parent search.
   * Typically from `useAuthStore().user?.institute_id` in the parent component.
   */
  instituteId: string;
  /** Controls modal open/close. */
  isOpen: boolean;
  /** Called when the modal should close. */
  onClose: () => void;
  /** Called after the parent is successfully linked. */
  onSuccess: () => void;
}

// ── Relation type options ─────────────────────────────────────────────────────

const RELATION_OPTIONS: { value: RelationType; label: string }[] = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `LinkParentModal` — two-step parent linking dialog.
 *
 * Step 1 (Search): Admin enters a parent email and clicks "Find Parent".
 *   - Exact email match is highlighted; partial matches are listed below.
 *   - "Not found" guidance is shown if no parent has that email.
 *
 * Step 2 (Link): Admin selects relation type and clicks "Link Parent".
 *   - Duplicate link detection happens before the insert.
 *   - Success state is shown for 1.5 s before `onSuccess` is called.
 */
export function LinkParentModal({
  studentId,
  studentName,
  instituteId,
  isOpen,
  onClose,
  onSuccess,
}: LinkParentModalProps) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [foundParents, setFoundParents] = useState<Parent[]>([]);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [relationType, setRelationType] = useState<RelationType | "">("");
  const [relationError, setRelationError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Validate just the email field before searching. */
  function validateEmail(value: string): boolean {
    const result = linkParentSchema.shape.email.safeParse(value);
    if (!result.success) {
      setEmailError(result.error.errors[0]?.message ?? "Invalid email");
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function handleSearch() {
    if (!validateEmail(email)) return;

    setIsSearching(true);
    setSearchDone(false);
    setFoundParents([]);
    setSelectedParent(null);
    setRelationType("");
    setRelationError(null);
    setLinkError(null);

    const result = await searchParentsByEmail(instituteId, email);

    setIsSearching(false);
    setSearchDone(true);

    if (result.success && result.data && result.data.length > 0) {
      setFoundParents(result.data);
      // Auto-select the first exact email match if there is one.
      const exactMatch = result.data.find(
        (p) => p.user?.email?.toLowerCase() === email.toLowerCase().trim(),
      );
      setSelectedParent(exactMatch ?? result.data[0]);
    } else {
      setFoundParents([]);
      setSelectedParent(null);
    }
  }

  async function handleLink() {
    if (!selectedParent) return;

    // Validate relation type via schema.
    const result = linkParentSchema.safeParse({ email, relationType });
    if (!result.success) {
      const msg = result.error.flatten().fieldErrors.relationType?.[0];
      setRelationError(msg ?? "Please select a relation type");
      return;
    }
    setRelationError(null);
    setLinkError(null);
    setIsLinking(true);

    // Check for existing link before inserting to surface a friendly message.
    const alreadyLinked = await checkParentStudentLink(studentId, selectedParent.id);
    if (alreadyLinked) {
      setLinkError(
        `${selectedParent.user?.name ?? "This parent"} is already linked to ${studentName}.`,
      );
      setIsLinking(false);
      return;
    }

    const linkResult = await linkParentToStudent({
      student_id: studentId,
      parent_id: selectedParent.id,
      relation_type: relationType as RelationType,
    });

    setIsLinking(false);

    if (!linkResult.success) {
      setLinkError(linkResult.error ?? "Failed to link parent. Please try again.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      handleClose();
      onSuccess();
    }, 1500);
  }

  function handleClose() {
    if (isLinking) return;
    setEmail("");
    setEmailError(null);
    setSearchDone(false);
    setFoundParents([]);
    setSelectedParent(null);
    setRelationType("");
    setRelationError(null);
    setLinkError(null);
    setSuccess(false);
    onClose();
  }

  // ── Guard ────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-50 bg-black/50" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-parent-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card border border-border shadow-xl"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="link-parent-title" className="text-sm font-semibold text-foreground">
                Link Parent
              </h2>
              <p className="text-xs text-muted-foreground truncate max-w-56">{studentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="p-5 space-y-5">
          {/* ── Success state ────────────────────────────────────────────── */}
          {success ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2
                  className="h-7 w-7 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Parent linked!</p>
                <p className="text-xs text-muted-foreground">
                  {selectedParent?.user?.name ?? "The parent"} has been linked to {studentName} as{" "}
                  <span className="capitalize">{relationType}</span>.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Step 1: Email search ─────────────────────────────────── */}
              <div>
                <label
                  htmlFor="parent-email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Parent's Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    id="parent-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) validateEmail(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="parent@example.com"
                    autoComplete="email"
                    disabled={isSearching}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isSearching || !email}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isSearching ? "Searching…" : "Find Parent"}
                  </button>
                </div>
                {emailError && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              {/* ── Search results ───────────────────────────────────────── */}
              {searchDone && (
                <>
                  {foundParents.length === 0 ? (
                    /* Not found */
                    <div className="rounded-lg border border-border bg-muted/40 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle
                          className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">Parent not found</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            No parent account exists with that email address. The parent must first
                            sign into EduOS and complete their profile before they can be linked to
                            a student.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Found — show selectable parent card(s) */
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {foundParents.length === 1
                          ? "Parent found — confirm details below"
                          : `${foundParents.length} matches — select one`}
                      </p>

                      {foundParents.map((parent) => (
                        <button
                          key={parent.id}
                          type="button"
                          onClick={() => setSelectedParent(parent)}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                            selectedParent?.id === parent.id
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                              {(parent.user?.name ?? "P")
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </div>
                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {parent.user?.name ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {parent.user?.email ?? "—"}
                              </p>
                              {parent.occupation && (
                                <p className="text-xs text-muted-foreground">{parent.occupation}</p>
                              )}
                            </div>
                            {/* Selection indicator */}
                            {selectedParent?.id === parent.id && (
                              <UserCheck
                                className="h-4 w-4 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </button>
                      ))}

                      {/* ── Step 2: Relation type ──────────────────────── */}
                      {selectedParent && (
                        <div>
                          <label
                            htmlFor="relation-type"
                            className="block text-sm font-medium text-foreground mb-1.5"
                          >
                            Relation Type
                            <span className="text-destructive ml-1" aria-hidden="true">
                              *
                            </span>
                          </label>
                          <select
                            id="relation-type"
                            value={relationType}
                            onChange={(e) => {
                              setRelationType(e.target.value as RelationType);
                              setRelationError(null);
                            }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="" disabled>
                              Select relationship…
                            </option>
                            {RELATION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {relationError && (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {relationError}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Link error */}
                      {linkError && (
                        <div
                          role="alert"
                          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                        >
                          {linkError}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        {!success && (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLinking}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>

            {selectedParent && !success && (
              <button
                type="button"
                onClick={handleLink}
                disabled={isLinking || !relationType}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLinking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isLinking ? "Linking…" : "Link Parent"}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
