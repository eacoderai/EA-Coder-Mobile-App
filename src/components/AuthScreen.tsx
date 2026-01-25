﻿﻿﻿import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { TrendingUp, Zap, Eye, EyeOff } from "lucide-react";
import { supabase, getFunctionUrl } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import logoImage from "../assets/1525789d760b07ee395e05af9b06d7202ebb7883.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";

interface AuthScreenProps {
  onAuthenticated: () => void;
  recovery?: boolean;
  resetToken?: string;
}

export const clientStrongPassword = (p: string) => p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
export const clientPasswordsMatch = (a: string, b: string) => a === b;

export function AuthScreen({ onAuthenticated, recovery = false, resetToken }: AuthScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  
  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Signup form
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  
  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Reset password states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(!!resetToken || recovery);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");

  

  // Liquid glass input style
  const liquidGlassInputStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    borderRadius: '24px',
  };

  // Liquid glass card style
  const liquidGlassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    borderRadius: '30px',
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      
      if (error) throw error;
      
      if (data.session) {
        // If a display name was captured during signup, persist it to auth metadata
        try {
          const pendingName = window.localStorage.getItem('pending.display_name');
          const pendingEmail = window.localStorage.getItem('pending.display_email');
          if (pendingName && pendingEmail && pendingEmail === loginEmail) {
            await supabase.auth.updateUser({
              data: {
                display_name: pendingName,
                full_name: pendingName
              }
            });
            window.localStorage.removeItem('pending.display_name');
            window.localStorage.removeItem('pending.display_email');
          }
        } catch (e) {
          console.error('Failed to persist display name:', e);
        }

        toast.success(`Welcome back, ${loginEmail}!`);
        onAuthenticated();
      }
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== signupConfirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    
    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setIsLoading(true);
    
    try {
  const response = await fetch(getFunctionUrl('signup'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          name: signupName,
          display_name: signupName
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Signup failed');
      }
      
      toast.success("Account created! Please click the link sent to your email. Then log in.");
      setActiveTab("login");
      setLoginEmail(signupEmail);
      // Stash the display name to apply on first login
      try {
        window.localStorage.setItem('pending.display_name', signupName);
        window.localStorage.setItem('pending.display_email', signupEmail);
      } catch {}
    } catch (error: any) {
      toast.error(error.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Social OAuth handlers removed per requirements

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-end px-4 pt-4 pb-0"
      style={{
        paddingBottom: 0,
        marginBottom: 0,
        marginLeft: 'calc(-1 * env(safe-area-inset-left))',
        marginRight: 'calc(-1 * env(safe-area-inset-right))',
      }}
    >
      <div className="app-container w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              
              src={logoImage}
              alt="EA Coder Logo"
              className="w-48 h-auto"
              style={{paddingTop: '20px' }}
            />
          </div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white font-normal text-[32px]">EA Coder</h1>
          <p className="text-gray-600 dark:text-gray-400">AI-Powered Expert Advisor Generator</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <Zap className="w-5 h-5 text-blue-600 mb-1" />
            <p className="text-sm text-gray-900 dark:text-white">Generate EAs</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Plain English</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <TrendingUp className="w-5 h-5 text-green-600 mb-1" />
            <p className="text-sm text-gray-900 dark:text-white">AI Analysis</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Backtest Metrics</p>
          </div>
        </div>

        {/* Auth Forms */}
        <Card className="border-none" style={liquidGlassCardStyle}>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>Create an account or log in to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex w-full items-center gap-2 p-0 bg-transparent">
                <TabsTrigger value="login" className="flex-1 rounded-[30px]">Login</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1 rounded-[30px]">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Social Sign In removed */}
                  
                  <div className="flex justify-center text-xs uppercase pt-4">
                    <span className="text-muted-foreground">
                      Sign up with Email and Password
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="trader@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      name="email"
                      autoComplete="email"
                      required
                      style={liquidGlassInputStyle}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative group w-full">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        name="password"
                        autoComplete="current-password"
                        required
                        className="pr-10"
                        style={liquidGlassInputStyle}
                      />
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        title={showLoginPassword ? "Hide password" : "Show password"}
                        aria-pressed={showLoginPassword}
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowLoginPassword(!showLoginPassword);
                          }
                        }}
                        className="absolute right-0 top-0 h-full w-10 cursor-pointer flex items-center justify-center z-10"
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Log In"}
                  </Button>
                  <div className="text-center">
                  <Button variant="link" className="text-sm" onClick={() => setShowResetModal(true)}>
                      Forgot Password?
                    </Button>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  {/* Social Sign Up removed */}
                  
                  <div className="flex justify-center text-xs uppercase pt-4">
                    <span className="text-muted-foreground">
                      Or log in with email
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Trader"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      name="name"
                      autoComplete="name"
                      required
                      style={liquidGlassInputStyle}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="trader@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      name="email"
                      autoComplete="email"
                      required
                      style={liquidGlassInputStyle}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative group w-full">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        name="new-password"
                        autoComplete="new-password"
                        required
                        className="pr-10"
                        style={liquidGlassInputStyle}
                      />
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={showSignupPassword ? "Hide password" : "Show password"}
                        title={showSignupPassword ? "Hide password" : "Show password"}
                        aria-pressed={showSignupPassword}
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowSignupPassword(!showSignupPassword);
                          }
                        }}
                        className="absolute right-0 top-0 h-full w-10 cursor-pointer flex items-center justify-center z-10"
                      >
                        {showSignupPassword ? (
                          <EyeOff className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <div className="relative group w-full">
                      <Input
                        id="signup-confirm"
                        type={showConfirmPassword ? "text" : "password"}
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        name="confirm-password"
                        autoComplete="new-password"
                        required
                        className="pr-10"
                        style={liquidGlassInputStyle}
                      />
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        title={showConfirmPassword ? "Hide password" : "Show password"}
                        aria-pressed={showConfirmPassword}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowConfirmPassword(!showConfirmPassword);
                          }
                        }}
                        className="absolute right-0 top-0 h-full w-10 cursor-pointer flex items-center justify-center z-10 pb-1"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Sign Up"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            <Dialog open={showSetPasswordModal} onOpenChange={setShowSetPasswordModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Set New Password</DialogTitle>
                  <DialogDescription>
                    Enter and confirm your new password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  {updateError && <p className="text-destructive text-sm">{updateError}</p>}
                  {updateMessage && <p className="text-success text-sm">{updateMessage}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSetPasswordModal(false)}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!clientStrongPassword(newPassword)) {
                        setUpdateError("Password must be at least 8 chars, include upper, lower, number, and symbol");
                        return;
                      }
                      if (!clientPasswordsMatch(newPassword, confirmNewPassword)) {
                        setUpdateError("Passwords don't match");
                        return;
                      }
                      setUpdateLoading(true);
                      setUpdateError("");
                      setUpdateMessage("");
                      try {
                        if (resetToken) {
                          const res = await fetch(getFunctionUrl('reset/confirm'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: resetToken, password: newPassword })
                          });
                          const payload = await res.json();
                          if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to update password');
                          setUpdateMessage("Password updated successfully");
                          setShowSetPasswordModal(false);
                        } else {
                          const { data, error } = await supabase.auth.updateUser({ password: newPassword });
                          if (error) throw error as any;
                          setUpdateMessage("Password updated successfully");
                          setShowSetPasswordModal(false);
                          if (data?.user) onAuthenticated();
                        }
                      } catch (e: any) {
                        setUpdateError(e?.message || "Failed to update password");
                      } finally {
                        setUpdateLoading(false);
                      }
                    }}
                    disabled={updateLoading}
                  >
                    {updateLoading ? "Updating..." : "Update Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>
                    Enter your email address to receive a password reset link.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="trader@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                  {resetError && <p className="text-destructive text-sm">{resetError}</p>}
                  {resetMessage && <p className="text-success text-sm">{resetMessage}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowResetModal(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={async () => {
                      if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
                        setResetError("Please enter a valid email address");
                        return;
                      }
                      setResetLoading(true);
                      setResetError("");
                      setResetMessage("");
                      try {
                        const response = await fetch(getFunctionUrl('reset/request'), {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ email: resetEmail })
                        });

                        if (!response.ok) {
                          let msg = 'Failed to send reset request';
                          try {
                            const errorData = await response.json();
                            msg = errorData?.error || errorData?.message || msg;
                          } catch {}
                          try {
                            const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
                            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, origin ? { redirectTo: origin } : undefined);
                            if (error) throw new Error(error.message || msg);
                          } catch (e: any) {
                            throw new Error(e?.message || msg);
                          }
                        }
                        setResetMessage("Password reset email sent successfully!");
                      } catch (error) {
                        setResetError(error.message || "Failed to send reset email");
                      } finally {
                        setResetLoading(false);
                      }
                    }} 
                    disabled={resetLoading}
                  >
                    {resetLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Disclaimer:</strong> EA Coder generates algorithmic trading code and backtest analysis using AI. 
            This is not financial advice. Always test strategies on a demo account before live trading. 
            Past performance is not indicative of future results.
          </p>
        </div>
      </div>
    </div>
  );
}
