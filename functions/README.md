# EA Coder Firebase Cloud Functions

This directory contains the Firebase Cloud Functions for the EA Coder mobile app, which handle AI code generation, chat interactions, and code conversion using Claude-3.7-Sonnet.

## Setup Instructions

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment Variables

Set up your Claude API key in Firebase:

```bash
firebase functions:config:set claude.apikey="your-claude-api-key"
```

### 3. Local Development

To test functions locally:

```bash
firebase emulators:start
```

### 4. Deployment

To deploy functions to Firebase:

```bash
firebase deploy --only functions
```

## Available Functions

### 1. generateTradingCode

Generates trading algorithm code based on user input.

**Parameters:**
- `description`: Strategy description
- `instrument`: Trading instrument (e.g., EURUSD)
- `platform`: Target platform (MQL4, MQL5, Pine Script)
- `riskRules`: Optional risk management rules

### 2. chatWithAI

Allows users to chat with Claude to modify existing code.

**Parameters:**
- `strategyId`: ID of the strategy to modify
- `message`: User's request for code modification
- `chatHistory`: Recent chat history (optional)

### 3. convertCode

Converts trading code between different platforms.

**Parameters:**
- `sourceCode`: Original code
- `fromLang`: Source language
- `toLang`: Target language

## Security

- All functions verify user authentication
- Data access is restricted to the authenticated user
- API keys are securely stored in Firebase config