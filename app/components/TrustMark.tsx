type TrustMarkProps = { compact?: boolean; className?: string };

export default function TrustMark({ compact = false, className = "" }: TrustMarkProps) {
  return (
    <div className={`mf-trust-mark ${compact ? "mf-trust-mark-compact" : ""} ${className}`.trim()} aria-label="Powered by TxLINE and TxODDS">
      <span className="mf-trust-mark-check" aria-hidden="true">✓</span>
      <span className="mf-trust-mark-copy"><strong>TxLINE</strong><span>{compact ? "verified" : "cryptographically verified"}</span></span>
      <span className="mf-trust-mark-divider" aria-hidden="true">×</span>
      <span className="mf-trust-mark-copy mf-trust-mark-infra"><strong>TxODDS</strong><span>{compact ? "infrastructure" : "data infrastructure"}</span></span>
    </div>
  );
}

