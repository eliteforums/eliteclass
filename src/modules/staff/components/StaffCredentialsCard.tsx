import { useState } from "react";
import { Copy, Check, Printer, Download, Users, Mail, CheckCircle2, Eye, EyeOff, ClipboardList, ShieldCheck } from "lucide-react";
import type { AdmitStaffResult } from "@/types";
import { copyToClipboard } from "@/utils/helpers";
import { toast } from "sonner";

interface StaffCredentialsCardProps {
  staffName: string;
  credentials: AdmitStaffResult;
}

function CredentialRow({ 
  label, 
  value, 
  mono = true, 
  isPassword = false 
}: { 
  label: string; 
  value: string; 
  mono?: boolean;
  isPassword?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!isPassword);

  async function handleCopy() {
    if (!(await copyToClipboard(value))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    toast.success(`${label} copied`);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5 transition-all hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className={`text-sm font-semibold text-foreground break-all ${mono ? "font-mono" : ""}`}>
            {isPassword && !visible ? "••••••••" : value}
          </p>
          {isPassword && (
            <button 
              type="button" 
              onClick={() => setVisible(!visible)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function StaffCredentialsCard({ staffName, credentials }: StaffCredentialsCardProps) {
  const [allCopied, setAllCopied] = useState(false);

  const handleCopyAll = async () => {
    const text = `EduOS Staff Credentials\nName: ${staffName}\nRole: ${credentials.role_name}\nEmail: ${credentials.email}\nPassword: ${credentials.temporary_password}`;
    if (await copyToClipboard(text)) {
      setAllCopied(true);
      window.setTimeout(() => setAllCopied(false), 2000);
      toast.success("All credentials copied to clipboard");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-lg rounded-2xl border border-primary/20 bg-card text-left shadow-2xl animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Staff Admission Successful</h3>
            <p className="text-xs text-muted-foreground">Credentials generated for {staffName}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-black text-foreground uppercase tracking-widest">Login Details</h4>
          </div>
          <div className="grid gap-2">
            <CredentialRow label="Sign-in Email" value={credentials.email} />
            <CredentialRow label="Temporary Password" value={credentials.temporary_password} isPassword={true} />
            <CredentialRow label="Assigned Role" value={credentials.role_name} mono={false} />
          </div>
        </div>

        {credentials.assignments && credentials.assignments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black text-foreground uppercase tracking-widest">Assignments</h4>
            </div>
            <div className="grid gap-2">
              {credentials.assignments.map((assignment, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/10 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight mb-1">Assignment {idx + 1}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {assignment.course_name && (
                      <div className="text-sm font-semibold text-foreground">
                        <span className="text-muted-foreground font-normal">Course:</span> {assignment.course_name}
                      </div>
                    )}
                    {assignment.subject_name && (
                      <div className="text-sm font-semibold text-foreground">
                        <span className="text-muted-foreground font-normal">Subject:</span> {assignment.subject_name}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-muted transition-all active:scale-95"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button
          type="button"
          onClick={handleCopyAll}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-95"
        >
          {allCopied ? <Check className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          {allCopied ? "Copied Everything" : "Copy All Credentials"}
        </button>
      </div>
    </div>
  );
}
