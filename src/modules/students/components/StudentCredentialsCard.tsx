import { useState } from "react";
import { Copy, Check, Printer, Download, Users, Mail, CheckCircle2, Eye, EyeOff, ClipboardList, ShieldCheck } from "lucide-react";
import type { AdmitStudentResult } from "@/types";
import {
  copyToClipboard,
  downloadCredentialsFile,
  formatCredentialsText,
  printCredentials,
} from "@/modules/students/utils/credentialsExport";
import { toast } from "sonner";

interface StudentCredentialsCardProps {
  studentName: string;
  credentials: AdmitStudentResult;
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

export function StudentCredentialsCard({ studentName, credentials }: StudentCredentialsCardProps) {
  const [allCopied, setAllCopied] = useState(false);

  const handleCopySection = async (type: 'student' | 'parent') => {
    let text = "";
    if (type === 'student') {
      text = `Student Credentials\nEmail: ${credentials.generated_email}\nPassword: ${credentials.temporary_password}`;
    } else {
      text = `Parent Credentials\nEmail: ${credentials.parent_email}\nPassword: ${credentials.parent_temporary_password || 'Linked to existing account'}`;
    }
    if (await copyToClipboard(text)) {
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} credentials copied`);
    }
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
            <h3 className="text-lg font-bold text-foreground">Admission Successful</h3>
            <p className="text-xs text-muted-foreground">Credentials generated for {studentName}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Student Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-black text-foreground uppercase tracking-widest">Student Portal</h4>
            </div>
            <button 
              onClick={() => handleCopySection('student')}
              className="text-[10px] font-bold text-primary hover:underline uppercase tracking-tighter"
            >
              Copy Student Info
            </button>
          </div>
          <div className="grid gap-2">
            <CredentialRow label="Sign-in Email" value={credentials.generated_email} />
            <CredentialRow label="Temporary Password" value={credentials.temporary_password} isPassword={true} />
          </div>
        </div>

        {/* Parent Section */}
        {credentials.parent_account_status !== "not_provided" && (
          <div className="space-y-4 pt-6 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                <h4 className="text-xs font-black text-foreground uppercase tracking-widest">Parent Portal</h4>
              </div>
              <button 
                onClick={() => handleCopySection('parent')}
                className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-tighter"
              >
                Copy Parent Info
              </button>
            </div>
            
            <div className="grid gap-2">
              <CredentialRow label="Parent Email" value={credentials.parent_email ?? "Not Added"} />
              {credentials.parent_account_status === "created" ? (
                <CredentialRow label="Parent Password" value={credentials.parent_temporary_password ?? "Not Added"} isPassword={true} />
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/10 px-3 py-2.5 rounded-lg border border-amber-200/50">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Linked to existing parent account
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={async () => {
            if (await copyToClipboard(formatCredentialsText(studentName, credentials))) {
              setAllCopied(true);
              window.setTimeout(() => setAllCopied(false), 2000);
              toast.success("All credentials copied to clipboard");
            }
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-95"
        >
          {allCopied ? <Check className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          {allCopied ? "Copied Everything" : "Copy All Credentials"}
        </button>
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => printCredentials(studentName, credentials)}
            className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
            title="Print Credentials"
          >
            <Printer className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => downloadCredentialsFile(studentName, credentials)}
            className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
            title="Download as Text"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}