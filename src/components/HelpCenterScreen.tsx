import React, { useState, useEffect } from "react";
import { Search, Play, HelpCircle, ChevronRight, FileText, Send, ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { trackEvent } from "../utils/analytics";

export interface HelpCenterScreenProps {
  onNavigate: (screen: string) => void;
  activeTab?: string;
}

// Mock Data for Help Content
const FAQ_DATA = [
  {
    category: "General",
    questions: [
      { q: "What is EA Coder?", a: "EA Coder is an AI-powered assistant that helps you generate, analyze, and convert trading strategies for platforms like MetaTrader 4, MetaTrader 5, and TradingView." },
      { q: "Is it free to use?", a: "We offer a Free plan with limited generations. For unlimited access and advanced features, you can upgrade to Pro or Elite plans." },
    ]
  },
  {
    category: "Strategy Generation",
    questions: [
      { q: "How do I create a strategy?", a: "Go to the 'Home' tab and click 'Create New Strategy'. Describe your trading logic in plain English, and our AI will generate the code for you." },
      { q: "What platforms are supported?", a: "Currently, we support MQL4 (MT4), MQL5 (MT5), and Pine Script (TradingView)." },
    ]
  },
  {
    category: "Analysis & Conversion",
    questions: [
      { q: "How does analysis work?", a: "Upload your strategy file in the 'Analyze' tab. The AI will review the code, explain logic, and suggest improvements." },
      { q: "Can I convert MT4 code to MT5?", a: "Yes! Use the 'Convert' tab to transform strategies between MQL4, MQL5, and Pine Script." },
    ]
  },
  {
    category: "Subscriptions & Billing",
    questions: [
      { q: "How do I cancel my subscription?", a: "You can manage or cancel your subscription anytime from the Profile > Subscription settings." },
      { q: "Do you offer refunds?", a: "We generally do not offer refunds for partial months, but please contact support if you have a specific issue." },
    ]
  }
];

const CONTEXT_HELP: Record<string, { title: string; content: string }> = {
  home: { title: "Home Dashboard", content: "Manage your generated strategies, view status updates, and start new creations here." },
  analyze: { title: "Strategy Analysis", content: "Upload existing code files to get detailed breakdowns, logic explanations, and optimization tips." },
  chat: { title: "AI Assistant", content: "Chat directly with the AI to refine your strategies, ask coding questions, or troubleshoot errors." },
  convert: { title: "Code Converter", content: "Transform your strategies between different trading platforms (e.g., MT4 to TradingView) instantly." },
  profile: { title: "User Profile", content: "Manage your subscription, view usage stats, and update account settings." },
  submit: { title: "Strategy Creator", content: "Describe your strategy rules clearly. Include entry/exit conditions, risk management, and indicators." },
};

const VIDEO_TUTORIALS = [
  { id: 1, title: "Getting Started with EA Coder", duration: "3:45", thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" }, // Placeholder ID
  { id: 2, title: "How to Create a Profitable Strategy", duration: "5:20", thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
  { id: 3, title: "Using the Code Converter", duration: "2:15", thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
];

export function HelpCenterScreen({ onNavigate, activeTab = "home" }: HelpCenterScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Analytics tracking
  useEffect(() => {
    trackEvent("help_center_viewed", { context: activeTab });
  }, [activeTab]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    trackEvent("help_search", { query: e.target.value });
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setContactForm({ subject: "", message: "" });
      trackEvent("support_ticket_submitted", { subject: contactForm.subject });
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const filteredFAQ = FAQ_DATA.map(cat => ({
    ...cat,
    questions: cat.questions.filter(q => 
      q.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      q.a.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.questions.length > 0);

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  const contextInfo = CONTEXT_HELP[activeTab] || CONTEXT_HELP['home'];

  const SharedTabsList = () => (
    <div className="px-4 py-3 shrink-0 border-b border-border">
      <TabsList className="w-full grid grid-cols-4 h-auto gap-1 bg-transparent">
        <TabsTrigger 
          value="context" 
          className="rounded-lg text-xs font-medium py-2.5 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none transition-all"
        >
          Context
        </TabsTrigger>
        <TabsTrigger 
          value="faq" 
          className="rounded-lg text-xs font-medium py-2.5 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none transition-all"
        >
          FAQ
        </TabsTrigger>
        <TabsTrigger 
          value="videos" 
          className="rounded-lg text-xs font-medium py-2.5 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none transition-all"
        >
          Videos
        </TabsTrigger>
        <TabsTrigger 
          value="contact" 
          className="rounded-lg text-xs font-medium py-2.5 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none transition-all"
        >
          Contact
        </TabsTrigger>
      </TabsList>
    </div>
  );

  return (
    <div className="h-[100dvh] overflow-hidden bg-background flex flex-col text-foreground">
      {/* Header */}
      <div 
        className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-800 text-white border-b border-border shadow-md"
        style={{ borderBottomLeftRadius: '30px', borderBottomRightRadius: '30px' }}
      >
        <div className="app-container px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-white/20 text-white hover:text-white"
              onClick={() => onNavigate(activeTab === 'home' ? 'home' : activeTab)} // Go back to where we came from
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full text-white backdrop-blur-sm">
                <HelpCircle className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">
                Help Center
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="app-container flex-1 flex flex-col overflow-hidden min-h-0">
        <Tabs defaultValue="context" className="flex-1 flex flex-col min-h-0 h-full">
          {/* Contextual Help Tab */}
          <TabsContent value="context" className="flex-1 m-0 data-[state=active]:flex flex-col focus-visible:outline-none min-h-0 h-full">
            <SharedTabsList />
            <div className="flex-1 overflow-y-auto pb-4 safe-nav-pad">
              <div className="p-6 space-y-6 min-h-full flex flex-col">
                {/* Active Section Card */}
                <div 
                  className="relative overflow-hidden p-6 flex-1"
                  style={glassCardStyle}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <FileText className="w-24 h-24 text-primary" />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                    Current Section
                  </h3>
                  <h2 className="text-2xl font-bold text-foreground mb-3">
                    {contextInfo.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[90%]">
                    {contextInfo.content}
                  </p>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2 px-1">
                    <Search className="w-4 h-4" /> Suggested Actions
                  </h3>
                  <div className="flex flex-col gap-3">
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto py-4 px-8 transition-all flex items-center whitespace-normal"
                      style={glassCardStyle}
                      onClick={() => onNavigate('home')}
                    >
                      <span className="font-medium text-foreground text-left flex-1 mr-2 pl-2 py-0 my-auto">How to create a strategy?</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto py-4 px-8 transition-all flex items-center whitespace-normal"
                      style={glassCardStyle}
                    >
                      <span className="font-medium text-foreground text-left flex-1 mr-2 pl-2 py-0 my-auto">Troubleshooting Guide</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Button>
                     <Button 
                      variant="outline" 
                      className="w-full justify-between h-auto py-4 px-8 transition-all flex items-center whitespace-normal"
                      style={glassCardStyle}
                    >
                      <span className="font-medium text-foreground text-left flex-1 mr-2 pl-2 py-0 my-auto">View Documentation</span>
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* FAQ Tab */}
          <TabsContent value="faq" className="flex-1 m-0 data-[state=active]:flex flex-col focus-visible:outline-none min-h-0 h-full">
            <SharedTabsList />
            <div className="px-6 py-4">
              <div className="relative">
                <Input
                  type="search"
                  placeholder="Search for answers..."
                  className="px-4 h-11 bg-background border-input focus:ring-1 focus:ring-ring transition-colors"
                  style={{ borderRadius: '25px', ...glassCardStyle, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pb-24 safe-nav-pad">
              <div className="p-6">
                <Accordion type="single" collapsible className="w-full space-y-4">
                  {filteredFAQ.map((category, idx) => (
                    <div key={idx} className="space-y-3">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
                        {category.category}
                      </h4>
                      <div className="space-y-2">
                      {category.questions.map((q, qIdx) => (
                        <AccordionItem 
                          key={qIdx} 
                          value={`item-${idx}-${qIdx}`}
                          className="px-4 transition-all duration-200"
                          style={glassCardStyle}
                        >
                          <AccordionTrigger className="text-sm font-medium hover:no-underline py-4 items-center [&>svg]:translate-y-0 [&[data-state=open]>svg]:rotate-180 [&[data-state=open]]:text-primary text-left text-foreground">
                            {q.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                            {q.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                      </div>
                    </div>
                  ))}
                  {filteredFAQ.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <Search className="w-12 h-12 mb-4 opacity-20" />
                      <p className="font-medium">No results found</p>
                      <p className="text-sm">Try searching for something else</p>
                    </div>
                  )}
                </Accordion>
              </div>
            </div>
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos" className="flex-1 m-0 data-[state=active]:flex flex-col focus-visible:outline-none min-h-0 h-full">
            <SharedTabsList />
            <div className="flex-1 overflow-y-auto pb-24 safe-nav-pad">
              <div className="p-6 grid gap-5">
                {VIDEO_TUTORIALS.map((video) => (
                  <div 
                    key={video.id} 
                    className="group relative flex flex-col sm:flex-row gap-4 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer overflow-hidden"
                  >
                    <div className="relative aspect-video sm:w-40 shrink-0 rounded-xl overflow-hidden bg-muted">
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                           <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                        </div>
                      </div>
                      <img 
                        src={video.thumbnail} 
                        alt={video.title}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />
                      <Badge className="absolute bottom-2 right-2 h-5 px-1.5 text-[10px] bg-black/80 hover:bg-black/80 text-white border-0">
                        {video.duration}
                      </Badge>
                    </div>
                    <div className="flex flex-col justify-center py-1 pr-2">
                      <h3 className="font-semibold text-base leading-tight mb-2 text-foreground group-hover:text-primary transition-colors">
                        {video.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        Learn how to master this feature in just a few minutes.
                      </p>
                      <div className="flex items-center gap-2 text-xs font-medium text-primary">
                        Watch Now <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Contact Tab */}
          <TabsContent value="contact" className="flex-1 m-0 data-[state=active]:flex flex-col focus-visible:outline-none min-h-0 h-full">
            <SharedTabsList />
            <div className="flex-1 overflow-y-auto pb-4 safe-nav-pad">
              <div className="p-6 min-h-full flex flex-col">
                <div style={glassCardStyle} className="p-6 flex-1 flex flex-col justify-center">
                {showSuccess ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <Send className="w-10 h-10 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-foreground">Message Sent!</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      We've received your message and will get back to you at your registered email shortly.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-8"
                      onClick={() => setShowSuccess(false)}
                    >
                      Send another message
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-sm font-medium ml-1 text-foreground">Subject</Label>
                      <div className="relative">
                        <Input
                          id="subject"
                          placeholder="What's this about?"
                          value={contactForm.subject}
                          onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                          required
                          list="subjects"
                          className="h-12 bg-background border-input focus:ring-1 focus:ring-ring transition-all"
                          style={{ borderRadius: '15px' }}
                        />
                        <datalist id="subjects">
                          <option value="Bug Report" />
                          <option value="Feature Request" />
                          <option value="Billing Question" />
                          <option value="Strategy Help" />
                        </datalist>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-sm font-medium ml-1 text-foreground">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us more about what you need help with..."
                        className="min-h-[160px] bg-background border-input focus:ring-1 focus:ring-ring transition-all resize-none p-4 leading-relaxed"
                        style={{ borderRadius: '15px' }}
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                        required
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all mt-4"
                      disabled={isSubmitting}
                      style={{ borderRadius: '25px' }}
                    >
                      {isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                )}
                </div>
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
