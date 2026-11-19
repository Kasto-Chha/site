// One payment receipt as a printable page: used by the team and, later, by the owner. Print, then Save as PDF, makes the PDF.
// It is an acknowledgement that a payment was received, not a tax invoice.
const METHOD = { cash: "Cash", bank: "Bank transfer", esewa: "eSewa", khalti: "Khalti", other: "Other" };

export default function ReceiptView({ receipt: r }) {
  return (
    <div className="rp">
      <section className="rp-page">
        <p className="rp-kicker">Payment receipt · {r.number}</p>
        <h1>{r.businessName}</h1>
        <p className="rp-sub">{r.area}</p>
        {r.voided ? <p className="rp-note" role="status"><strong>CANCELLED.</strong> {r.voidReason} This receipt is no longer valid.</p> : null}
        <table className="rp-table">
          <tbody>
            <tr><td>Amount received</td><td><strong>Rs {Number(r.amount).toLocaleString("en-US")}</strong></td></tr>
            <tr><td>Received on</td><td>{r.paidOn}</td></tr>
            <tr><td>Paid by</td><td>{METHOD[r.method] || r.method}{r.reference ? ` (ref ${r.reference})` : ""}</td></tr>
            <tr><td>For</td><td>KastoChha service, {r.months} {r.months === 1 ? "month" : "months"}: {r.from} to {r.to}</td></tr>
          </tbody>
        </table>
        <p>Thank you. This payment has been received.</p>
        {r.issuer ? <p className="rp-fine" style={{ whiteSpace: "pre-wrap" }}>{r.issuer}</p> : null}
        <p className="rp-fine">This is an acknowledgement of payment received. It is not a tax invoice.</p>
      </section>
    </div>
  );
}
