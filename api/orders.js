export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.MERCHANT_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const orders = [];
    res.status(200).json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
