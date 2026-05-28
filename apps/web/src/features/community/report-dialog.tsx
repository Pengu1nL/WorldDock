import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReportRepositoryInput } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type ReportDialogProps = {
  targetLabel: string;
  trigger: ReactNode;
  onSubmit: (input: ReportRepositoryInput) => Promise<void> | void;
};

const REASONS: Array<{ id: ReportRepositoryInput["reason"]; label: string }> = [
  { id: "spam", label: "垃圾内容" },
  { id: "sensitive_content", label: "敏感内容" },
  { id: "abuse", label: "骚扰或滥用" },
  { id: "copyright", label: "版权问题" },
  { id: "other", label: "其他" },
];

export function ReportDialog({ targetLabel, trigger, onSubmit }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportRepositoryInput["reason"]>("other");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const detailTooShort = detail.trim().length < 6;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) setStatus("idle");
    }}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.24)", zIndex: 30 }} />
        <Dialog.Content
          aria-describedby="report-dialog-description"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(440px, calc(100vw - 32px))",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
            zIndex: 31,
            padding: 18,
          }}
        >
          <div className="row gap-2" style={{ alignItems: "flex-start" }}>
            <div className="col" style={{ gap: 4, flex: 1 }}>
              <Dialog.Title className="title-font" style={{ fontSize: "var(--t-18)", fontWeight: 600 }}>举报</Dialog.Title>
              <Dialog.Description id="report-dialog-description" className="prose" style={{ margin: 0, color: "var(--fg-2)" }}>
                {targetLabel}
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn ghost sm" style={{ width: 28, padding: 0 }}>
              <Icon name="x" size={14} />
            </Dialog.Close>
          </div>

          {status === "success" ? (
            <div className="card" style={{ padding: 14, marginTop: 14 }}>
              <div className="row gap-2">
                <Icon name="check" size={14} />
                <span>Alpha 团队会人工处理</span>
              </div>
            </div>
          ) : (
            <form
              className="col"
              style={{ gap: 12, marginTop: 14 }}
              onSubmit={async (event) => {
                event.preventDefault();
                if (detailTooShort || status === "submitting") return;
                setStatus("submitting");
                try {
                  await onSubmit({ reason, detail: detail.trim() });
                  setStatus("success");
                } catch {
                  setStatus("error");
                }
              }}
            >
              <label className="col" style={{ gap: 6 }}>
                <span className="label">原因</span>
                <select className="input" aria-label="举报原因" value={reason} onChange={(event) => setReason(event.target.value as ReportRepositoryInput["reason"])}>
                  {REASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="col" style={{ gap: 6 }}>
                <span className="label">说明</span>
                <textarea
                  className="input"
                  aria-label="举报说明"
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  rows={5}
                  style={{ resize: "vertical", minHeight: 112 }}
                />
              </label>
              {status === "error" ? <div className="badge amber">提交失败，请稍后重试</div> : null}
              <div className="row gap-2">
                <button className="btn primary" type="submit" disabled={detailTooShort || status === "submitting"}>
                  提交举报
                </button>
                <Dialog.Close className="btn ghost" type="button">取消</Dialog.Close>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
