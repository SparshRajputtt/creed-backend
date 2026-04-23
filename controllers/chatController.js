const OpenAI = require('openai');
const Order = require('../models/Order');

const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-405b-instruct:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
  'google/gemma-3n-e4b-it:free',
  'google/gemma-3n-e2b-it:free',
];

const SMALL_CONTEXT_MODELS = [
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
  'google/gemma-3n-e4b-it:free',
  'google/gemma-3n-e2b-it:free',
];

const buildSystemPrompt = ({ products, categories, coupons }) => {
  const productList = products
    .map((p) => {
      const cat = p.category?.name || 'Uncategorized';
      const discount = p.comparePrice > p.price ? ` (was ₹${p.comparePrice})` : '';
      const rating = p.ratings?.average
        ? ` | Rating: ${p.ratings.average}/5 (${p.ratings.count} reviews)`
        : '';
      const inStock = p.stock > 0 ? 'In Stock' : 'Out of Stock';
      const tags = p.tags?.length ? ` | Tags: ${p.tags.join(', ')}` : '';
      const features = p.features?.length ? ` | Features: ${p.features.slice(0, 3).join(', ')}` : '';
      return `- ID:${p._id} SLUG:${p.slug} | ${p.name} | ₹${p.price}${discount} | ${cat} | ${inStock}${rating}${tags}${features}${p.isFeatured ? ' | ⭐ Featured' : ''}`;
    })
    .join('\n');

  const categoryList = categories
    .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`)
    .join('\n');

  const couponList = coupons.length
    ? coupons.map((c) => {
        const discountText = c.type === 'percentage' ? `${c.value}% off` : `₹${c.value} off`;
        const minOrder = c.minimumOrderAmount ? ` (min order ₹${c.minimumOrderAmount})` : '';
        const maxDiscount = c.maximumDiscountAmount ? ` (max discount ₹${c.maximumDiscountAmount})` : '';
        const firstTime = c.firstTimeUserOnly ? ' | First-time users only' : '';
        const expiry = c.validUntil
          ? ` | Valid until ${new Date(c.validUntil).toLocaleDateString('en-IN')}`
          : '';
        return `- Code: ${c.code} | ${discountText}${minOrder}${maxDiscount}${firstTime}${expiry}`;
      }).join('\n')
    : 'No active coupons at the moment.';

  return `You are Creed Assistant, a smart shopping assistant for Creed, a premium e-commerce store.

## YOUR RESPONSE RULES:
You MUST respond in valid JSON only. No plain text. No markdown outside JSON.

Response format:
{
  "message": "Your friendly reply text here (you can use **bold** and bullet points inside the message string)",
  "products": []
}

The "products" array should contain product IDs (the ID: values from the catalog below) when relevant.
- Include products when user asks to see, find, recommend, or browse products
- Include up to 4 most relevant product IDs
- Leave products as empty array [] for greetings, order questions, coupon questions etc.

## SMART MATCHING RULES:
When user asks about USE CASE or FEATURES (not exact product names), match intelligently:
- "hot and cold / double wall / thermos / insulated / keep warm" → match products with these tags/features
- "fridge bottles / single wall / cold only" → match single wall category products
- "kids bottles / school bottles / children" → match kids/school related products
- "office bottles / travel bottles / gym bottles" → match travel/office/gym tagged products
- "Tiffin / lunch box / food container" → match tiffin/food related products
- "baby bottles / feeding bottles / infant" → match baby/infant products
- Always prefer IN STOCK products over out of stock
- Always prefer higher rated products

## CURRENT PRODUCT CATALOG:
${productList}

## CATEGORIES:
${categoryList}

## ACTIVE COUPONS & OFFERS:
${couponList}

## STORE POLICIES:
- Orders tracked in My Account > Orders
- Returns/cancellations via My Account > Orders
- Payment: Credit/Debit Card, UPI, Net Banking, COD, Razorpay
- Support: Contact Us page

CRITICAL: ONLY respond with a valid JSON object. Never add any text, explanation, or markdown outside the JSON.`;
};

const callAI = async (messages, finalSystemPrompt) => {
  const promptLength = finalSystemPrompt.length;
  const modelsToTry = promptLength > 8000
    ? FREE_MODELS.filter(m => !SMALL_CONTEXT_MODELS.includes(m))
    : FREE_MODELS;

  let reply = null;
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      console.log(`Trying model: ${model}`);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          ...messages,
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      reply = completion.choices[0].message.content;
      console.log(`✅ Success with model: ${model}`);
      break;

    } catch (err) {
      console.log(`❌ Model ${model} failed (${err.status}), trying next...`);
      lastError = err;
      if (err.status !== 429 && err.status !== 404 && err.status !== 400) break;
    }
  }

  return { reply, lastError };
};

const parseAIResponse = (rawReply, products) => {
  try {
    // Strip markdown code fences if present
    const cleaned = rawReply
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const message = parsed.message || rawReply;
    const productIds = parsed.products || [];

    // Match product IDs to actual product objects from context
    const matchedProducts = productIds
      .map(id => products.find(p => p._id?.toString() === id?.toString()))
      .filter(Boolean)
      .slice(0, 4);

    return { message, matchedProducts };
  } catch {
    // If JSON parsing fails, return plain message with no products
    return { message: rawReply, matchedProducts: [] };
  }
};

exports.handleChat = async (req, res) => {
  try {
    const { messages, context, userId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!context) {
      return res.status(400).json({ error: 'Context is required' });
    }

    const systemPrompt = buildSystemPrompt(context);

    // Fetch user orders if asking about them
    let orderContext = '';
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const isAskingAboutOrder =
      lastMessage.includes('order') ||
      lastMessage.includes('track') ||
      lastMessage.includes('delivery') ||
      lastMessage.includes('shipped') ||
      lastMessage.includes('status');

    if (userId && isAskingAboutOrder) {
      try {
        const recentOrders = await Order.find({ user: userId })
          .select('orderNumber status pricing.total items createdAt shipping.trackingNumber')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        if (recentOrders.length > 0) {
          orderContext =
            "\n\n## THIS CUSTOMER'S RECENT ORDERS:\n" +
            recentOrders.map((o) => {
              const itemNames = o.items?.map((i) => i.name).join(', ') || 'items';
              const tracking = o.shipping?.trackingNumber
                ? ` | Tracking: ${o.shipping.trackingNumber}`
                : '';
              return `- Order #${o.orderNumber} | Status: ${o.status} | ₹${o.pricing?.total}${tracking} | Items: ${itemNames}`;
            }).join('\n');
        }
      } catch (err) {
        console.error('Failed to fetch user orders for chat:', err);
      }
    }

    const finalSystemPrompt = systemPrompt + orderContext;

    const { reply: rawReply, lastError } = await callAI(messages, finalSystemPrompt);

    if (!rawReply) {
      const msg = lastError?.status === 429
        ? 'All AI models are busy right now. Please try again in a minute!'
        : 'Failed to get AI response';
      return res.status(500).json({ error: msg });
    }

    // Parse AI response — extract message text + matched product objects
    const { message, matchedProducts } = parseAIResponse(rawReply, context.products);

    res.json({ reply: message, products: matchedProducts });

  } catch (error) {
    console.error('Chat error:', error);
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI is busy right now. Please try again in a moment!' });
    }
    res.status(500).json({ error: 'Failed to get AI response' });
  }
};