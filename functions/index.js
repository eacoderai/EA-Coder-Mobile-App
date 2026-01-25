const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors')({ origin: true });

admin.initializeApp();

// Claude API configuration
const CLAUDE_API_KEY = functions.config().claude?.apikey || '';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Generate trading code using Claude-3.7-Sonnet
 */
exports.generateTradingCode = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { description, instrument, platform, riskRules } = data;
  
  if (!description || !instrument || !platform) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: description, instrument, or platform'
    );
  }

  try {
    // Create prompt for Claude
    const prompt = createPrompt(description, instrument, platform, riskRules);
    
    // Call Claude API
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: "claude-3-7-sonnet-20240620",
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content: "You are Crizzy, EA Coder's Code Assistant. Always identify yourself as Crizzy, EA Coder's Code Assistant. Do not mention Anthropic or Claude. You were created by EA Coder."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    // Extract code from Claude's response
    const generatedCode = response.data.content[0].text;
    
    // Store in Firestore
    const strategyRef = admin.firestore().collection('strategies').doc();
    await strategyRef.set({
      userId: context.auth.uid,
      description,
      instrument,
      platform,
      riskRules: riskRules || '',
      code: generatedCode,
      status: 'generated',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      backtestResult: generateSimulatedBacktestResults()
    });

    return {
      success: true,
      strategyId: strategyRef.id,
      code: generatedCode
    };
  } catch (error) {
    console.error('Error generating code:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to generate code. Please try again later.'
    );
  }
});

/**
 * Chat with Claude to modify existing code
 */
exports.chatWithAI = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { strategyId, message, chatHistory } = data;
  
  if (!strategyId || !message) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: strategyId or message'
    );
  }

  try {
    // Get strategy details
    const strategyDoc = await admin.firestore()
      .collection('strategies')
      .doc(strategyId)
      .get();
    
    if (!strategyDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Strategy not found'
      );
    }
    
    const strategy = strategyDoc.data();
    
    // Verify ownership
    if (strategy.userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have permission to access this strategy'
      );
    }

    // Create messages array for Claude
    const messages = [
      {
        role: "system",
        content: `You are Crizzy, EA Coder's Code Assistant. Always identify yourself as Crizzy, EA Coder's Code Assistant. Do not mention Anthropic or Claude. You were created by EA Coder.\nYou are an expert trading algorithm developer specializing in ${strategy.platform}. Your task is to modify the existing trading code based on the user's request. Always provide the complete updated code without explanations.`
      }
    ];
    
    // Add chat history (limited to last 5 messages)
    const recentHistory = (chatHistory || []).slice(-5);
    messages.push(...recentHistory);
    
    // Add current message
    messages.push({
      role: "user",
      content: `Here is my current code:\n\n\`\`\`\n${strategy.code}\n\`\`\`\n\nPlease modify it to: ${message}`
    });
    
    // Call Claude API
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: "claude-3-7-sonnet-20240620",
        max_tokens: 4000,
        messages: messages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    // Extract updated code from Claude's response
    const updatedCode = response.data.content[0].text;
    
    // Store chat message in Firestore
    const chatRef = admin.firestore()
      .collection('strategies')
      .doc(strategyId)
      .collection('chats')
      .doc();
      
    await chatRef.set({
      userId: context.auth.uid,
      message,
      response: updatedCode,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update strategy code
    await admin.firestore()
      .collection('strategies')
      .doc(strategyId)
      .update({
        code: updatedCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return {
      success: true,
      code: updatedCode
    };
  } catch (error) {
    console.error('Error in AI chat:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to process chat request. Please try again later.'
    );
  }
});

/**
 * Convert code between trading platforms
 */
exports.convertCode = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { sourceCode, fromLang, toLang } = data;
  
  if (!sourceCode || !fromLang || !toLang) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: sourceCode, fromLang, or toLang'
    );
  }

  try {
    // Call Claude API
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: "claude-3-7-sonnet-20240620",
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content: `You are an expert trading algorithm developer specializing in converting code between different trading platforms.`
          },
          {
            role: "user",
            content: `Convert the following ${fromLang} code to ${toLang}. Only provide the converted code without explanations.\n\n\`\`\`\n${sourceCode}\n\`\`\``
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    // Extract converted code from Claude's response
    const convertedCode = response.data.content[0].text;
    
    // Store conversion in Firestore
    const conversionRef = admin.firestore().collection('conversions').doc();
    await conversionRef.set({
      userId: context.auth.uid,
      fromLang,
      toLang,
      sourceCode,
      convertedCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      convertedCode
    };
  } catch (error) {
    console.error('Error converting code:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to convert code. Please try again later.'
    );
  }
});

