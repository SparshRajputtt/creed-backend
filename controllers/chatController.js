const OpenAI = require('openai');
const Order = require('../models/Order');

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

  // FIX 5: guard against undefined/null coupons
  const couponList = coupons?.length
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

-- "featured products" / "featured" / "show featured" →

  Featured products are explicitly marked with the text: ⭐ Featured

  Detection rule:
  - Carefully scan each product line
  - A product is featured ONLY if the exact text "⭐ Featured" appears at the end of that line
  - Do NOT miss this marker — it is the ONLY source of truth

  If AT LEAST ONE product contains "⭐ Featured":
  - Return ONLY those featured products (max 4)

  If NO product contains "⭐ Featured":
  - Respond with:
    "We don't have any featured products at the moment.
    But here are some of our popular products you might like!"
  - Then return fallback products

  STRICT RULE:
  - If even ONE "⭐ Featured" product exists → DO NOT trigger fallback
  - NEVER ignore a product that contains "⭐ Featured"

  - When returning multiple products (especially fallback/popular suggestions):
  ENSURE category diversity.

  Rules for diversity:
  - Do NOT return multiple products from the same category if other categories are available
  - Prefer selecting products from DIFFERENT categories (e.g., bottle, tiffin, kids, etc.)
  - Only return multiple products from same category IF no other categories are available

  Priority order:
  1. In Stock
  2. Higher Rated
  3. Different Categories (VERY IMPORTANT)

  If diversity is ignored → response is incorrect

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

## ORDER REPLY RULES:
- For order status, format reply clearly with bullet points showing: Order number, Status, Items, Tracking number if available
- Never show raw database IDs to the user
- If user asks about orders but is not logged in, tell them to please log in first to view their orders

CRITICAL: You MUST ALWAYS respond with ONLY a valid JSON object starting with { and ending with }. 
If you include ANY text outside the JSON, the system will break. No exceptions.
Product IDs must ONLY appear inside the products array — NEVER in the message text.`;
};

// FIX 1 & 2: return aiIntendedProducts flag so handleChat knows
// whether the empty products array was intentional or a broken response.
//
//   aiIntendedProducts = true  → AI deliberately sent products: []
//                                (greeting / order / coupon / "we don't carry this")
//                                → trust the AI message, skip fallback
//
//   aiIntendedProducts = false → AI sent IDs but none matched the catalog,
//                                OR JSON parse failed entirely
//                                → eligible for fallback
//
const parseAIResponse = (rawReply, products) => {
  try {
    const cleaned = rawReply
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const message = parsed.message || rawReply;
    const productIds = parsed.products || [];

    const aiIntendedProducts = productIds.length === 0;

    const matchedProducts = productIds
      .map((id) => products.find((p) => p._id?.toString() === id?.toString()))
      .filter(Boolean)
      .slice(0, 4);

    return { message, matchedProducts, aiIntendedProducts };
  } catch {
    // JSON parse failed — strip raw IDs so they don't leak into the UI
    const cleaned = rawReply
      .replace(/ID:\s*[a-f0-9]{24}/gi, '')
      .replace(/\(([^)]+)\)\s*\n/g, '\n')
      .trim();
    // Treat as broken response → fallback eligible
    return { message: cleaned, matchedProducts: [], aiIntendedProducts: false };
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

    // FIX 6: guard against missing products array in context
    const contextProducts = context.products || [];

    const systemPrompt = buildSystemPrompt(context);

    // Fetch user orders if message is order-related
    let orderContext = '';
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const isAskingAboutOrder =
      lastMessage.includes('order') ||
      lastMessage.includes('track') ||
      lastMessage.includes('delivery') ||
      lastMessage.includes('shipped') ||
      lastMessage.includes('status');

    const isAskingRecent =
      lastMessage.includes('recent') ||
      lastMessage.includes('latest') ||
      lastMessage.includes('last order') ||
      lastMessage.includes('my order');

    const orderLimit = isAskingRecent ? 1 : 5;

    if (userId && isAskingAboutOrder) {
      try {
        const recentOrders = await Order.find({ user: userId })
          .select('orderNumber status pricing.total items createdAt shipping.trackingNumber')
          .sort({ createdAt: -1 })
          .limit(orderLimit)
          .lean();

        if (recentOrders.length > 0) {
          orderContext =
            `\n\n## THIS CUSTOMER'S ${isAskingRecent ? 'MOST RECENT ORDER' : 'RECENT ORDERS'}:\n` +
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
    } else if (isAskingAboutOrder) {
      orderContext = '\n\n## USER IS ASKING ABOUT THEIR ORDERS BUT IS NOT LOGGED IN.';
    } else {
      orderContext = '';
    }

    const finalSystemPrompt = systemPrompt + orderContext;

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: 'openrouter/auto',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...messages,
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const rawReply = completion.choices[0].message.content;

    // Parse AI response — get message text, matched products, and intent flag
    const { message, matchedProducts, aiIntendedProducts } = parseAIResponse(rawReply, contextProducts);
    
    // ─── FALLBACK LOGIC ───────────────────────────────────────────────────────
    //
    // Trigger ONLY when AI tried to return IDs but none matched the catalog.
    // Never trigger when AI intentionally returned products: [] —
    // that means it already handled the response correctly (greeting, order
    // query, coupon query, or honest "we don't carry this" reply).
    //
    if (!aiIntendedProducts && matchedProducts.length === 0) {

      // FIX 4: spread into a new array before sorting to avoid mutating context.products
      const fallbackProducts = [...contextProducts]
        .filter((p) => p.stock > 0)
        .sort((a, b) => {
          const ratingDiff = (b.ratings?.average || 0) - (a.ratings?.average || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        })
        .slice(0, 4);

      if (fallbackProducts.length > 0) {
        return res.json({
          reply: "We don't carry that specific type yet, but here are some of our popular products you might like.",
          products: fallbackProducts,
        });
      }

      // No in-stock products in the catalog at all
      return res.json({
        reply: message || "We don't have any products available right now. Please check back soon!",
        products: [],
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Normal path — return whatever the AI decided (with or without products)
    res.json({ reply: message, products: matchedProducts });

  } catch (error) {
    console.error('Chat error:', error);
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI is busy right now. Please try again in a moment!' });
    }
    res.status(500).json({ error: 'Failed to get AI response' });
  }
};