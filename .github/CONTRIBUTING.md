# Contributing to Family Meals SMS System

Thank you for your interest in contributing! This document provides guidelines for contributing to the SMS meal ordering system.

## Development Workflow

### 1. Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/SF-New-Deal/family-meals.git
cd family-meals

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your local credentials

# Copy SAM config template
cp samconfig.example.toml samconfig.toml
# Edit samconfig.toml with your credentials
```

### 2. Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Test locally**:
   ```bash
   # Build and test
   sam build
   sam local start-api --env-vars env.json

   # Test the webhook
   curl -X POST http://localhost:3000/webhook \
     -d "From=%2B1234567890&Body=test"
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

### 3. Submitting Changes

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** using our PR template

3. **Wait for review** - maintainers will review your changes

## Coding Standards

### JavaScript/Node.js
- Use ES6+ features where appropriate
- Follow existing code style and patterns
- Add error handling for all async operations
- Use meaningful variable and function names

### SMS Flow Testing
When modifying SMS logic, test all conversation phases:
- Phase 0: Initial greeting and validation
- Phase 1: Meal quantity selection
- Phase 2: Neighborhood selection
- Phase 3: Restaurant selection
- Phase 4-6: Menu item quantities
- Phase 98: Order confirmation
- Reset functionality
- Error handling

### Infrastructure Changes
- Test all SAM template changes locally
- Update documentation for any new environment variables
- Ensure backward compatibility where possible

## Issue Reporting

Use our issue templates:
- 🐛 **Bug Report**: For functional issues
- ✨ **Feature Request**: For new functionality
- 🏗️ **Infrastructure**: For deployment/AWS issues

## Branch Protection Rules

Our `main` branch is protected with:
- ✅ Required pull request reviews
- ✅ Required status checks (GitHub Actions)
- ✅ No direct pushes to main
- ✅ Force push restrictions

## Release Process

1. **Create a tag**:
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

2. **Automated release** will:
   - Deploy to production
   - Create GitHub release with changelog
   - Update deployment documentation

## Security Guidelines

- **Never commit secrets** (API keys, credentials)
- Use GitHub Secrets for sensitive environment variables
- Review Airtable permissions regularly
- Test security with various phone number inputs

## Getting Help

- Check existing issues and documentation
- Ask questions in pull request comments
- Contact maintainers for urgent issues

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow project guidelines