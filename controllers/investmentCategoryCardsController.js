const { assertActiveLensName } = require("../services/lensService");
const {
  isValidMonthString,
  queryInvestmentCategoryCards,
  setInvestmentCategoryConstituentEnabledState,
} = require("../services/investmentCategoryCardsService");

async function queryInvestmentCategoryCardsController(req, res, next) {
  try {
    const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];

    for (const card of cards) {
      if (!card || typeof card !== "object") {
        return res.status(400).json({
          error: "cards must contain plain objects.",
        });
      }

      if (!card.investmentCategory || typeof card.investmentCategory !== "string" || !card.investmentCategory.trim()) {
        return res.status(400).json({
          error: "investmentCategory is required for each requested card.",
        });
      }

      if ((card.startMonth && !isValidMonthString(card.startMonth)) || (card.endMonth && !isValidMonthString(card.endMonth))) {
        return res.status(400).json({
          error: "startMonth and endMonth must use the YYYY-MM format.",
        });
      }

      if (card.startMonth && card.endMonth && card.startMonth > card.endMonth) {
        return res.status(400).json({
          error: "startMonth must be earlier than or equal to endMonth.",
        });
      }
    }

    const responseBody = await queryInvestmentCategoryCards(cards);
    res.json(responseBody);
  } catch (error) {
    next(error);
  }
}

async function updateInvestmentCategoryConstituentController(req, res, next) {
  try {
    const investmentCategory = String(req.params.category || "").trim();
    const tickerSymbol = String(req.params.ticker || "").trim().toUpperCase();

    if (!tickerSymbol) {
      return res.status(400).json({ error: "Ticker symbol is required." });
    }

    await assertActiveLensName(investmentCategory);

    if (typeof req.body?.isEnabled !== "boolean") {
      return res.status(400).json({
        error: "isEnabled is required and must be a boolean.",
      });
    }

    if ((req.body.startMonth && !isValidMonthString(req.body.startMonth)) || (req.body.endMonth && !isValidMonthString(req.body.endMonth))) {
      return res.status(400).json({
        error: "startMonth and endMonth must use the YYYY-MM format.",
      });
    }

    if (req.body.startMonth && req.body.endMonth && req.body.startMonth > req.body.endMonth) {
      return res.status(400).json({
        error: "startMonth must be earlier than or equal to endMonth.",
      });
    }

    const updatedCard = await setInvestmentCategoryConstituentEnabledState({
      investmentCategory,
      tickerSymbol,
      isEnabled: req.body.isEnabled,
      startMonth: req.body.startMonth || "",
      endMonth: req.body.endMonth || "",
    });

    res.json(updatedCard);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  queryInvestmentCategoryCardsController,
  updateInvestmentCategoryConstituentController,
};
