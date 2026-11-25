import { PublicInvite } from './family-invites.service';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// The page behind the email's Join button. It hands off to the app through
// its URL scheme (app.json "scheme"), which opens the invitation screen
// (apps/mobile/app/family-invite.tsx). If the app isn't installed, the code
// on the page is what they type in after installing.
export function renderInvitePage(info: PublicInvite | null, rawCode: string): string {
  const code = info?.code ?? rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const appLink = `homeguard://family-invite?code=${encodeURIComponent(code)}`;
  const open = info?.status === 'PENDING';

  let heading: string;
  let body: string;
  if (!info) {
    heading = 'Invitation not found';
    body = '<p>Check the link in your email, or ask for a new invitation.</p>';
  } else if (!open) {
    heading = info.status === 'ACCEPTED' ? 'Already accepted' : info.status === 'EXPIRED' ? 'This invitation has expired' : 'This invitation is no longer active';
    body = info.status === 'ACCEPTED'
      ? '<p>This invitation was already accepted. Open the Attenteve app and sign in.</p>'
      : `<p>Ask ${esc(info.inviterName)} to send a new invitation from the Attenteve app.</p>`;
  } else {
    heading = `Join ${esc(info.inviterName)}'s home`;
    body = `
      <p>${esc(info.inviterName)} invited ${info.inviteeFirstName ? esc(info.inviteeFirstName) : 'you'} to join their home on Attenteve.</p>
      <a class="btn" href="${appLink}">Open in the Attenteve app</a>
      <p class="muted">Don't have the app yet? Install Attenteve, then tap the button above again, or choose
        <b>I have an invitation</b> on the app's first screen and enter this code:</p>
      <div class="code">${esc(code.replace(/(.{4})(?=.)/g, '$1-'))}</div>
      <p class="muted">${info.hasAccount ? 'Sign in with the email this invitation was sent to.' : 'You\'ll create your account in the app with the email this invitation was sent to.'}</p>`;
  }

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Attenteve invitation</title>
<style>
  body{margin:0;background:#EDF1F0;color:#12181C;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:440px;margin:0 auto;padding:40px 20px}
  .card{background:#fff;border-radius:18px;padding:28px 22px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  .brand{font-weight:800;font-size:22px;margin-bottom:18px}.brand span{color:#C97F1F}
  h1{font-size:22px;margin:0 0 10px}
  p{line-height:1.5}.muted{color:#5B6B70;font-size:14px}
  .btn{display:block;text-align:center;background:#F2A93C;color:#12181C;font-weight:800;text-decoration:none;border-radius:12px;padding:15px;margin:20px 0}
  .code{font-size:28px;font-weight:800;letter-spacing:4px;text-align:center;background:#EDF1F0;border-radius:12px;padding:14px;margin:10px 0}
</style></head>
<body><div class="wrap"><div class="card">
  <div class="brand">Attent<span>eve</span></div>
  <h1>${heading}</h1>
  ${body}
</div></div>
${open ? `<script>setTimeout(function(){window.location.href=${JSON.stringify(appLink)};},300);</script>` : ''}
</body></html>`;
}
