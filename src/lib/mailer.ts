/**
 * Email delivery for opted-in digests. Uses Resend's HTTP API when RESEND_API_KEY and
 * EMAIL_FROM are set; otherwise email is skipped (in-app notifications still work).
 */
export type Email = { to: string; subject: string; text: string; html: string };
export type Mailer = (e: Email) => Promise<boolean>;

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export const sendEmail: Mailer = async (e) => {
  if (!emailConfigured()) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [e.to], subject: e.subject, text: e.text, html: e.html }),
  });
  if (!res.ok) console.warn(`Email to ${e.to.replace(/(.).*@/, "$1…@")} failed: ${res.status}`);
  return res.ok;
};
