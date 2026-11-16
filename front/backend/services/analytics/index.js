// ============================================================
// WAYI — Service Analytics (Segment)
// Tracking comportemental · Entonnoirs · Insights business
// ============================================================

const SEGMENT_KEY = process.env.SEGMENT_WRITE_KEY || '';
let analytics = null;

function getClient() {
  if (analytics) return analytics;
  if (!SEGMENT_KEY) return null;
  try {
    const { Analytics } = require('@segment/analytics-node');
    analytics = new Analytics({ writeKey: SEGMENT_KEY });
    return analytics;
  } catch {
    return null;
  }
}

// ── TRACKING EVENTS ───────────────────────────────────────────

const EVENTS = {
  // Acheteur
  USER_SIGNED_UP:       'User Signed Up',
  USER_LOGGED_IN:       'User Logged In',
  HOME_VIEWED:          'Home Viewed',
  SHOP_VIEWED:          'Shop Viewed',
  PRODUCT_ADDED:        'Product Added',
  PRODUCT_REMOVED:      'Product Removed',
  CART_VIEWED:          'Cart Viewed',
  CHECKOUT_STARTED:     'Checkout Started',
  PAYMENT_INITIATED:    'Payment Initiated',
  ORDER_COMPLETED:      'Order Completed',
  ORDER_CANCELLED:      'Order Cancelled',
  ORDER_RATED:          'Order Rated',
  AI_QUERY:             'AI Query Sent',
  AI_RECOMMENDATION:    'AI Recommendation Viewed',
  SEARCH_PERFORMED:     'Search Performed',
  PROMO_APPLIED:        'Promo Code Applied',

  // Livreur
  DRIVER_CAME_ONLINE:   'Driver Came Online',
  DRIVER_ACCEPTED_ORDER:'Driver Accepted Order',
  DRIVER_DELIVERED:     'Driver Delivered Order',
  DRIVER_CAPTURED_DATA: 'Driver Field Capture Submitted',

  // Commerce
  MERCHANT_DASHBOARD:   'Merchant Dashboard Viewed',
  MERCHANT_ORDER_CONFIRMED: 'Merchant Order Confirmed',
  MERCHANT_PLAN_VIEWED: 'Merchant Subscription Plan Viewed',
  MERCHANT_UPGRADED:    'Merchant Plan Upgraded',

  // IA
  YIVI_SESSION_STARTED: 'Yivi Session Started',
  YIVI_MESSAGE_SENT:    'Yivi Message Sent',
};

/**
 * Track un événement utilisateur
 */
function track(userId, event, properties = {}) {
  const client = getClient();
  const enriched = {
    ...properties,
    platform: 'wayi_app',
    version: '2.0.0',
    city: 'Abomey-Calavi',
    country: 'Bénin',
    timestamp: new Date().toISOString(),
  };

  if (client) {
    client.track({ userId: String(userId), event, properties: enriched });
  }

  // Log en dev
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Analytics] ${event} | user:${userId} | ${JSON.stringify(properties).substring(0, 100)}`);
  }
}

/**
 * Identifier un utilisateur (first login / register)
 */
function identify(userId, traits = {}) {
  const client = getClient();
  if (client) {
    client.identify({
      userId: String(userId),
      traits: {
        ...traits,
        platform: 'wayi_app',
        city: 'Abomey-Calavi',
        country: 'Bénin',
        createdAt: traits.createdAt || new Date().toISOString(),
      },
    });
  }
}

/**
 * Page view (web)
 */
function page(userId, name, properties = {}) {
  const client = getClient();
  if (client) client.page({ userId: String(userId), name, properties });
}

// ── HELPERS MÉTIER ────────────────────────────────────────────

function trackOrder(userId, order, event = EVENTS.ORDER_COMPLETED) {
  track(userId, event, {
    orderId: order.id,
    shopId: order.shopId,
    shopName: order.shopName,
    category: order.category,
    total: order.total,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    itemsCount: order.items?.length || 0,
    paymentMethod: order.paymentMethod,
    driverId: order.driverId,
    deliveryTime: order.deliveredAt
      ? Math.round((new Date(order.deliveredAt) - new Date(order.createdAt)) / 60000)
      : null,
  });
}

function trackAIQuery(userId, query, intent, recommendationsCount) {
  track(userId, EVENTS.AI_QUERY, { query, intent, recommendationsCount, provider: 'claude' });
}

function trackPayment(userId, orderId, method, amount, success) {
  track(userId, EVENTS.PAYMENT_INITIATED, { orderId, method, amount, success, currency: 'XOF' });
}

function trackSearch(userId, query, resultsCount) {
  track(userId, EVENTS.SEARCH_PERFORMED, { query, resultsCount });
}

module.exports = { track, identify, page, trackOrder, trackAIQuery, trackPayment, trackSearch, EVENTS };
