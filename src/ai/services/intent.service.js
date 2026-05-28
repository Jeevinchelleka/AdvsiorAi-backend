/**
 * Intent Classification Service
 *
 * Classifies user queries into one of the core use cases from the problem statement:
 * - ADVISOR_PRODUCTIVITY  : portfolio summaries, book risk, meeting prep
 * - CLIENT_INTELLIGENCE   : client segmentation, next-best-action, life events
 * - PORTFOLIO_INSIGHTS    : performance analytics, rebalancing, scenario simulation
 * - CONVERSATIONAL_SEARCH : NL queries across holdings/transactions/research/market
 * - COMPLIANCE            : pre/post-trade checks, policy violations, audit
 * - REVENUE_ENABLEMENT    : cross-sell/upsell, product suitability, opportunities
 * - GENERAL               : general financial questions not tied to specific data
 */

const INTENTS = {
  ADVISOR_PRODUCTIVITY:  "ADVISOR_PRODUCTIVITY",
  CLIENT_INTELLIGENCE:   "CLIENT_INTELLIGENCE",
  PORTFOLIO_INSIGHTS:    "PORTFOLIO_INSIGHTS",
  CONVERSATIONAL_SEARCH: "CONVERSATIONAL_SEARCH",
  COMPLIANCE:            "COMPLIANCE",
  REVENUE_ENABLEMENT:    "REVENUE_ENABLEMENT",
  GENERAL:               "GENERAL",
};

// Keyword patterns mapped to intents (ordered by specificity)
const INTENT_PATTERNS = [
  {
    intent: INTENTS.COMPLIANCE,
    patterns: [
      /compliance/i, /violation/i, /alert/i, /policy/i, /regulatory/i,
      /pre.?trade/i, /post.?trade/i, /audit/i, /finra/i, /sec\b/i,
      /concentration.?limit/i, /breach/i, /restrict/i, /prohibited/i,
    ],
  },
  {
    intent: INTENTS.REVENUE_ENABLEMENT,
    patterns: [
      /cross.?sell/i, /upsell/i, /up.?sell/i, /opportunit/i, /revenue/i,
      /product.?suit/i, /recommend.*product/i, /next.?best.?action/i,
      /nba\b/i, /suitable/i, /suitability/i,
    ],
  },
  {
    intent: INTENTS.CLIENT_INTELLIGENCE,
    patterns: [
      /client.*segment/i, /segment.*client/i, /life.?event/i, /retirement/i,
      /liquidity.?event/i, /client.*behavior/i, /client.*insight/i,
      /client.*profile/i, /client.*risk/i, /client.*goal/i,
      /who.*client/i, /client.*who/i, /my.*client/i,
    ],
  },
  {
    intent: INTENTS.ADVISOR_PRODUCTIVITY,
    patterns: [
      /summarize.*portfolio/i, /portfolio.*summar/i, /my.*book/i,
      /book.*risk/i, /meeting.*prep/i, /client.*360/i, /360.*client/i,
      /top.*risk/i, /risk.*book/i, /advisor.*summar/i, /daily.*summar/i,
      /overview.*portfolio/i, /portfolio.*overview/i,
    ],
  },
  {
    intent: INTENTS.PORTFOLIO_INSIGHTS,
    patterns: [
      /portfolio.*performance/i, /performance.*portfolio/i,
      /rebalanc/i, /scenario/i, /simulation/i, /risk.*exposure/i,
      /exposure.*risk/i, /allocation/i, /diversif/i, /holdings/i,
      /asset.*mix/i, /portfolio.*risk/i, /risk.*score/i,
      /performance.*score/i, /total.*value/i, /aum/i,
    ],
  },
  {
    intent: INTENTS.CONVERSATIONAL_SEARCH,
    patterns: [
      /transaction/i, /trade/i, /buy/i, /sell/i, /research.*report/i,
      /report.*research/i, /market.*data/i, /price/i, /volume/i,
      /symbol/i, /stock/i, /crypto/i, /bond/i, /etf/i,
      /show.*me/i, /list.*all/i, /find.*all/i, /search/i,
      /what.*is.*price/i, /how.*much.*is/i,
      /list.*client/i, /show.*client/i, /all.*client/i,
      /list.*user/i, /show.*user/i, /all.*user/i,
      /list.*portfolio/i, /show.*portfolio/i, /all.*portfolio/i,
      /list.*holding/i, /list.*alert/i, /list.*recommendation/i,
    ],
  },
];

/**
 * Classify the intent of a user message.
 * Returns the intent string and a confidence score.
 */
function classifyIntent(message) {
  const scores = {};

  for (const { intent, patterns } of INTENT_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) score++;
    }
    if (score > 0) scores[intent] = score;
  }

  if (Object.keys(scores).length === 0) {
    return { intent: INTENTS.GENERAL, confidence: 0, scores: {} };
  }

  const topIntent = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return {
    intent: topIntent[0],
    confidence: topIntent[1],
    scores,
  };
}

/**
 * Map intent to which Supabase tables to query
 */
function getTablesForIntent(intent) {
  const tableMap = {
    [INTENTS.ADVISOR_PRODUCTIVITY]:  ["clients", "portfolios", "holdings", "compliance_alerts", "recommendations"],
    [INTENTS.CLIENT_INTELLIGENCE]:   ["clients", "portfolios", "recommendations", "transactions"],
    [INTENTS.PORTFOLIO_INSIGHTS]:    ["portfolios", "holdings", "transactions", "market_data"],
    [INTENTS.CONVERSATIONAL_SEARCH]: ["clients", "portfolios", "holdings", "transactions", "research_reports", "market_data", "recommendations", "compliance_alerts"],
    [INTENTS.COMPLIANCE]:            ["compliance_alerts", "clients", "holdings", "transactions"],
    [INTENTS.REVENUE_ENABLEMENT]:    ["clients", "recommendations", "portfolios", "market_data"],
    [INTENTS.GENERAL]:               ["clients", "portfolios", "holdings", "market_data"],
  };
  return tableMap[intent] || tableMap[INTENTS.GENERAL];
}

module.exports = { classifyIntent, getTablesForIntent, INTENTS };
