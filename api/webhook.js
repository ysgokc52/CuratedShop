import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const cart = JSON.parse(session.metadata.cart || '[]');
    const customerName = session.metadata.customerName || 'Friend';
    const customerEmail = session.customer_email || session.customer_details?.email;
    const total = (session.amount_total || 0) / 100;

    try {
      await sendDownloadEmail({ customerName, customerEmail, cart, total, orderId: session.id });
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  res.status(200).json({ received: true });
}

async function sendDownloadEmail({ customerName, customerEmail, cart, total, orderId }) {
  const itemRows = cart.map(item => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #d4ccc1;font-family:Georgia,serif;">
        <div style="font-size:15px;font-weight:600;color:#1a1614;">${escapeHtml(item.title)}</div>
        <div style="font-size:12px;color:#6b5d54;margin-top:4px;">Qty: ${item.qty} &middot; $${item.price.toFixed(2)}</div>
        <a href="${escapeHtml(item.downloadUrl || '#')}" style="display:inline-block;margin-top:10px;background:#1a1614;color:#f5f1ea;padding:8px 16px;text-decoration:none;font-size:12px;">
          Download ${escapeHtml(item.title)}
        </a>
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:40px 20px;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #1a1614;">
          <tr><td style="padding:32px;border-bottom:2px solid #1a1614;">
            <h1 style="font-size:32px;font-weight:900;margin:0;color:#1a1614;">Thank you, ${escapeHtml(customerName.split(' ')[0])}.</h1>
            <div style="font-size:14px;color:#6b5d54;margin-top:8px;font-style:italic;">Your books are ready below.</div>
          </td></tr>
          <tr><td style="padding:24px 32px;"><table width="100%">${itemRows}</table></td></tr>
          <tr><td style="padding:20px 32px;background:#1a1614;color:#f5f1ea;">
            <table width="100%"><tr>
              <td style="font-size:12px;">TOTAL PAID</td>
              <td align="right" style="font-size:24px;font-weight:700;">$${total.toFixed(2)}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:24px 32px;text-align:center;font-size:11px;color:#6b5d54;">
            Order ID: ${orderId.slice(-12)}<br/>Lifetime access &middot; Re-download anytime
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: customerEmail,
      subject: `Your books are ready - Order ${orderId.slice(-6)}`,
      html,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error: ${err}`);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
