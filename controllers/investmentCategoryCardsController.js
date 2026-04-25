const { assertActiveLensName } = require("../services/lensService");
const {
  getMonthRangeValidationMessage,
  getTrimmedString,
} = require("../middleware/validate");
const {
  isValidMonthString,
  queryInvestmentCategoryCards,
  setInvestmentCategoryConstituentEnabledState,
} = require("../services/investmentCategoryCardsService");

// Express 5 forwards rejected async handlers to the shared error middleware,
// so these routes do not need local try/catch(next) wrappers.
async function queryInvestmentCategoryCardsController(req, res) {
  const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];

  for (const card of cards) {
    if (!card || typeof card !== "object") {
      return res.status(400).json({
        error: "cards must contain plain objects.",
      });
    }

    if (!getTrimmedString(card.investmentCategory)) {
      return res.status(400).json({
        error: "investmentCategory is required for each requested card.",
      });
    }

    const monthRangeValidationMessage = getMonthRangeValidationMessage(
      card.startMonth,
      card.endMonth,
      isValidMonthString,
    );

    if (monthRangeValidationMessage) {
      return res.status(400).json({
        error: monthRangeValidationMessage,
      });
    }
  }

  const responseBody = await queryInvestmentCategoryCards(cards);
  res.json(responseBody);
}

async function updateInvestmentCategoryConstituentController(req, res) {
  const investmentCategory = getTrimmedString(req.params.category);
  const tickerSymbol = getTrimmedString(req.params.ticker).toUpperCase();

  if (!tickerSymbol) {
    return res.status(400).json({ error: "Ticker symbol is required." });
  }

  await assertActiveLensName(investmentCategory);

  if (typeof req.body?.isEnabled !== "boolean") {
    return res.status(400).json({
      error: "isEnabled is required and must be a boolean.",
    });
  }

  const monthRangeValidationMessage = getMonthRangeValidationMessage(
    req.body.startMonth,
    req.body.endMonth,
    isValidMonthString,
  );

  if (monthRangeValidationMessage) {
    return res.status(400).json({
      error: monthRangeValidationMessage,
    });
  }

  const startMonth = getTrimmedString(req.body.startMonth);
  const endMonth = getTrimmedString(req.body.endMonth);

  const updatedCard = await setInvestmentCategoryConstituentEnabledState({
    investmentCategory,
    tickerSymbol,
    isEnabled: req.body.isEnabled,
    startMonth,
    endMonth,
  });

  res.json(updatedCard);
}

module.exports = {
  queryInvestmentCategoryCardsController,
  updateInvestmentCategoryConstituentController,
};
