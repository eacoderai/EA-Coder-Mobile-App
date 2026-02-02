import React, { useState, useEffect } from "react";
import { MessageCircleQuestion, Search, Play, Mail, HelpCircle, X, ChevronRight, MessageSquare, FileText, Send, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { trackEvent } from "../utils/analytics";

export interface HelpBubbleProps {
  className?: string;
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

export const HelpBubble: React.FC<HelpBubbleProps> = ({ className, activeTab = "home" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Analytics tracking
  useEffect(() => {
    if (isOpen) {
      trackEvent("help_bubble_opened", { context: activeTab });
    }
  }, [isOpen, activeTab]);

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

  const contextInfo = CONTEXT_HELP[activeTab] || CONTEXT_HELP['home'];

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
    trackEvent("help_bubble_clicked", { context: activeTab });
  };

  return (
    <>
      <div 
        className="fixed z-[9999] flex items-center justify-center"
        style={{ 
          bottom: 'calc(4rem + 12px + env(safe-area-inset-bottom, 0px))',
          right: '1rem'
        }}
      >
        <Button
          type="button"
          className="rounded-full w-14 h-14 shadow-xl bg-blue-600 hover:bg-blue-700 text-white transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center pointer-events-auto"
          aria-label="Open Help Center"
          onClick={handleOpen}
        >
          <MessageCircleQuestion className="w-7 h-7" />
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent 
          className="max-w-md w-full h-[85vh] max-h-[800px] flex flex-col p-0 gap-0 overflow-hidden rounded-3xl border border-border/50 shadow-2xl bg-white dark:bg-zinc-950"
          hideCloseButton
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md">
            <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-full text-primary">
                <HelpCircle className="w-5 h-5" />
              </div>
              Help Center
            </DialogTitle>
            <DialogClose asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-full hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 opacity-70" />
              </Button>
            </DialogClose>
          </div>

          <Tabs defaultValue="context" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 py-3 border-b border-border/40 bg-muted/10 shrink-0">
              <TabsList className="w-full grid grid-cols-4 h-11 p-1 bg-muted/60 rounded-xl gap-1">
                <TabsTrigger 
                  value="context" 
                  className="rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                >
                  Context
                </TabsTrigger>
                <TabsTrigger 
                  value="faq" 
                  className="rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                >
                  FAQ
                </TabsTrigger>
                <TabsTrigger 
                  value="videos" 
                  className="rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                >
                  Videos
                </TabsTrigger>
                <TabsTrigger 
                  value="contact" 
                  className="rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                >
                  Contact
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Contextual Help Tab */}
            <TabsContent value="context" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col focus-visible:outline-none">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  {/* Active Section Card */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900/50 p-6 shadow-sm">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <FileText className="w-24 h-24 text-blue-600" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
                      Current Section
                    </h3>
                    <h2 className="text-2xl font-bold text-blue-950 dark:text-blue-50 mb-3">
                      {contextInfo.title}
                    </h2>
                    <p className="text-sm text-blue-900/80 dark:text-blue-100/80 leading-relaxed max-w-[90%]">
                      {contextInfo.content}
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2 px-1">
                      <Search className="w-4 h-4" /> Suggested Actions
                    </h3>
                    <div className="grid gap-3">
                      {activeTab === 'home' && (
                        <Button 
                          variant="outline" 
                          className="w-full justify-between h-auto py-4 px-5 rounded-xl border-border/60 hover:border-primary/50 hover:bg-primary/5 group transition-all"
                        >
                          <span className="font-medium">How to create a strategy?</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        className="w-full justify-between h-auto py-4 px-5 rounded-xl border-border/60 hover:border-primary/50 hover:bg-primary/5 group transition-all"
                      >
                        <span className="font-medium">Troubleshooting Guide</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                       <Button 
                        variant="outline" 
                        className="w-full justify-between h-auto py-4 px-5 rounded-xl border-border/60 hover:border-primary/50 hover:bg-primary/5 group transition-all"
                      >
                        <span className="font-medium">View Documentation</span>
                        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* FAQ Tab */}
            <TabsContent value="faq" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col focus-visible:outline-none">
              <div className="px-6 py-4 border-b border-border/40 bg-background/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search for answers..."
                    className="pl-10 h-11 rounded-xl bg-muted/50 border-transparent focus:bg-background transition-colors"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
              </div>
              <ScrollArea className="h-full">
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
                            className="border border-border/60 rounded-xl px-4 bg-card/50 data-[state=open]:bg-card data-[state=open]:border-primary/20 data-[state=open]:shadow-sm transition-all duration-200"
                          >
                            <AccordionTrigger className="text-sm font-medium hover:no-underline py-4 [&[data-state=open]>svg]:rotate-180 [&[data-state=open]]:text-primary text-left">
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
              </ScrollArea>
            </TabsContent>

            {/* Videos Tab */}
            <TabsContent value="videos" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col focus-visible:outline-none">
              <ScrollArea className="h-full">
                <div className="p-6 grid gap-5">
                  {VIDEO_TUTORIALS.map((video) => (
                    <div 
                      key={video.id} 
                      className="group relative flex flex-col sm:flex-row gap-4 p-3 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer overflow-hidden"
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
                        <h3 className="font-semibold text-base leading-tight mb-2 group-hover:text-primary transition-colors">
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
              </ScrollArea>
            </TabsContent>

            {/* Contact Tab */}
            <TabsContent value="contact" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col focus-visible:outline-none">
              <ScrollArea className="h-full">
                <div className="p-6 h-full flex flex-col">
                  {showSuccess ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
                      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <Send className="w-10 h-10 text-green-600 dark:text-green-400" />
                      </div>
                      <h3 className="text-2xl font-bold mb-3">Message Sent!</h3>
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
                        <Label htmlFor="subject" className="text-sm font-medium ml-1">Subject</Label>
                        <div className="relative">
                          <Input
                            id="subject"
                            placeholder="What's this about?"
                            value={contactForm.subject}
                            onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                            required
                            list="subjects"
                            className="h-12 rounded-xl bg-muted/30 focus:bg-background transition-all"
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
                        <Label htmlFor="message" className="text-sm font-medium ml-1">Message</Label>
                        <Textarea
                          id="message"
                          placeholder="Tell us more about what you need help with..."
                          className="min-h-[160px] rounded-xl bg-muted/30 focus:bg-background transition-all resize-none p-4 leading-relaxed"
                          value={contactForm.message}
                          onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                          required
                        />
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all mt-2" 
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Sending...
                          </>
                        ) : (
                          "Send Message"
                        )}
                      </Button>

                      <div className="pt-6 mt-2">
                        <div className="rounded-xl bg-muted/50 p-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center shrink-0 shadow-sm">
                             <Mail className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Direct Support</p>
                            <p className="text-sm font-medium select-all">support@eacoder.com</p>
                          </div>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
};
