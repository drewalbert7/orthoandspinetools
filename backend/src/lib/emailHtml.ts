/** Escape text embedded in HTML email bodies (not full document trust). */
export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtmlAttribute(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const TRANSACTIONAL_FOOTER =
  'OrthoAndSpineTools — community for orthopedic and spine professionals. This is a transactional message about your account.';

export function wrapTransactionalHtml(innerBodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td style="padding:28px 24px 8px;font-size:18px;font-weight:600;">OrthoAndSpineTools</td></tr>
<tr><td style="padding:8px 24px 24px;font-size:15px;line-height:1.55;">${innerBodyHtml}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.45;color:#6b7280;border-top:1px solid #f3f4f6;">${escapeHtmlText(TRANSACTIONAL_FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function wrapDigestHtml(innerBodyHtml: string, preferencesUrl: string): string {
  const prefs = escapeHtmlAttribute(preferencesUrl);
  const footer = `You received this summary because email digests are enabled on your account. <a href="${prefs}" style="color:#2563eb;">Manage email preferences</a> or sign in to turn off digests in Profile Settings.`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td style="padding:28px 24px 8px;font-size:18px;font-weight:600;">OrthoAndSpineTools</td></tr>
<tr><td style="padding:8px 24px 16px;font-size:15px;line-height:1.55;">${innerBodyHtml}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.45;color:#6b7280;border-top:1px solid #f3f4f6;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