/**
 * Create prompt for Claude based on strategy details
 */
function createPrompt(description, instrument, platform, riskRules) {
  return `Generate a trading algorithm in ${platform} for ${instrument} based on the following description:

Description: ${description}

${riskRules ? `Risk Management Rules: ${riskRules}` : ''}

Requirements:
1. The code must be syntactically valid and ready to use in ${platform}
2. Include proper risk management (stop loss, take profit)
3. Avoid repainting indicators
4. Include clear comments explaining the strategy logic
5. Follow best practices for ${platform}

Please provide ONLY the complete code without any explanations.`;
}

/**
 * Generate simulated backtest results for demo purposes
 */
function generateSimulatedBacktestResults() {
  // Generate random but realistic backtest metrics
  const winRate = 55 + Math.floor(Math.random() * 25); // 55-80%
  const profitFactor = (1.5 + Math.random() * 1.5).toFixed(2); // 1.5-3.0
  const maxDrawdown = (5 + Math.random() * 15).toFixed(1); // 5-20%
  const expectedReturn = (10 + Math.random() * 25).toFixed(1); // 10-35%
  
  const totalTrades = 80 + Math.floor(Math.random() * 120); // 80-200
  const winningTrades = Math.floor(totalTrades * (winRate / 100));
  const losingTrades = totalTrades - winningTrades;
  
  // Advanced metrics
  const sharpeRatio = (1.2 + Math.random() * 1.8).toFixed(2); // 1.2-3.0
  const sortinoRatio = (1.5 + Math.random() * 2.0).toFixed(2); // 1.5-3.5
  const recoveryFactor = (2.0 + Math.random() * 2.0).toFixed(2); // 2.0-4.0
  const maxConsecutiveLosses = 2 + Math.floor(Math.random() * 6); // 2-8
  
  // Market condition performance
  const bullMarketPerformance = (60 + Math.random() * 30).toFixed(1); // 60-90%
  const bearMarketPerformance = (40 + Math.random() * 30).toFixed(1); // 40-70%
  const volatileMarketPerformance = (50 + Math.random() * 30).toFixed(1); // 50-80%
  
  // Trade duration and frequency
  const avgTradeDuration = (2 + Math.random() * 5).toFixed(1); // 2-7 days
  const tradeFrequency = (1 + Math.random() * 4).toFixed(1); // 1-5 per week
  
  // AI recommendations
  const recommendations = [
    "Consider adding a trailing stop to protect profits during volatile market conditions",
    "Increase position size during strong trend confirmations to maximize returns",
    "Add a filter to avoid trading during major economic news releases"
  ];

  return {
    winRate,
    profitFactor,
    maxDrawdown,
    expectedReturn,
    totalTrades,
    winningTrades,
    losingTrades,
    avgWin: ((expectedReturn / winningTrades) * 10).toFixed(2),
    avgLoss: ((maxDrawdown / losingTrades) * 10).toFixed(2),
    largestWin: ((expectedReturn / winningTrades) * 25).toFixed(2),
    largestLoss: ((maxDrawdown / losingTrades) * 25).toFixed(2),
    profitLossRatio: (((expectedReturn / winningTrades) * 10) / ((maxDrawdown / losingTrades) * 10)).toFixed(2),
    sharpeRatio,
    sortinoRatio,
    recoveryFactor,
    maxConsecutiveLosses,
    bullMarketPerformance,
    bearMarketPerformance,
    volatileMarketPerformance,
    avgTradeDuration,
    tradeFrequency,
    volatility: (maxDrawdown / 2).toFixed(1),
    recommendations,
    backtestPeriod: "Jan 2023 - Present"
  };
}
