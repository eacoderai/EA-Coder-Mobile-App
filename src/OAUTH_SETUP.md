# OAuth Setup Instructions for EA Coder

## Overview
Your EA Coder app now supports Google and Apple sign-in/sign-up. To enable these features, you need to configure OAuth providers in your Supabase project.

## Google OAuth Setup

### 1. Create Google OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Web application" as the application type
6. Add authorized redirect URIs:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - For local testing: `http://localhost:54321/auth/v1/callback`
7. Save and copy your **Client ID** and **Client Secret**

### 2. Configure in Supabase
1. Go to your Supabase project dashboard
2. Navigate to "Authentication" > "Providers"
3. Find "Google" and enable it
4. Enter your Google **Client ID** and **Client Secret**
5. Click "Save"

### 3. Detailed Documentation
For complete setup instructions, visit:
https://supabase.com/docs/guides/auth/social-login/auth-google

---

## Apple OAuth Setup

### 1. Create Apple Service ID
1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to "Certificates, Identifiers & Profiles"
3. Click on "Identifiers" and create a new identifier
4. Select "Services IDs" and configure:
   - Description: EA Coder
   - Identifier: com.eacoder.auth (or your preferred identifier)
5. Enable "Sign in with Apple"
6. Configure domains and return URLs:
   - Domain: `<your-project-ref>.supabase.co`
   - Return URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`

### 2. Generate Client Secret
1. Create a new Key in Apple Developer Portal
2. Enable "Sign in with Apple"
3. Download the key file (.p8)
4. Note your Key ID and Team ID

### 3. Configure in Supabase
1. Go to your Supabase project dashboard
2. Navigate to "Authentication" > "Providers"
3. Find "Apple" and enable it
4. Enter:
   - **Services ID**: Your Apple Services ID
   - **Secret Key**: Content of your .p8 key file
   - **Key ID**: Your Apple Key ID
   - **Team ID**: Your Apple Team ID
5. Click "Save"

### 4. Detailed Documentation
For complete setup instructions, visit:
https://supabase.com/docs/guides/auth/social-login/auth-apple

---

## Important Notes

### Security
- Never commit OAuth credentials to your repository
- Keep your client secrets secure
- Use environment variables for sensitive data in production

### Testing
- Both Google and Apple OAuth will redirect users after authentication
- The app automatically handles the OAuth callback and signs users in
- User credentials and profile data are automatically saved in Supabase Auth

### User Data Storage
- When users sign in with Google or Apple, Supabase automatically:
  - Creates a user record in the `auth.users` table
  - Stores the user's email and metadata
  - Generates access and refresh tokens
  - Links the OAuth provider to the user account

### Additional Providers
If you want to add more OAuth providers (GitHub, Facebook, etc.), follow similar steps:
1. Create OAuth app in the provider's developer portal
2. Get Client ID and Secret
3. Configure in Supabase Authentication > Providers

---

## Troubleshooting

### "Provider is not enabled" error
- Make sure you've enabled and configured the provider in Supabase dashboard
- Verify your redirect URLs match exactly

### OAuth redirect not working
- Check that your redirect URLs are correctly configured in both the provider (Google/Apple) and Supabase
- Ensure you're using HTTPS in production

### Users not appearing in database
- OAuth users are automatically created in Supabase Auth
- No additional backend setup is required
- Check the Supabase Authentication > Users section to see OAuth users

---

## Current Implementation

The app currently supports:
- ✅ Email/Password authentication
- ✅ Google OAuth sign-in/sign-up
- ✅ Apple OAuth sign-in/sign-up
- ✅ Automatic session management
- ✅ Secure token handling
- ✅ OAuth callback handling

All user authentication is handled by Supabase Auth with automatic user creation and session management.
