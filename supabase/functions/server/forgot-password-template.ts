export function ForgotPasswordTemplate(resetLink: string, userName: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1>Password Reset Request</h1>
    <p>Hello ${userName},</p>
    <p>We received a request to reset your password. Click the link below to set a new password:</p>
    <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
    <p>This link will expire in 24 hours.</p>
    <p>If you didn't request this, please ignore this email.</p>
    <p>Best regards,<br/>EA Coder Team</p>
  </div>
  `;
}
