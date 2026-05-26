import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { cart, customer } = req.body;

    if (!cart?.length) return res.status(400).json({ error: 'Cart is empty' });
    if (!customer?.email) return res.status(400).json({ error: 'Email required' });

    const line_items = cart.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          description: item.description?.slice(0, 500) || 'Digital ebook',
          metadata: { productId: String(item.id) },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty || 1,
    }));

    const cartMeta = cart.map(i => ({ id: i.id, title: i.title, qty: i.qty, price: i.price, downloadUrl: i.downloadUrl })).slice(0, 10);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      customer_email: customer.email,
      success_url: `${process.env.STORE_URL}/?success=true`,
      cancel_url: `${process.env.STORE_URL}/?canceled=true`,
      metadata: {
        customerName: customer.name || '',
        cart: JSON.stringify(cartMeta),
      },
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
