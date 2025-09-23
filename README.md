# Family Meals Lambda

SMS-based meal ordering system using AWS Lambda, Twilio, and Airtable.

## Architecture

- **AWS Lambda**: Handles SMS webhooks from Twilio
- **API Gateway**: Provides HTTPS endpoint for webhooks
- **Airtable**: Database for families, restaurants, and orders
- **Twilio**: SMS messaging service

## Setup

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. AWS SAM CLI installed
3. Node.js 18.x or later
4. Airtable account with API key
5. Twilio account with phone number

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy to AWS:
   ```bash
   sam build
   sam deploy --guided
   ```

3. During deployment, provide:
   - **AirtableApiKey**: Your Airtable API key
   - **AirtableBaseKey**: Your Airtable base ID

### Twilio Configuration

1. After deployment, copy the webhook URL from the output
2. In Twilio Console, configure your phone number webhook to point to:
   `https://YOUR_API_GATEWAY_URL/webhook`

## Environment Variables

- `AIRTABLE_API_KEY`: Your Airtable API key
- `AIRTABLE_BASE_KEY`: Your Airtable base ID

## Airtable Schema

Required tables:
- **Families**: User records with phone numbers, language, vouchers
- **Restaurants**: Restaurant info, menus, availability
- **Order Log**: Order history and tracking
- **Texting Script v2.0**: Multi-language text templates

## Development

### Local Testing

```bash
# Build the application
sam build

# Start local API
sam local start-api

# Test with curl
curl -X POST http://localhost:3000/webhook \
  -d "From=%2B1234567890&Body=test"
```

### Deployment

```bash
# Deploy to AWS
sam build && sam deploy
```

## Migration from Twilio Serverless

Key changes made:
1. Converted Twilio Runtime context/event to Lambda event structure
2. Changed environment variable access from `context.VAR` to `process.env.VAR`
3. Updated response format for API Gateway
4. Added proper error handling and logging
5. Maintained all original SMS conversation logic and Airtable integration