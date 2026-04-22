const OpenAI = require('openai');
const Order = require('../models/Order');

const FREE_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',     // best quality, try first
    'nousresearch/hermes-3-405b-instruct:free',    // very large, high quality
    'google/gemma-4-31b-it:free',                  // newest Gemma, great
    'google/gemma-4-26b-a4b-it:free',              // efficient MoE model
    'google/gemma-3-27b-it:free',                  // solid fallback
    'meta-llama/llama-3.2-3b-instruct:free',       // small but fast
    'google/gemma-3-12b-it:free',                  // fallback
    'google/gemma-3-4b-it:free',                   // smaller fallback
    'google/gemma-3n-e4b-it:free',                 // last resort
    'google/gemma-3n-e2b-it:free',                 // smallest, last resort
];

const buildSystemPrompt = ({ products, categories, coupons }) => {
    const productList = products
        .map((p) => {
            const cat = p.category?.name || 'Uncategorized';
            const discount =
                p.comparePrice > p.price ? ` (was ₹${p.comparePrice})` : '';
            const rating = p.ratings?.average
                ? ` | Rating: ${p.ratings.average}/5 (${p.ratings.count} reviews)`
                : '';
            const inStock = p.stock > 0 ? 'In Stock' : 'Out of Stock';
            return `- ${p.name} | ₹${p.price}${discount} | ${cat} | ${inStock}${rating}${p.isFeatured ? ' | ⭐ Featured' : ''}`;
        })
        .join('\n');

    const categoryList = categories
        .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`)
        .join('\n');

    const couponList = coupons.length
        ? coupons
            .map((c) => {
                const discountText =
                    c.type === 'percentage' ? `${c.value}% off` : `₹${c.value} off`;
                const minOrder = c.minimumOrderAmount
                    ? ` (min order ₹${c.minimumOrderAmount})`
                    : '';
                const maxDiscount = c.maximumDiscountAmount
                    ? ` (max discount ₹${c.maximumDiscountAmount})`
                    : '';
                const firstTime = c.firstTimeUserOnly
                    ? ' | First-time users only'
                    : '';
                const expiry = c.validUntil
                    ? ` | Valid until ${new Date(c.validUntil).toLocaleDateString('en-IN')}`
                    : '';
                return `- Code: ${c.code} | ${discountText}${minOrder}${maxDiscount}${firstTime}${expiry}`;
            })
            .join('\n')
        : 'No active coupons at the moment.';

    return `You are Creed Assistant, a friendly and knowledgeable shopping assistant for Creed, a premium e-commerce store.

Your job is to help customers with:
1. Product discovery and recommendations
2. Order tracking and status
3. Coupon and discount information
4. General FAQ and support

Always be warm, concise, and helpful. Use Indian Rupee (₹) for all prices.
Never make up products or information not listed below.
If you don't know something, politely say so and suggest contacting support.

---
## CURRENT PRODUCT CATALOG (${products.length} products):
${productList}

---
## CATEGORIES:
${categoryList}

---
## ACTIVE COUPONS & OFFERS:
${couponList}

---
## STORE POLICIES (General):
- Orders can be tracked in My Account > Orders
- For cancellations or returns, visit My Account > Orders and raise a request
- Payment methods: Credit/Debit Card, UPI, Net Banking, COD, Razorpay
- For urgent support, customers can use the Contact Us page

Keep responses short (2-4 sentences max) unless the user asks for details.
Always recommend relevant products when appropriate.`;
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

        // If user is logged in and asking about orders, fetch their orders
        let orderContext = '';
        const lastMessage =
            messages[messages.length - 1]?.content?.toLowerCase() || '';
        const isAskingAboutOrder =
            lastMessage.includes('order') ||
            lastMessage.includes('track') ||
            lastMessage.includes('delivery') ||
            lastMessage.includes('shipped') ||
            lastMessage.includes('status');

        if (userId && isAskingAboutOrder) {
            try {
                const recentOrders = await Order.find({ user: userId })
                    .select(
                        'orderNumber status pricing.total items createdAt shipping.trackingNumber'
                    )
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean();

                if (recentOrders.length > 0) {
                    orderContext =
                        "\n\n## THIS CUSTOMER'S RECENT ORDERS:\n" +
                        recentOrders
                            .map((o) => {
                                const itemNames =
                                    o.items?.map((i) => i.name).join(', ') || 'items';
                                const tracking = o.shipping?.trackingNumber
                                    ? ` | Tracking: ${o.shipping.trackingNumber}`
                                    : '';
                                return `- Order #${o.orderNumber} | Status: ${o.status} | ₹${o.pricing?.total}${tracking} | Items: ${itemNames}`;
                            })
                            .join('\n');
                }
            } catch (err) {
                console.error('Failed to fetch user orders for chat:', err);
            }
        }

        const finalSystemPrompt = systemPrompt + orderContext;
        console.log(`Prompt length: ${finalSystemPrompt.length} characters`);

        const SMALL_CONTEXT_MODELS = [
            'google/gemma-3-12b-it:free',
            'google/gemma-3-4b-it:free',
            'google/gemma-3n-e4b-it:free',
            'google/gemma-3n-e2b-it:free',
        ];

        const promptLength = finalSystemPrompt.length;
        const modelsToTry = promptLength > 8000
            ? FREE_MODELS.filter(m => !SMALL_CONTEXT_MODELS.includes(m))
            : FREE_MODELS;

        // Try each model in order, rotate on rate limit or 404
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
                    max_tokens: 500,
                    temperature: 0.7,
                });

                reply = completion.choices[0].message.content;
                console.log(`✅ Success with model: ${model}`);
                break; // success — stop trying other models

            } catch (err) {
                console.log(`❌ Model ${model} failed (${err.status}), trying next...`);
                lastError = err;
                // Only rotate on rate limit (429) or not found (404)
                if (err.status !== 429 && err.status !== 404 && err.status !== 400) break;
            }
        }

        if (!reply) {
            const msg =
                lastError?.status === 429
                    ? 'All AI models are busy right now. Please try again in a minute!'
                    : 'Failed to get AI response';
            return res.status(500).json({ error: msg });
        }

        res.json({ reply });

    } catch (error) {
        console.error('Chat error:', error);
        if (error.status === 429) {
            return res.status(429).json({
                error: 'AI is busy right now. Please try again in a moment!',
            });
        }
        res.status(500).json({ error: 'Failed to get AI response' });
    }
};