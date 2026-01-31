# v1.1.0 - Multilingual Bug Fixes & Translation Improvements

## Multilingual Help Keywords
- Added support for help keywords in Spanish (`ayuda`), Chinese (`幫助`, `帮助`), and Arabic (`يساعد`, `مساعدة`)
- Users now receive only the Help message without duplicate responses

## Chinese "Back" Navigation Fix
- Fixed bug where texting `返回` (back) during hood selection returned "Invalid Choice"
- Added `back_words` support to Phase 2 (neighborhood selection)

## Arabic Text Formatting Improvements
- Added hardcoded translations for **Dietary Restrictions** (22 items) and **Unenrolled Reasons** (9 items)
- Translations now display correctly in Arabic without line-splitting issues
- Supported languages: English, Spanish, Chinese, Arabic

## Airtable Table Rename
- Updated table reference from "Texting Script v3.0 [SANDBOX]" to "Texting Script v3.0"

---

### Files Changed
- `sms-lambda/src/index.js`
- `sms-lambda/src/helpers.js`
