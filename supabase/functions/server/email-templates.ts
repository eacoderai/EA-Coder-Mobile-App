
export function ForgotPasswordTemplate(resetLink: string, userName: string, siteUrl: string): string {
  const homeLink = siteUrl || 'https://eacoderai.xyz';
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
    <h2 style="color: #2563eb; text-align: center;">Reset Your Password</h2>
    <p style="color: #333333; font-size: 16px;">Hello ${userName},</p>
    <p style="color: #555555; font-size: 14px; line-height: 1.5;">
      We received a request to reset the password for your EA Coder account. If you made this request, please click the button below to set a new password:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Reset Password</a>
    </div>
    <p style="color: #555555; font-size: 14px; line-height: 1.5;">
      This link will expire in 24 hours. If you did not request a password reset, you can safely ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
    <p style="color: #999999; font-size: 12px; text-align: center;">
      EA Coder Team<br/>
      <a href="${homeLink}" style="color: #999999; text-decoration: none;">${homeLink}</a>
    </p>
  </div>
  `;
}

export function EmailConfirmationTemplate(confirmLink: string, userName: string, siteUrl: string): string {
  const homeLink = siteUrl || 'https://eacoderai.xyz';
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
    <h2 style="color: #2563eb; text-align: center;">Welcome to EA Coder!</h2>
    <p style="color: #333333; font-size: 16px;">Hello ${userName},</p>
    <p style="color: #555555; font-size: 14px; line-height: 1.5;">
      Thank you for signing up. To get started and access your account, please confirm your email address by clicking the button below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${confirmLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Confirm Email</a>
    </div>
    <p style="color: #555555; font-size: 14px; line-height: 1.5;">
      This link is valid for 24 hours.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
    <p style="color: #999999; font-size: 12px; text-align: center;">
      EA Coder Team<br/>
      <a href="${homeLink}" style="color: #999999; text-decoration: none;">${homeLink}</a>
    </p>
  </div>
  `;
}
