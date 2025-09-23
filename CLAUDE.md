# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS Lambda-based SMS meal ordering system using Twilio webhooks and Airtable as a database. Users can text a phone number to order meals from local restaurants using a conversational flow.

**Key Features:**
- Multi-language support (English, Arabic, Chinese, Spanish, Vietnamese)
- Phase-based conversation flow (0-98) tracking user progress through ordering
- 30-minute session timeout with automatic reset
- Voucher-based ordering system with limits
- Restaurant selection by neighborhood
- Menu item ordering with quantity validation

## Architecture

- **AWS Lambda**: `src/index.js` - Main handler for Twilio SMS webhooks
- **Helper Functions**: `src/helpers.js` - Airtable integration and business logic
- **AWS SAM**: `template.yaml` - Infrastructure as code for deployment
- **API Gateway**: Provides HTTPS webhook endpoint for Twilio

## Development Commands

- **Install dependencies**: `npm install`
- **Build for deployment**: `sam build`
- **Deploy to AWS**: `sam deploy --guided` (first time) or `sam deploy`
- **Local testing**: `sam local start-api`
- **Test webhook locally**:
  ```bash
  curl -X POST http://localhost:3000/webhook -d "From=%2B1234567890&Body=test"
  ```

## Airtable Integration

Required tables in Airtable:
- **Families**: User records with phone numbers, language preferences, voucher counts
- **Restaurants**: Restaurant info, menus, availability, neighborhoods
- **Order Log**: Historical order tracking
- **Texting Script v2.0**: Multi-language text templates

Environment variables needed:
- `AIRTABLE_API_KEY`: Your Airtable API key
- `AIRTABLE_BASE_KEY`: Your Airtable base ID

## Configuration

- **AWS SAM Template**: `template.yaml` defines Lambda function, API Gateway, and environment variables
- **Package Dependencies**: `package.json` includes airtable and twilio SDKs
- **Deployment**: Use `sam deploy` with parameters for Airtable credentials

## Code Structure

- **Phase System**: User conversations tracked through numbered phases (0-98)
- **Multi-language**: All text retrieved from Airtable based on user's language preference
- **Error Handling**: Graceful fallbacks and input validation throughout
- **Reset Functionality**: Users can reset conversation with keywords in any supported language

## Migration Notes

This was migrated from Twilio Serverless Functions to AWS Lambda:
- Converted Twilio Runtime context/event structure to Lambda event structure
- Changed environment variable access from `context.VAR` to `process.env.VAR`
- Updated response format for API Gateway compatibility
- Maintained all original conversation logic and user experience