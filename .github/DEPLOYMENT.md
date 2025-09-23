# GitHub Actions Deployment Setup

This repository uses GitHub Actions to automatically deploy the Lambda function to AWS when code is pushed to the `main` branch.

## Required GitHub Secrets

You must configure these secrets in your GitHub repository settings:

### AWS Credentials
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add these repository secrets:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `AWS_ACCESS_KEY_ID` | Your AWS Access Key ID | `AKIAR7WS5OHRMH44COFP` |
| `AWS_SECRET_ACCESS_KEY` | Your AWS Secret Access Key | `[Keep this private]` |
| `AIRTABLE_API_KEY` | Your Airtable API Key | `patb8J811lh1BXBQf.923...` |
| `AIRTABLE_BASE_KEY` | Your Airtable Base ID | `apppstuV3SQ82t0OZ` |

## How It Works

### On Pull Requests
- Builds the application
- Runs validation checks
- Shows what would be deployed (dry run)
- No actual deployment occurs

### On Main Branch Push
- Builds the application
- Deploys to AWS Lambda
- Updates environment variables
- Reports the webhook URL

## Manual Deployment

If you need to deploy manually:

```bash
# Build and deploy
sam build
sam deploy --resolve-s3 --no-confirm-changeset

# Or with specific parameters
sam deploy --resolve-s3 --no-confirm-changeset \
  --parameter-overrides \
    AirtableApiKey="your-api-key" \
    AirtableBaseKey="your-base-id"
```

## Monitoring Deployments

- Check the **Actions** tab in GitHub to see deployment status
- View CloudWatch logs in AWS console for runtime issues
- Monitor Twilio webhook delivery for SMS handling

## Security Notes

- AWS credentials are encrypted in GitHub Secrets
- Airtable credentials are never logged or exposed
- All secrets are only accessible during deployment
- Production environment variables are managed separately from code